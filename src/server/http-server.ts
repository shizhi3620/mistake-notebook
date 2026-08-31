import {
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

import type {
  LearningLoop,
  MistakeFilters,
  QuestionRecognition,
} from "../learning-loop.ts";
import {
  InMemoryIdempotencyStore,
  type IdempotencyStore,
} from "./idempotency-store.ts";
import { assertCloudBaseFileOwnership } from "../adapters/cloudbase-storage.ts";

export type LearningLoopServerDependencies = {
  learningLoop: LearningLoop;
  healthCheck?: () => Promise<void>;
  photoStorage?: {
    verifyUploadedFile(input: {
      fileId: string;
      expectedImageKey: string;
    }): Promise<{ imageUrl: string }>;
  };
  log?: (event: HttpRequestLogEvent) => void;
  weChatIdentityResolver?: (
    temporaryCode: string,
  ) => Promise<{ subject: string }>;
  recognitionClient?: (input: {
    imageDataUrl: string;
  }) => Promise<QuestionRecognition>;
  maxAiRequestsPerMinute?: number;
  maxAiRequestsPerMonth?: number;
  reminderSchedulerSecret?: string;
  idempotencyStore?: IdempotencyStore;
};

export type HttpRequestLogEvent = {
  event: "http_request";
  requestId: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
};

export class AiRateLimiter {
  private readonly requests = new Map<string, number[]>();
  constructor(private readonly maxRequestsPerMinute = 30, private readonly now: () => number = Date.now) {}
  allow(key: string): boolean {
    const current = this.now();
    const recent = (this.requests.get(key) ?? []).filter((timestamp) => current - timestamp < 60_000);
    if (recent.length >= this.maxRequestsPerMinute) { this.requests.set(key, recent); return false; }
    recent.push(current); this.requests.set(key, recent); return true;
  }
  remaining(key: string): number {
    const current = this.now();
    const recent = (this.requests.get(key) ?? []).filter((timestamp) => current - timestamp < 60_000);
    this.requests.set(key, recent);
    return Math.max(0, this.maxRequestsPerMinute - recent.length);
  }
}

export class AiUsageLedger {
  private readonly usage = new Map<string, { month: string; count: number }>();
  constructor(private readonly monthlyLimit = 500, private readonly now: () => number = Date.now) {}
  consume(key: string): { allowed: boolean; used: number; limit: number } {
    const month = new Date(this.now()).toISOString().slice(0, 7);
    const previous = this.usage.get(key);
    const entry = previous?.month === month ? previous : { month, count: 0 };
    if (entry.count >= this.monthlyLimit) return { allowed: false, used: entry.count, limit: this.monthlyLimit };
    entry.count += 1; this.usage.set(key, entry);
    return { allowed: true, used: entry.count, limit: this.monthlyLimit };
  }
}

export function createLearningLoopServer(
  dependencies: LearningLoopServerDependencies,
): Server {
  const { learningLoop, recognitionClient, weChatIdentityResolver, photoStorage, healthCheck } = dependencies;
  const log = dependencies.log ?? (() => {});
  const maxAiRequestsPerMinute = Math.max(1, dependencies.maxAiRequestsPerMinute ?? 30);
  const aiRateLimiter = new AiRateLimiter(maxAiRequestsPerMinute);
  const aiUsageLedger = new AiUsageLedger(dependencies.maxAiRequestsPerMonth ?? 500);
  const idempotencyStore = dependencies.idempotencyStore ?? new InMemoryIdempotencyStore();

  return createServer((request, response) => {
    const requestId = randomUUID();
    const startedAt = Date.now();
    const url = new URL(request.url ?? "/", "http://localhost");
    response.setHeader("x-request-id", requestId);
    response.once("finish", () => {
      log({
        event: "http_request",
        requestId,
        method: request.method ?? "GET",
        path: url.pathname,
        status: response.statusCode,
        durationMs: Date.now() - startedAt,
      });
    });
    void handle(request, response).catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Unexpected server error.";
      if (isStorageFailure(error)) {
        void send(response, 503, { error: "storage_unavailable" });
        return;
      }
      const status = /log in again/i.test(message) ? 401 : 400;
      void send(response, status, { error: message });
    });
  });

  async function handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const url = new URL(request.url ?? "/", "http://localhost");
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = request.method ?? "GET";

    const aiRoute = path.includes("/recognition") || path.endsWith("/explanation") || path.includes("/homework");
    if (aiRoute) {
      const now = Date.now();
      const key = request.headers.authorization?.replace(/^Bearer\s+/i, "") || request.headers["x-forwarded-for"]?.toString().split(",")[0].trim() || request.socket.remoteAddress || "unknown";
      response.setHeader("x-ai-rate-limit", String(maxAiRequestsPerMinute));
      const usage = aiUsageLedger.consume(key);
      response.setHeader("x-ai-monthly-limit", String(usage.limit));
      response.setHeader("x-ai-monthly-used", String(usage.used));
      if (!usage.allowed) { await send(response, 429, { error: "ai_quota_exceeded", retryAfterSeconds: 3600 }); return; }
      if (!aiRateLimiter.allow(key)) {
        response.setHeader("x-ai-rate-limit-remaining", "0");
        await send(response, 429, { error: "ai_rate_limited", retryAfterSeconds: 60 });
        return;
      }
      response.setHeader("x-ai-rate-limit-remaining", String(aiRateLimiter.remaining(key)));
    }

    if (method === "GET" && path === "/healthz") {
      try {
        await healthCheck?.();
        await send(response, 200, { status: "ok" });
      } catch {
        await send(response, 503, { status: "unavailable", error: "storage_unavailable" });
      }
      return;
    }

    if (method === "POST" && path === "/internal/reminders/dispatch") {
      const configuredSecret = dependencies.reminderSchedulerSecret;
      if (!configuredSecret) {
        await send(response, 404, { error: "Not found." });
        return;
      }
      const suppliedSecret = String(request.headers["x-scheduler-secret"] ?? "");
      const expected = Buffer.from(configuredSecret);
      const supplied = Buffer.from(suppliedSecret);
      if (
        expected.length !== supplied.length ||
        !timingSafeEqual(expected, supplied)
      ) {
        await send(response, 401, { error: "Unauthorized." });
        return;
      }
      await send(response, 200, {
        outcomes: await learningLoop.dispatchDueRemindersAsync(),
      });
      return;
    }

    if (!path.startsWith("/api/")) {
      send(response, 404, { error: "Not found." });
      return;
    }

    const route = path.slice(4);
    const body = await readJsonBody(request);

    if (method === "POST" && route === "/session") {
      if (!weChatIdentityResolver) {
        throw new Error("WeChat login is not configured.");
      }
      const identity = await weChatIdentityResolver(String(body?.code ?? ""));
      send(
        response,
        200,
        await learningLoop.startWeChatLoginAsync(identity.subject),
      );
      return;
    }

    const guardian = await learningLoop.resumeSessionAsync(bearerToken(request));
    const auth = guardian.id;

    if (method === "POST" && route === "/guardianship/confirm") {
      return send(response, 200, await learningLoop.confirmGuardianshipAsync(auth));
    }
    if (method === "GET" && route === "/children") {
      return send(response, 200, await learningLoop.listChildProfilesAsync(auth));
    }
    if (method === "POST" && route === "/children") {
      return send(response, 200, await learningLoop.createChildProfileAsync(auth, body));
    }
    if (method === "GET" && route === "/home") {
      return send(response, 200, await learningLoop.getHomeOverviewAsync(auth));
    }
    if (method === "GET" && route === "/entitlements") {
      return send(response, 200, await learningLoop.getEntitlementsAsync(auth));
    }
    if (method === "DELETE" && route === "/account") {
      await learningLoop.deleteParentAccountAsync(auth);
      return send(response, 200, { ok: true });
    }
    if (method === "PUT" && route === "/settings/answer-reveal") {
      return send(
        response,
        200,
        await learningLoop.setAnswerRevealPreferenceAsync(auth, Boolean(body?.allow)),
      );
    }
    if (method === "POST" && route === "/subscription") {
      return send(
        response,
        200,
        await learningLoop.grantSubscriptionAsync(auth, body?.plan),
      );
    }
    if (method === "POST" && route === "/drafts") {
      return send(
        response,
        200,
        await learningLoop.startQuestionDraftAsync(
          auth,
          String(body?.childProfileId),
          body?.source,
        ),
      );
    }
    if (method === "POST" && route === "/homework-reviews") {
      return send(
        response,
        200,
        await learningLoop.createHomeworkReviewAsync(
          auth,
          String(body?.childProfileId),
          body?.recognition,
        ),
      );
    }
    if (method === "POST" && route === "/reviews") {
      return send(
        response,
        200,
        await learningLoop.startReviewAsync(auth, String(body?.mistakeId), {
          exercise: body?.exercise,
        }),
      );
    }
    if (method === "GET" && route === "/reviews/due") {
      return send(
        response,
        200,
        await learningLoop.getDueReviewsAsync(
          auth,
          String(url.searchParams.get("childProfileId")),
        ),
      );
    }
    if (method === "GET" && route === "/mistakes") {
      const filters: MistakeFilters = {};
      for (const key of [
        "knowledgePoint",
        "mistakeCause",
        "masteryStatus",
        "keyword",
      ] as const) {
        const value = url.searchParams.get(key);
        if (value) {
          (filters as Record<string, unknown>)[key] = value;
        }
      }
      for (const key of ["createdFrom", "createdTo"] as const) {
        const value = url.searchParams.get(key);
        if (value) {
          filters[key] = Number(value);
        }
      }
      return send(
        response,
        200,
        await learningLoop.listMistakesAsync(
          auth,
          String(url.searchParams.get("childProfileId")),
          filters,
        ),
      );
    }
    if (method === "GET" && route === "/reports/weekly") {
      return send(
        response,
        200,
        await learningLoop.getWeeklyReportAsync(
          auth,
          String(url.searchParams.get("childProfileId")),
        ),
      );
    }

    const childMatch = match(route, "/children/:id");
    if (method === "PATCH" && childMatch) {
      return send(
        response,
        200,
        await learningLoop.updateChildProfileAsync(auth, childMatch.id, body),
      );
    }
    const childSelectMatch = match(route, "/children/:id/select");
    if (method === "POST" && childSelectMatch) {
      await learningLoop.selectChildProfileAsync(auth, childSelectMatch.id);
      return send(response, 200, { ok: true });
    }
    if (method === "DELETE" && childMatch) {
      await learningLoop.deleteChildProfileAsync(auth, childMatch.id);
      return send(response, 200, { ok: true });
    }
    const childRemindersMatch = match(route, "/children/:id/reminders");
    if (method === "PUT" && childRemindersMatch) {
      return send(
        response,
        200,
        await learningLoop.updateReminderSettingsAsync(auth, childRemindersMatch.id, {
          enabled: Boolean(body?.enabled),
          hourOfDay: Number(body?.hourOfDay),
        }),
      );
    }

    const draftMatch = match(route, "/drafts/:id");
    if (method === "PATCH" && draftMatch) {
      return send(
        response,
        200,
        await learningLoop.updateQuestionDraftAsync(auth, draftMatch.id, {
          crop: body?.crop,
          rotationDegrees: body?.rotationDegrees,
        }),
      );
    }
    if (method === "DELETE" && draftMatch) {
      await learningLoop.cancelQuestionDraftAsync(auth, draftMatch.id);
      return send(response, 200, { ok: true });
    }
    const draftPhotoMatch = match(route, "/drafts/:id/photo");
    if (method === "POST" && draftPhotoMatch) {
      if (body?.fileId && body?.uploadToken) {
        const credential = await learningLoop.getPhotoUploadCredentialAsync(
          auth,
          String(body.uploadToken),
        );
        if (credential.draftId !== draftPhotoMatch.id) throw new Error("Upload credential is not available for this draft.");
        const fileId = String(body.fileId);
        assertCloudBaseFileOwnership(fileId, credential.imageKey);
        const suppliedImageDataUrl = String(body.imageDataUrl ?? "");
        const suppliedImageUrl = String(body.imageUrl ?? "");
        const uploaded = suppliedImageDataUrl
          ? { imageUrl: validateRecognitionImageDataUrl(suppliedImageDataUrl) }
          : suppliedImageUrl.startsWith("https://")
          ? { imageUrl: suppliedImageUrl }
          : photoStorage
            ? await photoStorage.verifyUploadedFile({
                fileId,
                expectedImageKey: credential.imageKey,
              })
            : (() => {
                throw new Error(
                  "Photo storage URL is not available. Configure client-side CloudBase temporary URL or server storage credentials.",
                );
              })();
        await learningLoop.completePhotoUploadAsync(
          auth,
          credential.uploadToken,
          fileId,
        );
        if (!recognitionClient) {
          throw new Error("题目识别服务未配置。请返回手动录入。");
        }
        return send(
          response,
          200,
          await learningLoop.recordQuestionRecognitionAsync(
            auth,
            draftPhotoMatch.id,
            await recognitionClient({ imageDataUrl: uploaded.imageUrl }),
          ),
        );
      }
      const credential = await learningLoop.requestPhotoUploadAsync(
        auth,
        draftPhotoMatch.id,
      );
      await learningLoop.completePhotoUploadAsync(auth, credential.uploadToken);

      if (!recognitionClient) {
        throw new Error(
          "题目识别服务未配置。请在服务端设置 DEEPSEEK_API_KEY 后重启，或返回手动录入。",
        );
      }

      return send(
        response,
        200,
        await learningLoop.recordQuestionRecognitionAsync(
          auth,
          draftPhotoMatch.id,
          await recognitionClient({
            imageDataUrl: String(body?.imageDataUrl ?? ""),
          }),
        ),
      );
    }
    const draftPhotoCredentialMatch = match(route, "/drafts/:id/photo-credential");
    if (method === "POST" && draftPhotoCredentialMatch) {
      const credential = await learningLoop.requestPhotoUploadAsync(
        auth,
        draftPhotoCredentialMatch.id,
      );
      return send(
        response,
        200,
        {
          uploadToken: credential.uploadToken,
          imageKey: credential.imageKey,
          expiresAt: credential.expiresAt,
        },
      );
    }
    const draftConfirmMatch = match(route, "/drafts/:id/confirm");
    if (method === "POST" && draftConfirmMatch) {
      return sendIdempotent(
        request,
        response,
        auth,
        `confirm-question:${draftConfirmMatch.id}`,
        () => learningLoop.confirmQuestionAsync(auth, draftConfirmMatch.id, {
            stem: String(body?.stem ?? ""),
            studentAnswer: body?.studentAnswer,
          }),
      );
    }

    const homeworkReviewMatch = match(route, "/homework-reviews/:id");
    if (method === "GET" && homeworkReviewMatch) {
      return send(
        response,
        200,
        await learningLoop.getHomeworkReviewAsync(auth, homeworkReviewMatch.id),
      );
    }
    const homeworkQuestionConfirmMatch = match(
      route,
      "/homework-reviews/:reviewId/questions/:candidateId/confirm",
    );
    if (method === "POST" && homeworkQuestionConfirmMatch) {
      return sendIdempotent(
        request,
        response,
        auth,
        `confirm-homework:${homeworkQuestionConfirmMatch.candidateId}`,
        () => learningLoop.confirmHomeworkQuestionAsync(
            auth,
            homeworkQuestionConfirmMatch.reviewId,
            homeworkQuestionConfirmMatch.candidateId,
            {
            verdict: body?.verdict,
            stem: body?.stem,
            studentAnswer: body?.studentAnswer,
            primaryKnowledgePoint: body?.primaryKnowledgePoint,
            secondaryKnowledgePoints: body?.secondaryKnowledgePoints,
            mistakeCause: body?.mistakeCause,
            },
        ),
      );
    }

    const explanationMatch = match(route, "/questions/:id/explanation");
    if (method === "GET" && explanationMatch) {
      return send(
        response,
        200,
        await learningLoop.getExplanation(auth, explanationMatch.id, {
          revealAnswer: url.searchParams.get("reveal") === "1",
        }),
      );
    }
    const studentAnswerMatch = match(route, "/questions/:id/student-answer");
    if (method === "PUT" && studentAnswerMatch) {
      return send(
        response,
        200,
      await learningLoop.recordStudentAnswerAsync(auth, studentAnswerMatch.id, {
          answer: body?.answer,
          skipAnalysis: body?.skipAnalysis,
        }),
      );
    }
    const mistakeCreateMatch = match(route, "/questions/:id/mistake");
    if (method === "POST" && mistakeCreateMatch) {
      return sendIdempotent(
        request,
        response,
        auth,
        `create-mistake:${mistakeCreateMatch.id}`,
        () => learningLoop.saveMistakeAsync(auth, mistakeCreateMatch.id, {
            primaryKnowledgePoint: String(body?.primaryKnowledgePoint ?? ""),
            secondaryKnowledgePoints: body?.secondaryKnowledgePoints,
            mistakeCause: body?.mistakeCause,
          }),
      );
    }

    const mistakeMatch = match(route, "/mistakes/:id");
    if (method === "PATCH" && mistakeMatch) {
      return send(
        response,
        200,
        await learningLoop.updateMistakeCauseAsync(
          auth,
          mistakeMatch.id,
          String(body?.mistakeCause ?? ""),
        ),
      );
    }
    if (method === "DELETE" && mistakeMatch) {
      await learningLoop.deleteMistakeAsync(auth, mistakeMatch.id);
      return send(response, 200, { ok: true });
    }

    const reviewCompleteMatch = match(route, "/reviews/:id/complete");
    if (method === "POST" && reviewCompleteMatch) {
      return sendIdempotent(
        request,
        response,
        auth,
        `complete-review:${reviewCompleteMatch.id}`,
        () => learningLoop.completeReviewAsync(auth, reviewCompleteMatch.id, {
            selfAssessment: body?.selfAssessment,
            variantCorrect: body?.variantCorrect ?? null,
          }),
      );
    }

    await send(response, 404, { error: "Not found." });
  }

  async function sendIdempotent(
    request: IncomingMessage,
    response: ServerResponse,
    parentAccountId: string,
    operation: string,
    produce: () => Promise<unknown>,
  ): Promise<void> {
    const keyHeader = request.headers["idempotency-key"];
    const key = Array.isArray(keyHeader) ? keyHeader[0] : keyHeader;
    if (!key) return send(response, 200, await produce());
    if (key.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
      return send(response, 400, { error: "Invalid Idempotency-Key." });
    }
    const claim = await idempotencyStore.claim(parentAccountId, operation, key);
    if (claim.state === "completed") return send(response, 200, claim.response);
    if (claim.state === "pending") {
      return send(response, 409, { error: "idempotency_request_in_progress" });
    }
    try {
      const result = await produce();
      await idempotencyStore.complete(parentAccountId, operation, key, result);
      return send(response, 200, result);
    } catch (error) {
      await idempotencyStore.release(parentAccountId, operation, key);
      throw error;
    }
  }
}

function validateRecognitionImageDataUrl(value: string): string {
  if (!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error("Recognition image must be a JPEG, PNG, or WebP data URL.");
  }
  if (value.length > 8_000_000) {
    throw new Error("Recognition image is too large.");
  }
  return value;
}


function match(
  route: string,
  pattern: string,
): Record<string, string> | undefined {
  const routeSegments = route.split("/").filter(Boolean);
  const patternSegments = pattern.split("/").filter(Boolean);

  if (routeSegments.length !== patternSegments.length) {
    return undefined;
  }

  const params: Record<string, string> = {};
  for (let index = 0; index < patternSegments.length; index += 1) {
    const patternSegment = patternSegments[index]!;
    const routeSegment = routeSegments[index]!;
    if (patternSegment.startsWith(":")) {
      params[patternSegment.slice(1)] = decodeURIComponent(routeSegment);
    } else if (patternSegment !== routeSegment) {
      return undefined;
    }
  }

  return params;
}

function bearerToken(request: IncomingMessage): string {
  const header = request.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

async function readJsonBody(request: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(chunk as Buffer);
  }

  if (chunks.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

async function send(
  response: ServerResponse,
  status: number,
  payload: unknown | Promise<unknown>,
): Promise<void> {
  const resolvedPayload = await payload;
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(resolvedPayload));
}

function isStorageFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; name?: unknown; message?: unknown };
  if (
    typeof candidate.code === "string" &&
    /^(ECONNREFUSED|ECONNRESET|ETIMEDOUT|PROTOCOL_CONNECTION_LOST|ER_LOCK_DEADLOCK|ER_LOCK_WAIT_TIMEOUT)$/.test(candidate.code)
  ) {
    return true;
  }
  return (
    candidate.name === "StorageUnavailableError" ||
    (typeof candidate.message === "string" &&
      /(?:mysql|database|storage)\s+(?:connection|unavailable|query|timeout)/i.test(candidate.message))
  );
}
