import assert from "node:assert/strict";
import test from "node:test";

import {
  LearningLoop,
  type ChildProfile,
  type MistakeRecord,
  type ParentAccount,
} from "../src/learning-loop.ts";

function confirmedGuardian(learningLoop: LearningLoop): ParentAccount {
  const guardian = learningLoop.startWeChatLogin("guardian-code").account;
  learningLoop.confirmGuardianship(guardian.id);
  return guardian;
}

function addChild(
  learningLoop: LearningLoop,
  guardian: ParentAccount,
  nickname = "小明",
): ChildProfile {
  return learningLoop.createChildProfile(guardian.id, {
    nickname,
    grade: 3,
    region: "浙江",
  });
}

function saveMistake(
  learningLoop: LearningLoop,
  guardian: ParentAccount,
  child: ChildProfile,
  stem: string,
): MistakeRecord {
  const draft = learningLoop.startQuestionDraft(guardian.id, child.id, "manual");
  const question = learningLoop.confirmQuestion(guardian.id, draft.id, { stem });
  return learningLoop.saveMistake(guardian.id, question.id, {
    primaryKnowledgePoint: "20以内进位加法",
  });
}

test("home guides profile creation when empty and shows today's work otherwise", () => {
  let now = Date.parse("2026-08-27T09:00:00+08:00");
  const learningLoop = new LearningLoop(undefined, { now: () => now });
  const guardian = confirmedGuardian(learningLoop);

  assert.deepEqual(learningLoop.getHomeOverview(guardian.id), {
    stage: "no-child-profile",
  });

  const child = addChild(learningLoop, guardian);
  const first = saveMistake(learningLoop, guardian, child, "3 + 5 = ?");
  now += 60_000;
  saveMistake(learningLoop, guardian, child, "9 - 4 = ?");

  now = Date.parse("2026-08-28T08:00:00+08:00");
  const overview = learningLoop.getHomeOverview(guardian.id);

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

test("home falls back to a valid profile after the selected child is deleted", () => {
  const learningLoop = new LearningLoop();
  const guardian = confirmedGuardian(learningLoop);
  const firstChild = addChild(learningLoop, guardian, "小明");
  const secondChild = addChild(learningLoop, guardian, "小红");
  saveMistake(learningLoop, guardian, secondChild, "2x = 10");

  learningLoop.selectChildProfile(guardian.id, firstChild.id);
  learningLoop.deleteChildProfile(guardian.id, firstChild.id);

  const overview = learningLoop.getHomeOverview(guardian.id);
  assert.equal(overview.stage, "ready");
  if (overview.stage !== "ready") {
    return;
  }
  assert.equal(overview.child.id, secondChild.id);

  learningLoop.deleteChildProfile(guardian.id, secondChild.id);
  assert.deepEqual(learningLoop.getHomeOverview(guardian.id), {
    stage: "no-child-profile",
  });
});

test("completing today's reviews from the todo updates the summary and the child's own streak", async () => {
  let now = Date.parse("2026-08-25T09:00:00+08:00");
  const learningLoop = new LearningLoop(undefined, { now: () => now });
  const guardian = confirmedGuardian(learningLoop);
  const child = addChild(learningLoop, guardian);
  const otherChild = addChild(learningLoop, guardian, "小红");
  const mistake = saveMistake(learningLoop, guardian, child, "3 + 5 = ?");
  const otherMistake = saveMistake(
    learningLoop,
    guardian,
    otherChild,
    "2x = 10",
  );

  const reviewNow = async (mistakeId: string) => {
    const session = await learningLoop.startReview(guardian.id, mistakeId);
    learningLoop.completeReview(guardian.id, session.reviewId, {
      selfAssessment: "mastered",
      variantCorrect: null,
    });
  };

  now = Date.parse("2026-08-26T08:00:00+08:00");
  await reviewNow(mistake.id);
  await reviewNow(otherMistake.id);

  now = Date.parse("2026-08-27T08:00:00+08:00");
  await reviewNow(mistake.id);

  learningLoop.selectChildProfile(guardian.id, child.id);
  const overview = learningLoop.getHomeOverview(guardian.id);
  assert.equal(overview.stage, "ready");
  if (overview.stage !== "ready") {
    return;
  }
  assert.equal(overview.dueReviewCount, 0);
  assert.equal(overview.sevenDaySummary.completedReviews, 2);
  assert.equal(overview.streakDays, 2);

  learningLoop.selectChildProfile(guardian.id, otherChild.id);
  const otherOverview = learningLoop.getHomeOverview(guardian.id);
  assert.equal(otherOverview.stage, "ready");
  if (otherOverview.stage !== "ready") {
    return;
  }
  assert.equal(otherOverview.sevenDaySummary.completedReviews, 1);
  assert.equal(otherOverview.streakDays, 1);
});
