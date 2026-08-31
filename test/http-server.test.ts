import assert from "node:assert/strict";
import type { Server } from "node:http";
import test from "node:test";

import { LearningLoop } from "../src/learning-loop.ts";
import { createLearningLoopServer, type LearningLoopServerDependencies } from "../src/server/http-server.ts";
import { AiRateLimiter, AiUsageLedger } from "../src/server/http-server.ts";
import { InMemoryIdempotencyStore } from "../src/server/idempotency-store.ts";

test("AI rate limiter isolates tenant keys and expires entries", () => {
  let now = 0;
  const limiter = new AiRateLimiter(2, () => now);
  assert.equal(limiter.allow("account-a"), true);
  assert.equal(limiter.allow("account-a"), true);
  assert.equal(limiter.allow("account-a"), false);
  assert.equal(limiter.remaining("account-a"), 0);
  assert.equal(limiter.allow("account-b"), true);
  now = 60_001;
  assert.equal(limiter.allow("account-a"), true);
  assert.equal(limiter.remaining("account-a"), 1);
});

test("AI usage ledger enforces monthly tenant quota and resets by month", () => {
  let now = Date.parse("2026-08-30T00:00:00Z");
  const ledger = new AiUsageLedger(2, () => now);
  assert.deepEqual(ledger.consume("account-a"), { allowed: true, used: 1, limit: 2 });
  assert.deepEqual(ledger.consume("account-a"), { allowed: true, used: 2, limit: 2 });
  assert.deepEqual(ledger.consume("account-a"), { allowed: false, used: 2, limit: 2 });
  assert.deepEqual(ledger.consume("account-b"), { allowed: true, used: 1, limit: 2 });
  now = Date.parse("2026-09-01T00:00:00Z");
  assert.deepEqual(ledger.consume("account-a"), { allowed: true, used: 1, limit: 2 });
});

test("idempotency store replays completed responses and releases failures", async () => {
  const store = new InMemoryIdempotencyStore();
  assert.deepEqual(await store.claim("parent", "operation", "key"), { state: "claimed" });
  assert.deepEqual(await store.claim("parent", "operation", "key"), { state: "pending" });
  await store.complete("parent", "operation", "key", { id: "first" });
  assert.deepEqual(await store.claim("parent", "operation", "key"), {
    state: "completed",
    response: { id: "first" },
  });
  assert.deepEqual(await store.claim("parent", "operation", "retry"), { state: "claimed" });
  await store.release("parent", "operation", "retry");
  assert.deepEqual(await store.claim("parent", "operation", "retry"), { state: "claimed" });
});

test("account deletion invalidates the session and removes child data", async () => {
  await withServer(async (api) => {
    const login = await api.call("POST", "/session", { body: { code: "delete-account" } });
    const token = login.body.session.token as string;
    await api.call("POST", "/guardianship/confirm", { token });
    const child = await api.call("POST", "/children", {
      token,
      body: { nickname: "测试孩子", grade: 3 },
    });
    assert.equal(child.status, 200);

    const deleted = await api.call("DELETE", "/account", { token });
    assert.deepEqual(deleted, { status: 200, body: { ok: true } });

    const oldSession = await api.call("GET", "/home", { token });
    assert.equal(oldSession.status, 401);
    assert.match(oldSession.body.error, /log in again/i);
  });
});

test("reminder dispatch endpoint requires the scheduler secret", async () => {
  const server = createLearningLoopServer({
    learningLoop: new LearningLoop(),
    reminderSchedulerSecret: "scheduler-secret",
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const call = (secret?: string) => fetch(
    `http://127.0.0.1:${port}/internal/reminders/dispatch`,
    {
      method: "POST",
      headers: secret ? { "x-scheduler-secret": secret } : {},
    },
  );
  try {
    assert.equal((await call()).status, 401);
    assert.equal((await call("wrong-secret")).status, 401);
    const accepted = await call("scheduler-secret");
    assert.equal(accepted.status, 200);
    assert.deepEqual(await accepted.json(), { outcomes: [] });
  } finally {
    server.close();
  }
});

async function withServer(
  run: (api: ApiClient) => Promise<void>,
  overrides: Partial<LearningLoopServerDependencies> = {},
): Promise<void> {
  let now = Date.parse("2026-08-27T10:00:00+08:00");
  const learningLoop = new LearningLoop(undefined, {
    now: () => now,
    explanationProvider: async () => ({
      hint: "先想一想",
      approach: "凑十法",
      steps: ["第一步", "第二步"],
      finalAnswer: "8",
      variantExercise: { stem: "4 + 5 = ?", answer: "9" },
    }),
  });
  const server = createLearningLoopServer({
    learningLoop,
    weChatIdentityResolver: async (temporaryCode) => ({
      subject: `wechat:${temporaryCode}`,
    }),
    recognitionClient: async () => ({
      stem: "3 + 5 = ?",
      formulas: ["3+5"],
      confidence: 0.95,
      region: null,
    }),
    ...overrides,
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const api = makeApiClient(port, () => now, (value) => { now = value; });

  try {
    await run(api);
  } finally {
    server.close();
  }
}

type ApiClient = {
  call(
    method: string,
    path: string,
    options?: { body?: unknown; token?: string; idempotencyKey?: string },
  ): Promise<{ status: number; body: any }>;
  advanceTo(iso: string): void;
};

function makeApiClient(
  port: number,
  _now: () => number,
  advance: (value: number) => void,
): ApiClient {
  return {
    async call(method, path, options = {}) {
      const response = await fetch(`http://127.0.0.1:${port}/api${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          ...(options.token
            ? { authorization: `Bearer ${options.token}` }
            : {}),
          ...(options.idempotencyKey
            ? { "idempotency-key": options.idempotencyKey }
            : {}),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
      return { status: response.status, body: await response.json() };
    },
    advanceTo(iso: string) {
      advance(Date.parse(iso));
    },
  };
}

test("the HTTP API carries a family through the full learning loop", async () => {
  await withServer(async (api) => {
    const login = await api.call("POST", "/session", {
      body: { code: "wx-login-code" },
    });
    assert.equal(login.status, 200);
    const token = login.body.session.token as string;
    assert.ok(token);
    assert.equal(JSON.stringify(login.body).includes("wx-login-code"), false);

    const unauthorized = await api.call("GET", "/home");
    assert.equal(unauthorized.status, 401);
    assert.match(unauthorized.body.error, /log in again/i);

    const blockedChild = await api.call("POST", "/children", {
      token,
      body: { nickname: "小明", grade: 3, region: "浙江" },
    });
    assert.equal(blockedChild.status, 400);
    assert.match(blockedChild.body.error, /guardianship/i);

    await api.call("POST", "/guardianship/confirm", { token });

    const child = await api.call("POST", "/children", {
      token,
      body: { nickname: "小明", grade: 3, region: "浙江" },
    });
    assert.equal(child.status, 200);
    const childId = child.body.id as string;

    const emptyHome = await api.call("GET", "/home", { token });
    assert.equal(emptyHome.body.stage, "ready");

    const draft = await api.call("POST", "/drafts", {
      token,
      body: { childProfileId: childId, source: "camera" },
    });
    assert.equal(draft.status, 200);

    const withPhoto = await api.call("POST", `/drafts/${draft.body.id}/photo`, {
      token,
      body: { imageDataUrl: "data:image/jpeg;base64,QUJD" },
    });
    assert.equal(withPhoto.status, 200);
    assert.equal(withPhoto.body.recognition.stem, "3 + 5 = ?");

    const question = await api.call("POST", `/drafts/${draft.body.id}/confirm`, {
      token,
      body: { stem: "3 + 5 = ?", studentAnswer: "7" },
    });
    assert.equal(question.status, 200);
    assert.equal(question.body.status, "confirmed");

    const explanation = await api.call(
      "GET",
      `/questions/${question.body.id}/explanation`,
      { token },
    );
    assert.equal(explanation.status, 200);
    assert.equal(explanation.body.finalAnswer, null);
    assert.equal(explanation.body.hint, "先想一想");

    const mistake = await api.call(
      "POST",
      `/questions/${question.body.id}/mistake`,
      {
        token,
        body: {
          primaryKnowledgePoint: "20以内进位加法",
          mistakeCause: "粗心",
        },
      },
    );
    assert.equal(mistake.status, 200);

    const mistakes = await api.call(
      "GET",
      `/mistakes?childProfileId=${childId}&keyword=${encodeURIComponent("3 + 5")}`,
      { token },
    );
    assert.equal(mistakes.body.length, 1);

    api.advanceTo("2026-08-28T09:00:00+08:00");

    const due = await api.call("GET", `/reviews/due?childProfileId=${childId}`, {
      token,
    });
    assert.equal(due.body.length, 1);

    const review = await api.call("POST", "/reviews", {
      token,
      body: { mistakeId: mistake.body.id, exercise: "original" },
    });
    assert.equal(review.status, 200);

    const completed = await api.call(
      "POST",
      `/reviews/${review.body.reviewId}/complete`,
      {
        token,
        body: { selfAssessment: "mastered", variantCorrect: null },
      },
    );
    assert.equal(completed.status, 200);
    assert.equal(completed.body.intervalDays, 2);

    const home = await api.call("GET", "/home", { token });
    assert.equal(home.body.dueReviewCount, 0);
    assert.equal(home.body.sevenDaySummary.completedReviews, 1);

    const report = await api.call(
      "GET",
      `/reports/weekly?childProfileId=${childId}`,
      { token },
    );
    assert.equal(report.body.newMistakes, 1);
    assert.equal(report.body.full, false);

    const entitlements = await api.call("GET", "/entitlements", { token });
    assert.equal(entitlements.body.plan, "free");
  });
});

test("Idempotency-Key replays the first successful mistake creation", async () => {
  await withServer(async (api) => {
    const login = await api.call("POST", "/session", { body: { code: "idempotency" } });
    const token = login.body.session.token as string;
    await api.call("POST", "/guardianship/confirm", { token });
    const child = await api.call("POST", "/children", {
      token,
      body: { nickname: "小明", grade: 3 },
    });
    const draft = await api.call("POST", "/drafts", {
      token,
      body: { childProfileId: child.body.id, source: "manual" },
    });
    const confirmOptions = {
      token,
      idempotencyKey: "confirm-key-1",
      body: { stem: "1 + 1 = ?" },
    };
    const question = await api.call("POST", `/drafts/${draft.body.id}/confirm`, confirmOptions);
    const questionReplay = await api.call("POST", `/drafts/${draft.body.id}/confirm`, confirmOptions);
    assert.deepEqual(questionReplay, question);
    const options = {
      token,
      idempotencyKey: "mistake-key-1",
      body: { primaryKnowledgePoint: "加法" },
    };
    const first = await api.call("POST", `/questions/${question.body.id}/mistake`, options);
    const replay = await api.call("POST", `/questions/${question.body.id}/mistake`, options);
    assert.equal(first.status, 200);
    assert.deepEqual(replay, first);
    const mistakes = await api.call("GET", `/mistakes?childProfileId=${child.body.id}`, { token });
    assert.equal(mistakes.body.length, 1);
  });
});

test("a competing Idempotency-Key request returns 409", async () => {
  await withServer(async (api) => {
    const login = await api.call("POST", "/session", { body: { code: "pending-idempotency" } });
    const token = login.body.session.token as string;
    await api.call("POST", "/guardianship/confirm", { token });
    const child = await api.call("POST", "/children", { token, body: { nickname: "小明", grade: 3 } });
    const draft = await api.call("POST", "/drafts", { token, body: { childProfileId: child.body.id, source: "manual" } });
    const question = await api.call("POST", `/drafts/${draft.body.id}/confirm`, { token, body: { stem: "1+1=?" } });
    const response = await api.call("POST", `/questions/${question.body.id}/mistake`, {
      token,
      idempotencyKey: "pending-key",
      body: { primaryKnowledgePoint: "加法" },
    });
    assert.deepEqual(response, {
      status: 409,
      body: { error: "idempotency_request_in_progress" },
    });
  }, {
    idempotencyStore: {
      async claim() { return { state: "pending" }; },
      async complete() {},
      async release() {},
    },
  });
});

test("the HTTP API exchanges a WeChat code and restores the same guardian", async () => {
  await withServer(async (api) => {
    const firstLogin = await api.call("POST", "/session", {
      body: { code: "fresh-code" },
    });
    const secondLogin = await api.call("POST", "/session", {
      body: { code: "fresh-code" },
    });

    assert.equal(firstLogin.status, 200);
    assert.equal(secondLogin.status, 200);
    assert.equal(firstLogin.body.account.id, secondLogin.body.account.id);
    assert.notEqual(
      firstLogin.body.session.token,
      secondLogin.body.session.token,
    );
    assert.equal(JSON.stringify(firstLogin.body).includes("fresh-code"), false);
  });
});

test("operations endpoints expose health and redact request logs", async () => {
  const events: Array<Record<string, unknown>> = [];
  const learningLoop = new LearningLoop();
  const server = createLearningLoopServer({
    learningLoop,
    log: (event) => events.push(event),
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  try {
    const health = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });
    assert.match(health.headers.get("x-request-id") ?? "", /^[0-9a-f-]{36}$/i);

    await fetch(`http://127.0.0.1:${port}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "sensitive-wechat-code" }),
    });

    assert.equal(events.length, 2);
    assert.equal(events[1]?.path, "/api/session");
    assert.equal(JSON.stringify(events).includes("sensitive-wechat-code"), false);
  } finally {
    server.close();
  }
});

test("health reports storage unavailability when the database check fails", async () => {
  const server = createLearningLoopServer({
    learningLoop: new LearningLoop(),
    healthCheck: async () => {
      throw new Error("database connection failed");
    },
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      status: "unavailable",
      error: "storage_unavailable",
    });
  } finally {
    server.close();
  }
});

test("the HTTP API accepts a CloudBase file ID only after an upload credential", async () => {
  const learningLoop = new LearningLoop();
  const server = createLearningLoopServer({
    learningLoop,
    photoStorage: {
      verifyUploadedFile: async ({ fileId, expectedImageKey }) => {
        assert.match(expectedImageKey, /^questions\//);
        assert.equal(fileId, `cloud://prod/${expectedImageKey}`);
        return { imageUrl: "https://storage.example/photo.jpg" };
      },
    },
    recognitionClient: async ({ imageDataUrl }) => {
      assert.equal(imageDataUrl, "data:image/jpeg;base64,QUJD");
      return { stem: "1 + 1 = ?", formulas: [], confidence: 0.9, region: null };
    },
    weChatIdentityResolver: async () => ({ subject: "cloudbase-test" }),
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  try {
    const call = async (path: string, body: unknown, token?: string) => {
      const response = await fetch(`http://127.0.0.1:${port}/api${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    };
    const login = await call("/session", { code: "ignored" });
    const token = login.body.session.token as string;
    await call("/guardianship/confirm", {}, token);
    const childResponse = await fetch(`http://127.0.0.1:${port}/api/children`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ nickname: "小明", grade: 3, region: "上海" }),
    });
    const child = await childResponse.json();
    const draft = await call("/drafts", { childProfileId: child.id, source: "camera" }, token);
    const credential = await call(`/drafts/${draft.body.id}/photo-credential`, {}, token);
    assert.equal(credential.body.parentAccountId, undefined);
    assert.equal(credential.body.usedAt, undefined);
    const recognized = await call(`/drafts/${draft.body.id}/photo`, {
      uploadToken: credential.body.uploadToken,
      fileId: `cloud://prod/${credential.body.imageKey}`,
      imageDataUrl: "data:image/jpeg;base64,QUJD",
    }, token);

    assert.equal(recognized.status, 200, JSON.stringify(recognized.body));
    assert.equal(recognized.body.recognition.stem, "1 + 1 = ?");
  } finally {
    server.close();
  }
});

test("creating a child with an incomplete payload returns a readable validation error", async () => {
  await withServer(async (api) => {
    const login = await api.call("POST", "/session", { body: { code: "validation-login" } });
    const token = login.body.session.token as string;
    await api.call("POST", "/guardianship/confirm", { token });
    const response = await api.call("POST", "/children", { token, body: {} });
    assert.equal(response.status, 400);
    assert.match(response.body.error, /nickname/i);
    assert.doesNotMatch(response.body.error, /undefined\.trim/i);
  });
});

test("the HTTP API keeps homework grading pending until a guardian confirms each question", async () => {
  await withServer(async (api) => {
    const login = await api.call("POST", "/session", {
      body: { code: "homework-grading-login" },
    });
    const token = login.body.session.token as string;
    await api.call("POST", "/guardianship/confirm", { token });
    const child = await api.call("POST", "/children", {
      token,
      body: { nickname: "小红", grade: 4, region: "上海" },
    });

    const created = await api.call("POST", "/homework-reviews", {
      token,
      body: {
        childProfileId: child.body.id,
        recognition: {
          questions: [
            {
              stem: "8 + 7 = ?",
              studentAnswer: "15",
              studentAnswerConfidence: 0.97,
              verdict: "correct",
              confidence: 0.96,
              answerSource: "ai",
              referenceAnswer: "15",
              reasoning: "8 + 7 = 15",
              suggestedPrimaryKnowledgePoint: "20以内进位加法",
              suggestedSecondaryKnowledgePoints: [],
              suggestedMistakeCause: null,
            },
            {
              stem: "12 - 5 = ?",
              studentAnswer: "8",
              studentAnswerConfidence: 0.94,
              verdict: "incorrect",
              confidence: 0.95,
              answerSource: "teacher",
              referenceAnswer: "7",
              reasoning: "12 - 5 = 7",
              suggestedPrimaryKnowledgePoint: "20以内退位减法",
              suggestedSecondaryKnowledgePoints: [],
              suggestedMistakeCause: "计算粗心",
            },
          ],
        },
      },
    });
    assert.equal(created.status, 200);
    const [correctCandidate, incorrectCandidate] = created.body.candidates;
    assert.equal(correctCandidate.confirmedVerdict, null);

    const confirmedCorrect = await api.call(
      "POST",
      `/homework-reviews/${created.body.id}/questions/${correctCandidate.id}/confirm`,
      { token, body: { verdict: "correct" } },
    );
    assert.equal(confirmedCorrect.body.confirmedVerdict, "correct");
    assert.equal(confirmedCorrect.body.mistakeId, null);

    const confirmedIncorrect = await api.call(
      "POST",
      `/homework-reviews/${created.body.id}/questions/${incorrectCandidate.id}/confirm`,
      {
        token,
        body: {
          verdict: "incorrect",
          primaryKnowledgePoint: "20以内退位减法",
          mistakeCause: "计算粗心",
        },
      },
    );
    assert.equal(confirmedIncorrect.body.confirmedVerdict, "incorrect");
    assert.ok(confirmedIncorrect.body.mistakeId);

    const mistakes = await api.call(
      "GET",
      `/mistakes?childProfileId=${child.body.id}`,
      { token },
    );
    assert.equal(mistakes.body.length, 1);

    const review = await api.call("GET", `/homework-reviews/${created.body.id}`, { token });
    assert.equal(review.status, 200);
    assert.equal(review.body.candidates[0].confirmedVerdict, "correct");
    assert.equal(review.body.candidates[1].mistakeId, confirmedIncorrect.body.mistakeId);
  });
});
