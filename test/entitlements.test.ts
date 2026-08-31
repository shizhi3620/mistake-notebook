import assert from "node:assert/strict";
import test from "node:test";

import {
  LearningLoop,
  type ChildProfile,
  type ParentAccount,
} from "../src/learning-loop.ts";

async function confirmedGuardianWithChild(
  learningLoop: LearningLoop,
  nickname = "小明",
): Promise<{ guardian: ParentAccount; child: ChildProfile }> {
  const guardian = (await learningLoop.startWeChatLoginAsync("guardian-code")).account;
  await learningLoop.confirmGuardianshipAsync(guardian.id);
  const child = await learningLoop.createChildProfileAsync(guardian.id, {
    nickname,
    grade: 3,
    region: "浙江",
  });
  return { guardian, child };
}

async function captureQuestion(
  learningLoop: LearningLoop,
  guardian: ParentAccount,
  child: ChildProfile,
  stem: string,
): Promise<void> {
  const draft = await learningLoop.startQuestionDraftAsync(guardian.id, child.id, "manual");
  await learningLoop.confirmQuestionAsync(guardian.id, draft.id, { stem });
}

test("free accounts have a trackable monthly photo quota and a clear message at the limit", async () => {
  let now = Date.parse("2026-08-10T10:00:00+08:00");
  const learningLoop = new LearningLoop(undefined, { now: () => now });
  const { guardian, child } = await confirmedGuardianWithChild(learningLoop);

  const initial = await learningLoop.getEntitlementsAsync(guardian.id);
  assert.equal(initial.plan, "free");
  assert.equal(initial.monthlyPhotoQuota, 20);
  assert.equal(initial.photosUsedThisMonth, 0);

  for (let index = 1; index <= 20; index += 1) {
    await captureQuestion(learningLoop, guardian, child, `第 ${index} 题`);
  }

  assert.equal((await learningLoop.getEntitlementsAsync(guardian.id)).photosUsedThisMonth, 20);
  await assert.rejects(
    captureQuestion(learningLoop, guardian, child, "第 21 题"),
    /额度已用完.*订阅/s,
  );

  now = Date.parse("2026-09-01T00:30:00+08:00");
  assert.equal((await learningLoop.getEntitlementsAsync(guardian.id)).photosUsedThisMonth, 0);
  await captureQuestion(learningLoop, guardian, child, "九月第一题");
  assert.equal((await learningLoop.getEntitlementsAsync(guardian.id)).photosUsedThisMonth, 1);
});

test("subscription unlocks the full report and more child profiles without touching existing data", async () => {
  const now = Date.parse("2026-08-26T10:00:00+08:00");
  const learningLoop = new LearningLoop(undefined, { now: () => now });
  const { guardian, child } = await confirmedGuardianWithChild(learningLoop);

  const draft = await learningLoop.startQuestionDraftAsync(guardian.id, child.id, "manual");
  const question = await learningLoop.confirmQuestionAsync(guardian.id, draft.id, {
    stem: "3 + 5 = ?",
  });
  const mistake = await learningLoop.saveMistakeAsync(guardian.id, question.id, {
    primaryKnowledgePoint: "加法",
  });

  const freeReport = await learningLoop.getWeeklyReportAsync(guardian.id, child.id);
  assert.equal(freeReport.full, false);
  assert.deepEqual(freeReport.weaknesses, []);
  assert.deepEqual(freeReport.nextWeekPlan.focusKnowledgePoints, []);
  assert.match(freeReport.upgradeNote!, /订阅/);
  assert.equal(freeReport.newMistakes, 1);

  await learningLoop.createChildProfileAsync(guardian.id, {
    nickname: "小红",
    grade: 6,
    region: "上海",
  });
  await assert.rejects(
      learningLoop.createChildProfileAsync(guardian.id, {
        nickname: " third ",
        grade: 1,
        region: "北京",
      }),
    /上限.*订阅/s,
  );

  await learningLoop.grantSubscriptionAsync(guardian.id, "subscriber");

  const fullReport = await learningLoop.getWeeklyReportAsync(guardian.id, child.id);
  assert.equal(fullReport.full, true);
  assert.deepEqual(
    fullReport.weaknesses.map((entry) => entry.knowledgePoint),
    ["加法"],
  );
  assert.equal(fullReport.upgradeNote, null);

  const third = await learningLoop.createChildProfileAsync(guardian.id, {
    nickname: "小华",
    grade: 1,
    region: "北京",
  });
  assert.ok(third.id);
  assert.equal((await learningLoop.getEntitlementsAsync(guardian.id)).maxChildProfiles, 5);

  assert.equal((await learningLoop.listMistakesAsync(guardian.id, child.id)).length, 1);
  await learningLoop.deleteMistakeAsync(guardian.id, mistake.id);
  assert.equal((await learningLoop.listMistakesAsync(guardian.id, child.id)).length, 0);
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
  const subscriberFamily = await confirmedGuardianWithChild(learningLoop, "小明");
  const freeGuardian = (await learningLoop.startWeChatLoginAsync("free-code")).account;
  await learningLoop.confirmGuardianshipAsync(freeGuardian.id);
  const freeChild = await learningLoop.createChildProfileAsync(freeGuardian.id, {
    nickname: "小芳",
    grade: 4,
    region: "江苏",
  });

  await learningLoop.grantSubscriptionAsync(subscriberFamily.guardian.id, "subscriber");

  const freeEntitlements = await learningLoop.getEntitlementsAsync(freeGuardian.id);
  assert.equal(freeEntitlements.plan, "free");
  assert.equal(freeEntitlements.monthlyPhotoQuota, 20);
  assert.equal(freeEntitlements.monthlyVariantExerciseQuota, 10);

  const draft = await learningLoop.startQuestionDraftAsync(
    freeGuardian.id,
    freeChild.id,
    "manual",
  );
  const question = await learningLoop.confirmQuestionAsync(freeGuardian.id, draft.id, {
    stem: "7 + 6 = ?",
  });
  const mistake = await learningLoop.saveMistakeAsync(freeGuardian.id, question.id, {
    primaryKnowledgePoint: "加法",
  });

  for (let index = 0; index < 10; index += 1) {
    const session = await learningLoop.startReviewAsync(freeGuardian.id, mistake.id, {
      exercise: "variant",
    });
    await learningLoop.completeReviewAsync(freeGuardian.id, session.reviewId, {
      selfAssessment: "partially",
      variantCorrect: true,
    });
  }

  assert.equal(
    (await learningLoop.getEntitlementsAsync(freeGuardian.id))
      .variantExercisesUsedThisMonth,
    10,
  );
  await assert.rejects(
    learningLoop.startReviewAsync(freeGuardian.id, mistake.id, {
      exercise: "variant",
    }),
    /变式练习额度已用完.*订阅/s,
  );

  const originalSession = await learningLoop.startReviewAsync(
    freeGuardian.id,
    mistake.id,
  );
  assert.equal(originalSession.exercise.kind, "original");

  const subscriberMistakeDraft = await learningLoop.startQuestionDraftAsync(
    subscriberFamily.guardian.id,
    subscriberFamily.child.id,
    "manual",
  );
  const subscriberQuestion = await learningLoop.confirmQuestionAsync(
    subscriberFamily.guardian.id,
    subscriberMistakeDraft.id,
    { stem: "1 + 1 = ?" },
  );
  const subscriberMistake = await learningLoop.saveMistakeAsync(
    subscriberFamily.guardian.id,
    subscriberQuestion.id,
    { primaryKnowledgePoint: "加法" },
  );
  for (let index = 0; index < 11; index += 1) {
    await learningLoop.startReviewAsync(subscriberFamily.guardian.id, subscriberMistake.id, {
      exercise: "variant",
    });
  }
  assert.equal(
    (await learningLoop.getEntitlementsAsync(subscriberFamily.guardian.id))
      .monthlyVariantExerciseQuota,
    null,
  );
});
