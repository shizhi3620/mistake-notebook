import {
  randomUUID,
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

export type LearningLoopServerDependencies = {
  learningLoop: LearningLoop;
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
};

export type HttpRequestLogEvent = {
  event: "http_request";
  requestId: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
};

export function createLearningLoopServer(
  dependencies: LearningLoopServerDependencies,
): Server {
  const { learningLoop, recognitionClient, weChatIdentityResolver, photoStorage } = dependencies;
  const log = dependencies.log ?? (() => {});

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
      const status = /log in again/i.test(message) ? 401 : 400;
      send(response, status, { error: message });
    });
  });

  async function handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const url = new URL(request.url ?? "/", "http://localhost");
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = request.method ?? "GET";

    if (method === "GET" && path === "/healthz") {
      send(response, 200, { status: "ok" });
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
        learningLoop.startWeChatLogin(identity.subject),
      );
      return;
    }

    const guardian = learningLoop.resumeSession(bearerToken(request));
    const auth = guardian.id;

    if (method === "POST" && route === "/guardianship/confirm") {
      return send(response, 200, learningLoop.confirmGuardianship(auth));
    }
    if (method === "GET" && route === "/children") {
      return send(response, 200, learningLoop.listChildProfiles(auth));
    }
    if (method === "POST" && route === "/children") {
      return send(response, 200, learningLoop.createChildProfile(auth, body));
    }
    if (method === "GET" && route === "/home") {
      return send(response, 200, learningLoop.getHomeOverview(auth));
    }
    if (method === "GET" && route === "/entitlements") {
      return send(response, 200, learningLoop.getEntitlements(auth));
    }
    if (method === "PUT" && route === "/settings/answer-reveal") {
      return send(
        response,
        200,
        learningLoop.setAnswerRevealPreference(auth, Boolean(body?.allow)),
      );
    }
    if (method === "POST" && route === "/subscription") {
      return send(
        response,
        200,
        learningLoop.grantSubscription(auth, body?.plan),
      );
    }
    if (method === "POST" && route === "/drafts") {
      return send(
        response,
        200,
        learningLoop.startQuestionDraft(
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
        learningLoop.createHomeworkReview(
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
        await learningLoop.startReview(auth, String(body?.mistakeId), {
          exercise: body?.exercise,
        }),
      );
    }
    if (method === "GET" && route === "/reviews/due") {
      return send(
        response,
        200,
        learningLoop.getDueReviews(
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
        learningLoop.listMistakes(
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
        learningLoop.getWeeklyReport(
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
        learningLoop.updateChildProfile(auth, childMatch.id, body),
      );
    }
    const childSelectMatch = match(route, "/children/:id/select");
    if (method === "POST" && childSelectMatch) {
      learningLoop.selectChildProfile(auth, childSelectMatch.id);
      return send(response, 200, { ok: true });
    }
    if (method === "DELETE" && childMatch) {
      learningLoop.deleteChildProfile(auth, childMatch.id);
      return send(response, 200, { ok: true });
    }
    const childRemindersMatch = match(route, "/children/:id/reminders");
    if (method === "PUT" && childRemindersMatch) {
      return send(
        response,
        200,
        learningLoop.updateReminderSettings(auth, childRemindersMatch.id, {
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
        learningLoop.updateQuestionDraft(auth, draftMatch.id, {
          crop: body?.crop,
          rotationDegrees: body?.rotationDegrees,
        }),
      );
    }
    if (method === "DELETE" && draftMatch) {
      learningLoop.cancelQuestionDraft(auth, draftMatch.id);
      return send(response, 200, { ok: true });
    }
    const draftPhotoMatch = match(route, "/drafts/:id/photo");
    if (method === "POST" && draftPhotoMatch) {
      if (body?.fileId && body?.uploadToken) {
        const credential = learningLoop.completePhotoUpload(
          auth,
          String(body.uploadToken),
        );
        if (!credential.imageKey) {
          throw new Error("Uploaded photo is not attached to this draft.");
        }
        const suppliedImageUrl = String(body.imageUrl ?? "");
        const uploaded = suppliedImageUrl.startsWith("https://")
          ? { imageUrl: suppliedImageUrl }
          : photoStorage
            ? await photoStorage.verifyUploadedFile({
                fileId: String(body.fileId),
                expectedImageKey: credential.imageKey,
              })
            : (() => {
                throw new Error(
                  "Photo storage URL is not available. Configure client-side CloudBase temporary URL or server storage credentials.",
                );
              })();
        if (!recognitionClient) {
          throw new Error("题目识别服务未配置。请返回手动录入。");
        }
        return send(
          response,
          200,
          learningLoop.recordQuestionRecognition(
            auth,
            draftPhotoMatch.id,
            await recognitionClient({ imageDataUrl: uploaded.imageUrl }),
          ),
        );
      }
      const credential = learningLoop.requestPhotoUpload(
        auth,
        draftPhotoMatch.id,
      );
      learningLoop.completePhotoUpload(auth, credential.uploadToken);

      if (!recognitionClient) {
        throw new Error(
          "题目识别服务未配置。请在服务端设置 DEEPSEEK_API_KEY 后重启，或返回手动录入。",
        );
      }

      return send(
        response,
        200,
        learningLoop.recordQuestionRecognition(
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
      return send(
        response,
        200,
        learningLoop.requestPhotoUpload(auth, draftPhotoCredentialMatch.id),
      );
    }
    const draftConfirmMatch = match(route, "/drafts/:id/confirm");
    if (method === "POST" && draftConfirmMatch) {
      return send(
        response,
        200,
        learningLoop.confirmQuestion(auth, draftConfirmMatch.id, {
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
        learningLoop.getHomeworkReview(auth, homeworkReviewMatch.id),
      );
    }
    const homeworkQuestionConfirmMatch = match(
      route,
      "/homework-reviews/:reviewId/questions/:candidateId/confirm",
    );
    if (method === "POST" && homeworkQuestionConfirmMatch) {
      return send(
        response,
        200,
        learningLoop.confirmHomeworkQuestion(
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
        learningLoop.recordStudentAnswer(auth, studentAnswerMatch.id, {
          answer: body?.answer,
          skipAnalysis: body?.skipAnalysis,
        }),
      );
    }
    const mistakeCreateMatch = match(route, "/questions/:id/mistake");
    if (method === "POST" && mistakeCreateMatch) {
      return send(
        response,
        200,
        learningLoop.saveMistake(auth, mistakeCreateMatch.id, {
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
        learningLoop.updateMistakeCause(
          auth,
          mistakeMatch.id,
          String(body?.mistakeCause ?? ""),
        ),
      );
    }
    if (method === "DELETE" && mistakeMatch) {
      learningLoop.deleteMistake(auth, mistakeMatch.id);
      return send(response, 200, { ok: true });
    }

    const reviewCompleteMatch = match(route, "/reviews/:id/complete");
    if (method === "POST" && reviewCompleteMatch) {
      return send(
        response,
        200,
        learningLoop.completeReview(auth, reviewCompleteMatch.id, {
          selfAssessment: body?.selfAssessment,
          variantCorrect: body?.variantCorrect ?? null,
        }),
      );
    }

    send(response, 404, { error: "Not found." });
  }
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

function send(
  response: ServerResponse,
  status: number,
  payload: unknown,
): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}
