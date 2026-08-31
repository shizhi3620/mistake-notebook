import assert from "node:assert/strict";
import test from "node:test";

import {
  LearningLoop,
  type ChildProfile,
  type MistakeRecord,
  type ParentAccount,
} from "../src/learning-loop.ts";

async function confirmedGuardian(learningLoop: LearningLoop): Promise<ParentAccount> {
  const guardian = (await learningLoop.startWeChatLoginAsync("guardian-code")).account;
  await learningLoop.confirmGuardianshipAsync(guardian.id);
  return guardian;
}

async function addChild(
  learningLoop: LearningLoop,
  guardian: ParentAccount,
  nickname = "小明",
): Promise<ChildProfile> {
  return learningLoop.createChildProfileAsync(guardian.id, {
    nickname,
    grade: 3,
    region: "浙江",
  });
}

async function saveMistake(
  learningLoop: LearningLoop,
  guardian: ParentAccount,
  child: ChildProfile,
  stem: string,
): Promise<MistakeRecord> {
  const draft = await learningLoop.startQuestionDraftAsync(guardian.id, child.id, "manual");
  const question = await learningLoop.confirmQuestionAsync(guardian.id, draft.id, { stem });
  return learningLoop.saveMistakeAsync(guardian.id, question.id, {
    primaryKnowledgePoint: "20以内进位加法",
  });
}

test("home guides profile creation when empty and shows today's work otherwise", async () => {
  let now = Date.parse("2026-08-27T09:00:00+08:00");
  const learningLoop = new LearningLoop(undefined, { now: () => now });
  const guardian = await confirmedGuardian(learningLoop);

  assert.deepEqual(await learningLoop.getHomeOverviewAsync(guardian.id), {
    stage: "no-child-profile",
  });

  const child = await addChild(learningLoop, guardian);
  const first = await saveMistake(learningLoop, guardian, child, "3 + 5 = ?");
  now += 60_000;
  await saveMistake(learningLoop, guardian, child, "9 - 4 = ?");

  now = Date.parse("2026-08-28T08:00:00+08:00");
  const overview = await learningLoop.getHomeOverviewAsync(guardian.id);

  assert.equal(overview.stage, "ready");
  if (overview.stage !== "ready") {
    return;
  }
  assert.equal(overview.child.id, child.id);
  assert.equal(overview.dueReviewCount, 2);
  assert.deepEqual(
    overview.dueReviews.map((entry) => entry.stem),
    ["3 + 5 = ?", "9 - 4 = ?"],
  );
  assert.deepEqual(
    overview.recentMistakes.map((entry) => entry.stem),
    ["9 - 4 = ?", "3 + 5 = ?"],
  );
  assert.equal(overview.sevenDaySummary.newMistakes, 2);
  assert.equal(overview.sevenDaySummary.completedReviews, 0);
  assert.equal(overview.streakDays, 0);
  assert.ok(overview.dueReviews.some((entry) => entry.id === first.id));
});

test("home falls back to a valid profile after the selected child is deleted", async () => {
  const learningLoop = new LearningLoop();
  const guardian = await confirmedGuardian(learningLoop);
  const firstChild = await addChild(learningLoop, guardian, "小明");
  const secondChild = await addChild(learningLoop, guardian, "小红");
  await saveMistake(learningLoop, guardian, secondChild, "2x = 10");

  await learningLoop.selectChildProfileAsync(guardian.id, firstChild.id);
  await learningLoop.deleteChildProfileAsync(guardian.id, firstChild.id);

  const overview = await learningLoop.getHomeOverviewAsync(guardian.id);
  assert.equal(overview.stage, "ready");
  if (overview.stage !== "ready") {
    return;
  }
  assert.equal(overview.child.id, secondChild.id);

  await learningLoop.deleteChildProfileAsync(guardian.id, secondChild.id);
  assert.deepEqual(await learningLoop.getHomeOverviewAsync(guardian.id), {
    stage: "no-child-profile",
  });
});

test("completing today's reviews from the todo updates the summary and the child's own streak", async () => {
  let now = Date.parse("2026-08-25T09:00:00+08:00");
  const learningLoop = new LearningLoop(undefined, { now: () => now });
  const guardian = await confirmedGuardian(learningLoop);
  const child = await addChild(learningLoop, guardian);
  const otherChild = await addChild(learningLoop, guardian, "小红");
  const mistake = await saveMistake(learningLoop, guardian, child, "3 + 5 = ?");
  const otherMistake = await saveMistake(
    learningLoop,
    guardian,
    otherChild,
    "2x = 10",
  );

  const reviewNow = async (mistakeId: string) => {
    const session = await learningLoop.startReviewAsync(guardian.id, mistakeId);
    await learningLoop.completeReviewAsync(guardian.id, session.reviewId, {
      selfAssessment: "mastered",
      variantCorrect: null,
    });
  };

  now = Date.parse("2026-08-26T08:00:00+08:00");
  await reviewNow(mistake.id);
  await reviewNow(otherMistake.id);

  now = Date.parse("2026-08-27T08:00:00+08:00");
  await reviewNow(mistake.id);

  await learningLoop.selectChildProfileAsync(guardian.id, child.id);
  const overview = await learningLoop.getHomeOverviewAsync(guardian.id);
  assert.equal(overview.stage, "ready");
  if (overview.stage !== "ready") {
    return;
  }
  assert.equal(overview.dueReviewCount, 0);
  assert.equal(overview.sevenDaySummary.completedReviews, 2);
  assert.equal(overview.streakDays, 2);

  await learningLoop.selectChildProfileAsync(guardian.id, otherChild.id);
  const otherOverview = await learningLoop.getHomeOverviewAsync(guardian.id);
  assert.equal(otherOverview.stage, "ready");
  if (otherOverview.stage !== "ready") {
    return;
  }
  assert.equal(otherOverview.sevenDaySummary.completedReviews, 1);
  assert.equal(otherOverview.streakDays, 1);
});
