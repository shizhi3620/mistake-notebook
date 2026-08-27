import assert from "node:assert/strict";
import type { Server } from "node:http";
import test from "node:test";

import { LearningLoop } from "../src/learning-loop.ts";
import { createLearningLoopServer } from "../src/server/http-server.ts";

async function withServer(
  run: (api: ApiClient) => Promise<void>,
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
    recognitionClient: async () => ({
      stem: "3 + 5 = ?",
      formulas: ["3+5"],
      confidence: 0.95,
      region: null,
    }),
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
    options?: { body?: unknown; token?: string },
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
