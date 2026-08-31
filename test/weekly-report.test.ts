import assert from "node:assert/strict";
import test from "node:test";

import {
  LearningLoop,
  type ChildProfile,
  type MistakeRecord,
  type ParentAccount,
  type ReviewSelfAssessment,
} from "../src/learning-loop.ts";

async function confirmedGuardianWithChild(
  learningLoop: LearningLoop,
  nickname = "小明",
): Promise<{ guardian: ParentAccount; child: ChildProfile }> {
  const guardian = (await learningLoop.startWeChatLoginAsync("guardian-code")).account;
  await learningLoop.confirmGuardianshipAsync(guardian.id);
  await learningLoop.grantSubscriptionAsync(guardian.id, "subscriber");
  const child = await learningLoop.createChildProfileAsync(guardian.id, {
    nickname,
    grade: 3,
    region: "浙江",
  });
  return { guardian, child };
}

async function saveMistake(
  learningLoop: LearningLoop,
  guardian: ParentAccount,
  child: ChildProfile,
  stem: string,
  primaryKnowledgePoint: string,
): Promise<MistakeRecord> {
  const draft = await learningLoop.startQuestionDraftAsync(guardian.id, child.id, "manual");
  const question = await learningLoop.confirmQuestionAsync(guardian.id, draft.id, { stem });
  return learningLoop.saveMistakeAsync(guardian.id, question.id, {
    primaryKnowledgePoint,
  });
}

async function review(
  learningLoop: LearningLoop,
  guardian: ParentAccount,
  mistakeId: string,
  selfAssessment: ReviewSelfAssessment,
  variantCorrect: boolean | null,
): Promise<void> {
  const session = await learningLoop.startReviewAsync(guardian.id, mistakeId);
  await learningLoop.completeReviewAsync(guardian.id, session.reviewId, {
    selfAssessment,
    variantCorrect,
  });
}

test("the weekly report ranks weaknesses by combined evidence, not raw mistake count", async () => {
  // 2026-08-26 is a Wednesday; the Shanghai week starts Monday 2026-08-24.
  const now = Date.parse("2026-08-26T10:00:00+08:00");
  const learningLoop = new LearningLoop(undefined, { now: () => now });
  const { guardian, child } = await confirmedGuardianWithChild(learningLoop);

  const additionFirst = await saveMistake(
    learningLoop,
    guardian,
    child,
    "3 + 5 = ?",
    "加法",
  );
  const additionSecond = await saveMistake(
    learningLoop,
    guardian,
    child,
    "6 + 7 = ?",
    "加法",
  );
  const subtraction = await saveMistake(
    learningLoop,
    guardian,
    child,
    "9 - 4 = ?",
    "减法",
  );
  await saveMistake(learningLoop, guardian, child, "3 × 4 = ?", "乘法");
  await saveMistake(learningLoop, guardian, child, "12 ÷ 3 = ?", "除法");

  await review(learningLoop, guardian, additionFirst.id, "mastered", true);
  await review(learningLoop, guardian, additionFirst.id, "mastered", true);
  await review(learningLoop, guardian, additionFirst.id, "mastered", true);
  await review(learningLoop, guardian, additionSecond.id, "mastered", true);
  await review(learningLoop, guardian, additionSecond.id, "mastered", true);
  await review(learningLoop, guardian, subtraction.id, "not-yet", false);

  const report = await learningLoop.getWeeklyReportAsync(guardian.id, child.id);

  assert.equal(report.weekStart, Date.parse("2026-08-24T00:00:00+08:00"));
  assert.equal(report.weekEnd, Date.parse("2026-08-31T00:00:00+08:00"));
  assert.equal(report.empty, false);
  assert.equal(report.newMistakes, 5);
  assert.equal(report.completedReviews, 6);
  assert.equal(report.masteryChange.netChange, 1.75);
  assert.equal(report.masteryChange.improvedReviews, 5);
  assert.equal(report.masteryChange.declinedReviews, 1);

  assert.deepEqual(
    report.weaknesses.map((entry) => entry.knowledgePoint),
    ["减法", "乘法", "除法"],
  );
  const subtractionEntry = report.weaknesses[0]!;
  assert.equal(subtractionEntry.mistakeCount, 1);
  assert.equal(subtractionEntry.strugglingReviews, 1);
  assert.equal(subtractionEntry.variantMisses, 1);
  assert.deepEqual(subtractionEntry.mistakeIds, [subtraction.id]);
  assert.match(subtractionEntry.suggestion, /减法/);

  assert.equal(report.nextWeekPlan.scheduledReviews, 1);
  assert.deepEqual(report.nextWeekPlan.focusKnowledgePoints, ["加法"]);
  assert.match(report.suggestion, /减法/);
  assert.match(report.comparisonNote, /不包含任何排名/);
});

test("an empty week is reported truthfully and comparisons never appear", async () => {
  const now = Date.parse("2026-08-26T10:00:00+08:00");
  const learningLoop = new LearningLoop(undefined, { now: () => now });
  const { guardian, child } = await confirmedGuardianWithChild(learningLoop);

  const report = await learningLoop.getWeeklyReportAsync(guardian.id, child.id);

  assert.equal(report.empty, true);
  assert.equal(report.newMistakes, 0);
  assert.equal(report.completedReviews, 0);
  assert.deepEqual(report.weaknesses, []);
  assert.equal(report.nextWeekPlan.scheduledReviews, 0);
  assert.match(report.suggestion, /还没有学习记录/);
  assert.match(report.comparisonNote, /不包含任何排名/);
  assert.match(report.comparisonNote, /其他孩子/);
});

test("the report only ever contains the authorized child's data", async () => {
  const now = Date.parse("2026-08-26T10:00:00+08:00");
  const learningLoop = new LearningLoop(undefined, { now: () => now });
  const { guardian, child } = await confirmedGuardianWithChild(learningLoop);
  const otherChild = await learningLoop.createChildProfileAsync(guardian.id, {
    nickname: "小红",
    grade: 6,
    region: "上海",
  });

  await saveMistake(learningLoop, guardian, child, "3 + 5 = ?", "加法");
  await saveMistake(learningLoop, guardian, otherChild, "2x = 10", "简易方程");

  const report = await learningLoop.getWeeklyReportAsync(guardian.id, child.id);

  assert.equal(report.newMistakes, 1);
  assert.deepEqual(
    report.weaknesses.map((entry) => entry.knowledgePoint),
    ["加法"],
  );

  const otherGuardian = (await learningLoop.startWeChatLoginAsync("other-code")).account;
  await learningLoop.confirmGuardianshipAsync(otherGuardian.id);
  await assert.rejects(
    learningLoop.getWeeklyReportAsync(otherGuardian.id, child.id),
    /not available to this guardian/i,
  );
});

test("confirmed correct homework practice lowers the related weakness score", async () => {
  const now = Date.parse("2026-08-26T10:00:00+08:00");
  const learningLoop = new LearningLoop(undefined, { now: () => now });
  const { guardian, child } = await confirmedGuardianWithChild(learningLoop);
  const mistake = await saveMistake(learningLoop, guardian, child, "12 - 5 = ?", "退位减法");

  const review = await learningLoop.createHomeworkReviewAsync(guardian.id, child.id, {
    questions: [{
      stem: "8 + 7 = ?",
      studentAnswer: "15",
      studentAnswerConfidence: 1,
      verdict: "correct",
      confidence: 1,
      answerSource: "parent",
      referenceAnswer: "15",
      reasoning: null,
      suggestedPrimaryKnowledgePoint: "退位减法",
      suggestedSecondaryKnowledgePoints: [],
      suggestedMistakeCause: null,
    }],
  });
  await learningLoop.confirmHomeworkQuestionAsync(guardian.id, review.id, review.candidates[0]!.id, {
    verdict: "correct",
    primaryKnowledgePoint: "退位减法",
  });

  const report = await learningLoop.getWeeklyReportAsync(guardian.id, child.id);
  const entry = report.weaknesses.find((item) => item.knowledgePoint === "退位减法");
  assert.ok(entry);
  assert.equal(entry.correctPracticeCount, 1);
  assert.equal(entry.weaknessScore, 5);
  assert.equal(mistake.primaryKnowledgePoint, "退位减法");
});
