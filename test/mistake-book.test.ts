import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  LearningLoop,
  type ChildProfile,
  type MistakeRecord,
  type ParentAccount,
} from "../src/learning-loop.ts";
import { SqliteLearningLoopStore } from "../src/sqlite-learning-loop-store.ts";

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

async function saveMistake(
  learningLoop: LearningLoop,
  guardian: ParentAccount,
  child: ChildProfile,
  stem: string,
  details: {
    primaryKnowledgePoint: string;
    secondaryKnowledgePoints?: string[];
    mistakeCause?: string;
  },
): Promise<MistakeRecord> {
  const draft = await learningLoop.startQuestionDraftAsync(guardian.id, child.id, "manual");
  const question = await learningLoop.confirmQuestionAsync(guardian.id, draft.id, { stem });
  return learningLoop.saveMistakeAsync(guardian.id, question.id, details);
}

test("saved mistakes appear in the child's mistake book with their learning details", async () => {
  let now = 1_000_000;
  const learningLoop = new LearningLoop(undefined, { now: () => now });
  const { guardian, child } = await confirmedGuardianWithChild(learningLoop);

  const first = await saveMistake(learningLoop, guardian, child, "3 + 5 = ?", {
    primaryKnowledgePoint: "20以内进位加法",
    mistakeCause: "粗心",
  });
  now += 60_000;
  await saveMistake(learningLoop, guardian, child, "9 - 4 = ?", {
    primaryKnowledgePoint: "20以内退位减法",
  });

  const entries = await learningLoop.listMistakesAsync(guardian.id, child.id);

  assert.equal(entries.length, 2);
  assert.deepEqual(
    entries.find((entry) => entry.id === first.id),
    {
      ...first,
      masteryStatus: "not-started",
      stem: "3 + 5 = ?",
    },
  );

  const otherChild = await learningLoop.createChildProfileAsync(guardian.id, {
    nickname: "小红",
    grade: 6,
    region: "上海",
  });
  assert.deepEqual(await learningLoop.listMistakesAsync(guardian.id, otherChild.id), []);

  const otherGuardian = (await learningLoop.startWeChatLoginAsync("other-code")).account;
  await learningLoop.confirmGuardianshipAsync(otherGuardian.id);
  await assert.rejects(
    learningLoop.listMistakesAsync(otherGuardian.id, child.id),
    /not available to this guardian/i,
  );
});

test("parents can combine knowledge point, cause, date, mastery, and keyword filters", async () => {
  let now = 1_000_000;
  const learningLoop = new LearningLoop(undefined, { now: () => now });
  const { guardian, child } = await confirmedGuardianWithChild(learningLoop);

  await saveMistake(learningLoop, guardian, child, "3 + 5 = ?", {
    primaryKnowledgePoint: "20以内进位加法",
    secondaryKnowledgePoints: ["凑十法"],
    mistakeCause: "粗心抄错数字",
  });
  now += 60_000;
  await saveMistake(learningLoop, guardian, child, "9 - 4 = ?", {
    primaryKnowledgePoint: "20以内退位减法",
    mistakeCause: "概念不清",
  });
  now += 60_000;
  const third = await saveMistake(learningLoop, guardian, child, "长方形面积是多少", {
    primaryKnowledgePoint: "长方形面积",
    secondaryKnowledgePoints: ["面积单位"],
    mistakeCause: "粗心",
  });

  const all = await learningLoop.listMistakesAsync(guardian.id, child.id);
  assert.equal(all.length, 3);

  expectStems(
    await learningLoop.listMistakesAsync(guardian.id, child.id, {
      knowledgePoint: "加法",
    }),
    ["3 + 5 = ?"],
  );
  expectStems(
    await learningLoop.listMistakesAsync(guardian.id, child.id, {
      knowledgePoint: "面积单位",
    }),
    ["长方形面积是多少"],
  );
  expectStems(
    await learningLoop.listMistakesAsync(guardian.id, child.id, {
      mistakeCause: "粗心",
    }),
    ["3 + 5 = ?", "长方形面积是多少"],
  );
  expectStems(
    await learningLoop.listMistakesAsync(guardian.id, child.id, {
      createdFrom: 1_060_000,
    }),
    ["9 - 4 = ?", "长方形面积是多少"],
  );
  expectStems(
    await learningLoop.listMistakesAsync(guardian.id, child.id, {
      createdTo: 1_060_000,
    }),
    ["3 + 5 = ?", "9 - 4 = ?"],
  );
  expectStems(
    await learningLoop.listMistakesAsync(guardian.id, child.id, { keyword: "面积" }),
    ["长方形面积是多少"],
  );
  expectStems(
    await learningLoop.listMistakesAsync(guardian.id, child.id, {
      masteryStatus: "not-started",
    }),
    ["3 + 5 = ?", "9 - 4 = ?", "长方形面积是多少"],
  );
  expectStems(
    await learningLoop.listMistakesAsync(guardian.id, child.id, {
      masteryStatus: "mastered",
    }),
    [],
  );
  expectStems(
    await learningLoop.listMistakesAsync(guardian.id, child.id, {
      mistakeCause: "粗心",
      createdFrom: 1_060_000,
      keyword: "面积",
    }),
    ["长方形面积是多少"],
  );

  assert.equal(third.masteryStatus, "not-started");

  function expectStems(
    entries: { stem: string }[],
    expectedStems: string[],
  ): void {
    assert.deepEqual(
      entries.map((entry) => entry.stem),
      expectedStems,
    );
  }
});

test("suspected duplicates are only flagged, and merging keeps the record the parent chooses", async () => {
  const learningLoop = new LearningLoop();
  const { guardian, child } = await confirmedGuardianWithChild(learningLoop);

  const original = await saveMistake(learningLoop, guardian, child, "3 + 5 = ?", {
    primaryKnowledgePoint: "20以内进位加法",
    secondaryKnowledgePoints: ["凑十法"],
    mistakeCause: "粗心",
  });
  const duplicate = await saveMistake(learningLoop, guardian, child, "3+5=?", {
    primaryKnowledgePoint: "20以内进位加法",
    secondaryKnowledgePoints: ["数的组成"],
  });
  await saveMistake(learningLoop, guardian, child, "9 - 4 = ?", {
    primaryKnowledgePoint: "20以内退位减法",
  });

  const suspected = await learningLoop.findDuplicateMistakesAsync(guardian.id, child.id);

  assert.equal(suspected.length, 1);
  assert.deepEqual(
    suspected[0]?.map((entry) => entry.id).sort(),
    [original.id, duplicate.id].sort(),
  );

  assert.equal((await learningLoop.listMistakesAsync(guardian.id, child.id)).length, 3);

  const merged = await learningLoop.mergeMistakesAsync(
    guardian.id,
    original.id,
    duplicate.id,
  );

  assert.equal(merged.id, original.id);
  assert.deepEqual(merged.secondaryKnowledgePoints, ["凑十法", "数的组成"]);

  const remaining = await learningLoop.listMistakesAsync(guardian.id, child.id);
  assert.equal(remaining.length, 2);
  assert.equal(
    remaining.find((entry) => entry.id === duplicate.id),
    undefined,
  );
  await assert.rejects(
    learningLoop.getExplanation(guardian.id, duplicate.questionId),
    /not available to this guardian/i,
  );
});

test("deleting a mistake removes its question, and deleting a child removes all their learning data", async () => {
  const databasePath = join(
    mkdtempSync(join(tmpdir(), "mistake-notebook-")),
    "learning.db",
  );
  const store = new SqliteLearningLoopStore(databasePath);
  const learningLoop = new LearningLoop(store, {
    explanationProvider: () => ({
      hint: "提示",
      approach: "思路",
      steps: ["一步"],
      finalAnswer: "8",
      variantExercise: { stem: "4 + 5 = ?", answer: "9" },
    }),
  });
  const { guardian, child } = await confirmedGuardianWithChild(learningLoop);
  const otherChild = await learningLoop.createChildProfileAsync(guardian.id, {
    nickname: "小红",
    grade: 6,
    region: "上海",
  });

  const first = await saveMistake(learningLoop, guardian, child, "3 + 5 = ?", {
    primaryKnowledgePoint: "20以内进位加法",
  });
  const second = await saveMistake(learningLoop, guardian, child, "9 - 4 = ?", {
    primaryKnowledgePoint: "20以内退位减法",
  });
  const otherChildMistake = await saveMistake(
    learningLoop,
    guardian,
    otherChild,
    "2x = 10",
    { primaryKnowledgePoint: "简易方程" },
  );

  await learningLoop.deleteMistakeAsync(guardian.id, first.id);

  expectStems(await learningLoop.listMistakesAsync(guardian.id, child.id), ["9 - 4 = ?"]);
  await assert.rejects(
    learningLoop.getExplanation(guardian.id, first.questionId),
    /not available to this guardian/i,
  );

  await learningLoop.selectChildProfileAsync(guardian.id, child.id);
  await learningLoop.deleteChildProfileAsync(guardian.id, child.id);

  assert.equal(await learningLoop.getSelectedChildProfileAsync(guardian.id), undefined);
  await assert.rejects(
    learningLoop.listMistakesAsync(guardian.id, child.id),
    /not available to this guardian/i,
  );
  await assert.rejects(
    learningLoop.getExplanation(guardian.id, second.questionId),
    /not available to this guardian/i,
  );

  expectStems(await learningLoop.listMistakesAsync(guardian.id, otherChild.id), ["2x = 10"]);
  assert.ok(
    await learningLoop.getExplanation(guardian.id, otherChildMistake.questionId),
  );

  store.close();

  const reopenedStore = new SqliteLearningLoopStore(databasePath);
  const reopenedLoop = new LearningLoop(reopenedStore);
  assert.equal(await reopenedLoop.getSelectedChildProfileAsync(guardian.id), undefined);
  await assert.rejects(
    reopenedLoop.listMistakesAsync(guardian.id, child.id),
    /not available to this guardian/i,
  );
  reopenedStore.close();

  function expectStems(
    entries: { stem: string }[],
    expectedStems: string[],
  ): void {
    assert.deepEqual(
      entries.map((entry) => entry.stem),
      expectedStems,
    );
  }
});

test("deleting the account removes every child, session, and learning record", async () => {
  const learningLoop = new LearningLoop();
  const login = await learningLoop.startWeChatLoginAsync("guardian-code");
  const guardian = login.account;
  await learningLoop.confirmGuardianshipAsync(guardian.id);
  const child = await learningLoop.createChildProfileAsync(guardian.id, {
    nickname: "小明",
    grade: 3,
    region: "浙江",
  });
  const mistake = await saveMistake(learningLoop, guardian, child, "3 + 5 = ?", {
    primaryKnowledgePoint: "20以内进位加法",
  });

  await learningLoop.deleteParentAccountAsync(guardian.id);

  await assert.rejects(
    learningLoop.resumeSessionAsync(login.session.token),
    /log in again/i,
  );
  await assert.rejects(
    learningLoop.getSelectedChildProfileAsync(guardian.id),
    /parent account was not found/i,
  );
  await assert.rejects(
    learningLoop.listMistakesAsync(guardian.id, child.id),
    /parent account was not found/i,
  );
  await assert.rejects(
    learningLoop.updateMistakeCauseAsync(guardian.id, mistake.id, "粗心"),
    /parent account was not found/i,
  );
});

test("deleting a child or account schedules deletion of associated mistake images", async () => {
  const deletedImages: string[] = [];
  const learningLoop = new LearningLoop(undefined, {
    imageDeleter: async (imageKey) => {
      deletedImages.push(imageKey);
    },
  });
  const login = await learningLoop.startWeChatLoginAsync("image-owner");
  await learningLoop.confirmGuardianshipAsync(login.account.id);
  const firstChild = await learningLoop.createChildProfileAsync(login.account.id, {
    nickname: "小明",
    grade: 3,
  });
  const secondChild = await learningLoop.createChildProfileAsync(login.account.id, {
    nickname: "小红",
    grade: 4,
  });

  const addImageMistake = async (child: ChildProfile, stem: string) => {
    const draft = await learningLoop.startQuestionDraftAsync(login.account.id, child.id, "camera");
    const credential = await learningLoop.requestPhotoUploadAsync(login.account.id, draft.id);
    await learningLoop.completePhotoUploadAsync(login.account.id, credential.uploadToken);
    await learningLoop.recordQuestionRecognitionAsync(login.account.id, draft.id, {
      stem,
      formulas: [],
      region: null,
      confidence: 1,
    });
    const question = await learningLoop.confirmQuestionAsync(login.account.id, draft.id, { stem });
    await learningLoop.saveMistakeAsync(login.account.id, question.id, {
      primaryKnowledgePoint: "加法",
    });
    return question.imageKey!;
  };

  const firstImage = await addImageMistake(firstChild, "1 + 1 = ?");
  const secondImage = await addImageMistake(secondChild, "2 + 2 = ?");
  await learningLoop.deleteChildProfileAsync(login.account.id, firstChild.id);
  assert.deepEqual(deletedImages, [firstImage]);

  await learningLoop.deleteParentAccountAsync(login.account.id);
  assert.deepEqual(deletedImages, [firstImage, secondImage]);
  await assert.rejects(
    learningLoop.resumeSessionAsync(login.session.token),
    /log in again/i,
  );
});
