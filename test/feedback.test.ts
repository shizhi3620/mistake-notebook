import assert from "node:assert/strict";
import test from "node:test";
import { LearningLoop } from "../src/learning-loop.ts";

test("guardian can submit explanation and feature feedback with isolation", async () => {
  const loop = new LearningLoop();
  const guardian = (await loop.startWeChatLoginAsync("feedback-a")).account;
  await loop.confirmGuardianshipAsync(guardian.id);
  const child = await loop.createChildProfileAsync(guardian.id, { nickname: "小明", grade: 3 });
  const draft = await loop.startQuestionDraftAsync(guardian.id, child.id, "manual");
  const question = await loop.confirmQuestionAsync(guardian.id, draft.id, { stem: "3+5=?" });
  const quality = await loop.submitFeedbackAsync(guardian.id, { type: "explanation_quality", questionId: question.id, outcome: "problematic", issueKinds: ["answer"], note: "答案需要核对" });
  assert.equal(quality.priority, "normal");
  const feature = await loop.submitFeedbackAsync(guardian.id, { type: "feature", featureKind: "feature_request", page: "/home", clientVersion: "1.0.0" });
  assert.equal(feature.questionId, null);
  assert.equal((await loop.listFeedbackAsync(guardian.id)).length, 2);
  const other = (await loop.startWeChatLoginAsync("feedback-b")).account;
  assert.equal((await loop.listFeedbackAsync(other.id)).length, 0);
});

test("safety feedback requires a note and has high priority", async () => {
  const loop = new LearningLoop();
  const guardian = (await loop.startWeChatLoginAsync("feedback-safety")).account;
  await loop.confirmGuardianshipAsync(guardian.id);
  const child = await loop.createChildProfileAsync(guardian.id, { nickname: "小红", grade: 4 });
  const draft = await loop.startQuestionDraftAsync(guardian.id, child.id, "manual");
  const question = await loop.confirmQuestionAsync(guardian.id, draft.id, { stem: "2+2=?" });
  await assert.rejects(() => loop.submitFeedbackAsync(guardian.id, { type: "safety", questionId: question.id }), /requires a note/i);
  const feedback = await loop.submitFeedbackAsync(guardian.id, { type: "safety", questionId: question.id, note: "内容不适合未成年人" });
  assert.equal(feedback.priority, "high");
  const updated = await loop.updateFeedbackAsync(guardian.id, feedback.id, { status: "reviewing", internalNote: "已进入审核" });
  assert.equal(updated.status, "reviewing");
});

test("feedback content safety checker rejects unsafe notes", async () => {
  const loop = new LearningLoop(undefined, {
    feedbackContentSafetyChecker: async () => false,
  });
  const guardian = (await loop.startWeChatLoginAsync("feedback-content-safety")).account;
  await assert.rejects(
    () => loop.submitFeedbackAsync(guardian.id, {
      type: "feature",
      featureKind: "other",
      note: "需要审核的内容",
    }),
    /failed safety review/i,
  );
});
