import assert from "node:assert/strict";
import test from "node:test";

import {
  LearningLoop,
  type ChildProfile,
  type MistakeRecord,
  type ParentAccount,
} from "../src/learning-loop.ts";

function confirmedGuardianWithChild(learningLoop: LearningLoop): {
  guardian: ParentAccount;
  child: ChildProfile;
} {
  const guardian = learningLoop.startWeChatLogin("guardian-code").account;
  learningLoop.confirmGuardianship(guardian.id);
  const child = learningLoop.createChildProfile(guardian.id, {
    nickname: "小明",
    grade: 3,
    region: "浙江",
  });
  return { guardian, child };
}

function saveMistake(
  learningLoop: LearningLoop,
  guardian: ParentAccount,
  child: ChildProfile,
  stem = "3 + 5 = ?",
  details = { primaryKnowledgePoint: "20以内进位加法" },
): MistakeRecord {
  const draft = learningLoop.startQuestionDraft(guardian.id, child.id, "manual");
  const question = learningLoop.confirmQuestion(guardian.id, draft.id, { stem });
  return learningLoop.saveMistake(guardian.id, question.id, details);
}

test("a saved mistake is scheduled on the Ebbinghaus rhythm in the Asia/Shanghai calendar", () => {
  // 2026-08-26 17:00 UTC is already 2026-08-27 01:00 in Shanghai.
  let now = Date.parse("2026-08-26T17:00:00Z");
  const learningLoop = new LearningLoop(undefined, { now: () => now });
  const { guardian, child } = confirmedGuardianWithChild(learningLoop);

  const mistake = saveMistake(learningLoop, guardian, child);
  const schedule = learningLoop.getReviewSchedule(guardian.id, mistake.id);

  assert.equal(schedule.intervalDays, 1);
  assert.equal(
    schedule.nextReviewAt,
    Date.parse("2026-08-28T00:00:00+08:00"),
  );
  assert.equal(schedule.masteryScore, 0);
  assert.equal(schedule.masteryStatus, "not-started");
  assert.equal(schedule.reviewCount, 0);
  assert.match(schedule.masteryNote, /学习记录指标/);
  assert.match(schedule.masteryNote, /并非考试评价/);

  assert.deepEqual(learningLoop.getDueReviews(guardian.id, child.id), []);

  now = Date.parse("2026-08-28T00:30:00+08:00");
  const due = learningLoop.getDueReviews(guardian.id, child.id);
  assert.equal(due.length, 1);
  assert.equal(due[0]?.id, mistake.id);
  assert.equal(due[0]?.stem, "3 + 5 = ?");
});

test("a review recalls the knowledge point, adapts the interval, and ignores duplicate submissions", async () => {
  let now = Date.parse("2026-08-27T09:00:00+08:00");
  const learningLoop = new LearningLoop(undefined, { now: () => now });
  const { guardian, child } = confirmedGuardianWithChild(learningLoop);
  const mistake = saveMistake(learningLoop, guardian, child);

  const session = await learningLoop.startReview(guardian.id, mistake.id);
  assert.match(session.recallPrompt, /20以内进位加法/);
  assert.deepEqual(session.exercise, { kind: "original", stem: "3 + 5 = ?" });

  const result = learningLoop.completeReview(guardian.id, session.reviewId, {
    selfAssessment: "mastered",
    variantCorrect: null,
  });

  assert.equal(result.alreadyRecorded, false);
  assert.equal(result.intervalDays, 2);
  assert.equal(
    result.nextReviewAt,
    Date.parse("2026-08-29T00:00:00+08:00"),
  );
  assert.equal(result.masteryScore, 0.34);
  assert.equal(result.masteryStatus, "learning");

  const replay = learningLoop.completeReview(guardian.id, session.reviewId, {
    selfAssessment: "not-yet",
    variantCorrect: false,
  });

  assert.equal(replay.alreadyRecorded, true);
  assert.equal(replay.masteryScore, 0.34);
  assert.equal(replay.intervalDays, 2);
  assert.equal(
    learningLoop.getReviewSchedule(guardian.id, mistake.id).reviewCount,
    1,
  );

  assert.equal(
    learningLoop.listMistakes(guardian.id, child.id)[0]?.masteryStatus,
    "learning",
  );
});

test("intervals reset on forgotten reviews, step back on wrong variants, and mastery accumulates", async () => {
  let now = Date.parse("2026-08-27T09:00:00+08:00");
  const learningLoop = new LearningLoop(undefined, { now: () => now });
  const { guardian, child } = confirmedGuardianWithChild(learningLoop);
  const mistake = saveMistake(learningLoop, guardian, child);

  const review = async (
    selfAssessment: "not-yet" | "partially" | "mastered",
    variantCorrect: boolean | null,
  ) => {
    const session = await learningLoop.startReview(guardian.id, mistake.id);
    return learningLoop.completeReview(guardian.id, session.reviewId, {
      selfAssessment,
      variantCorrect,
    });
  };

  let result = await review("mastered", null);
  assert.equal(result.intervalDays, 2);
  now = result.nextReviewAt + 60_000;

  result = await review("not-yet", null);
  assert.equal(result.intervalDays, 1);
  assert.equal(result.masteryScore, 0.34);
  now = result.nextReviewAt + 60_000;

  result = await review("mastered", true);
  assert.equal(result.intervalDays, 2);
  assert.equal(result.masteryScore, 0.73);
  now = result.nextReviewAt + 60_000;

  result = await review("mastered", false);
  assert.equal(result.intervalDays, 2);
  assert.equal(result.masteryScore, 0.87);
  assert.equal(result.masteryStatus, "mastered");
  now = result.nextReviewAt + 60_000;

  assert.equal(
    learningLoop.listMistakes(guardian.id, child.id)[0]?.masteryStatus,
    "mastered",
  );

  result = await review("mastered", true);
  assert.equal(result.intervalDays, 4);
  assert.equal(result.masteryScore, 1);
});

test("a review can exercise a same-type variant generated for the child's grade", async () => {
  const learningLoop = new LearningLoop(undefined, {
    explanationProvider: () => ({
      hint: "提示",
      approach: "思路",
      steps: ["一步"],
      finalAnswer: "8",
      variantExercise: { stem: "4 + 5 = ?", answer: "9" },
    }),
  });
  const { guardian, child } = confirmedGuardianWithChild(learningLoop);
  const mistake = saveMistake(learningLoop, guardian, child);

  const session = await learningLoop.startReview(guardian.id, mistake.id, {
    exercise: "variant",
  });

  assert.deepEqual(session.exercise, { kind: "variant", stem: "4 + 5 = ?" });

  const result = learningLoop.completeReview(guardian.id, session.reviewId, {
    selfAssessment: "mastered",
    variantCorrect: true,
  });
  assert.equal(result.masteryScore, 0.39);

  const withoutProvider = new LearningLoop();
  const second = confirmedGuardianWithChild(withoutProvider);
  const secondMistake = saveMistake(
    withoutProvider,
    second.guardian,
    second.child,
  );
  await assert.rejects(
    withoutProvider.startReview(second.guardian.id, secondMistake.id, {
      exercise: "variant",
    }),
    /explanation provider/i,
  );
});
