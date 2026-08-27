import assert from "node:assert/strict";
import test from "node:test";

import {
  LearningLoop,
  type ChildProfile,
  type ParentAccount,
} from "../src/learning-loop.ts";

function confirmedGuardianWithChild(
  learningLoop: LearningLoop,
  nickname = "小明",
): { guardian: ParentAccount; child: ChildProfile } {
  const guardian = learningLoop.startWeChatLogin("guardian-code").account;
  learningLoop.confirmGuardianship(guardian.id);
  const child = learningLoop.createChildProfile(guardian.id, {
    nickname,
    grade: 3,
    region: "浙江",
  });
  return { guardian, child };
}

function captureQuestion(
  learningLoop: LearningLoop,
  guardian: ParentAccount,
  child: ChildProfile,
  stem: string,
): void {
  const draft = learningLoop.startQuestionDraft(guardian.id, child.id, "manual");
  learningLoop.confirmQuestion(guardian.id, draft.id, { stem });
}

test("free accounts have a trackable monthly photo quota and a clear message at the limit", () => {
  let now = Date.parse("2026-08-10T10:00:00+08:00");
  const learningLoop = new LearningLoop(undefined, { now: () => now });
  const { guardian, child } = confirmedGuardianWithChild(learningLoop);

  const initial = learningLoop.getEntitlements(guardian.id);
  assert.equal(initial.plan, "free");
  assert.equal(initial.monthlyPhotoQuota, 20);
  assert.equal(initial.photosUsedThisMonth, 0);

  for (let index = 1; index <= 20; index += 1) {
    captureQuestion(learningLoop, guardian, child, `第 ${index} 题`);
  }

  assert.equal(learningLoop.getEntitlements(guardian.id).photosUsedThisMonth, 20);
  assert.throws(
    () => captureQuestion(learningLoop, guardian, child, "第 21 题"),
    /额度已用完.*订阅/s,
  );

  now = Date.parse("2026-09-01T00:30:00+08:00");
  assert.equal(learningLoop.getEntitlements(guardian.id).photosUsedThisMonth, 0);
  captureQuestion(learningLoop, guardian, child, "九月第一题");
  assert.equal(learningLoop.getEntitlements(guardian.id).photosUsedThisMonth, 1);
});

test("subscription unlocks the full report and more child profiles without touching existing data", () => {
  const now = Date.parse("2026-08-26T10:00:00+08:00");
  const learningLoop = new LearningLoop(undefined, { now: () => now });
  const { guardian, child } = confirmedGuardianWithChild(learningLoop);

  const draft = learningLoop.startQuestionDraft(guardian.id, child.id, "manual");
  const question = learningLoop.confirmQuestion(guardian.id, draft.id, {
    stem: "3 + 5 = ?",
  });
  const mistake = learningLoop.saveMistake(guardian.id, question.id, {
    primaryKnowledgePoint: "加法",
  });

  const freeReport = learningLoop.getWeeklyReport(guardian.id, child.id);
  assert.equal(freeReport.full, false);
  assert.deepEqual(freeReport.weaknesses, []);
  assert.deepEqual(freeReport.nextWeekPlan.focusKnowledgePoints, []);
  assert.match(freeReport.upgradeNote!, /订阅/);
  assert.equal(freeReport.newMistakes, 1);

  learningLoop.createChildProfile(guardian.id, {
    nickname: "小红",
    grade: 6,
    region: "上海",
  });
  assert.throws(
    () =>
      learningLoop.createChildProfile(guardian.id, {
        nickname: " third ",
        grade: 1,
        region: "北京",
      }),
    /上限.*订阅/s,
  );

  learningLoop.grantSubscription(guardian.id, "subscriber");

  const fullReport = learningLoop.getWeeklyReport(guardian.id, child.id);
  assert.equal(fullReport.full, true);
  assert.deepEqual(
    fullReport.weaknesses.map((entry) => entry.knowledgePoint),
    ["加法"],
  );
  assert.equal(fullReport.upgradeNote, null);

  const third = learningLoop.createChildProfile(guardian.id, {
    nickname: "小华",
    grade: 1,
    region: "北京",
  });
  assert.ok(third.id);
  assert.equal(learningLoop.getEntitlements(guardian.id).maxChildProfiles, 5);

  assert.equal(learningLoop.listMistakes(guardian.id, child.id).length, 1);
  learningLoop.deleteMistake(guardian.id, mistake.id);
  assert.equal(learningLoop.listMistakes(guardian.id, child.id).length, 0);
});

test("entitlements cannot be borrowed across accounts and the variant quota is enforced", async () => {
  const now = Date.parse("2026-08-26T10:00:00+08:00");
  const learningLoop = new LearningLoop(undefined, {
    now: () => now,
    explanationProvider: () => ({
      hint: "提示",
      approach: "思路",
      steps: ["一步"],
      finalAnswer: "8",
      variantExercise: { stem: "4 + 5 = ?", answer: "9" },
    }),
  });
  const subscriberFamily = confirmedGuardianWithChild(learningLoop, "小明");
  const freeGuardian = learningLoop.startWeChatLogin("free-code").account;
  learningLoop.confirmGuardianship(freeGuardian.id);
  const freeChild = learningLoop.createChildProfile(freeGuardian.id, {
    nickname: "小芳",
    grade: 4,
    region: "江苏",
  });

  learningLoop.grantSubscription(subscriberFamily.guardian.id, "subscriber");

  const freeEntitlements = learningLoop.getEntitlements(freeGuardian.id);
  assert.equal(freeEntitlements.plan, "free");
  assert.equal(freeEntitlements.monthlyPhotoQuota, 20);
  assert.equal(freeEntitlements.monthlyVariantExerciseQuota, 10);

  const draft = learningLoop.startQuestionDraft(
    freeGuardian.id,
    freeChild.id,
    "manual",
  );
  const question = learningLoop.confirmQuestion(freeGuardian.id, draft.id, {
    stem: "7 + 6 = ?",
  });
  const mistake = learningLoop.saveMistake(freeGuardian.id, question.id, {
    primaryKnowledgePoint: "加法",
  });

  for (let index = 0; index < 10; index += 1) {
    const session = await learningLoop.startReview(freeGuardian.id, mistake.id, {
      exercise: "variant",
    });
    learningLoop.completeReview(freeGuardian.id, session.reviewId, {
      selfAssessment: "partially",
      variantCorrect: true,
    });
  }

  assert.equal(
    learningLoop.getEntitlements(freeGuardian.id)
      .variantExercisesUsedThisMonth,
    10,
  );
  await assert.rejects(
    learningLoop.startReview(freeGuardian.id, mistake.id, {
      exercise: "variant",
    }),
    /变式练习额度已用完.*订阅/s,
  );

  const originalSession = await learningLoop.startReview(
    freeGuardian.id,
    mistake.id,
  );
  assert.equal(originalSession.exercise.kind, "original");

  const subscriberMistakeDraft = learningLoop.startQuestionDraft(
    subscriberFamily.guardian.id,
    subscriberFamily.child.id,
    "manual",
  );
  const subscriberQuestion = learningLoop.confirmQuestion(
    subscriberFamily.guardian.id,
    subscriberMistakeDraft.id,
    { stem: "1 + 1 = ?" },
  );
  const subscriberMistake = learningLoop.saveMistake(
    subscriberFamily.guardian.id,
    subscriberQuestion.id,
    { primaryKnowledgePoint: "加法" },
  );
  for (let index = 0; index < 11; index += 1) {
    await learningLoop.startReview(subscriberFamily.guardian.id, subscriberMistake.id, {
      exercise: "variant",
    });
  }
  assert.equal(
    learningLoop.getEntitlements(subscriberFamily.guardian.id)
      .monthlyVariantExerciseQuota,
    null,
  );
});
