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

function saveMistake(
  learningLoop: LearningLoop,
  guardian: ParentAccount,
  child: ChildProfile,
  stem: string,
  details: {
    primaryKnowledgePoint: string;
    secondaryKnowledgePoints?: string[];
    mistakeCause?: string;
  },
): MistakeRecord {
  const draft = learningLoop.startQuestionDraft(guardian.id, child.id, "manual");
  const question = learningLoop.confirmQuestion(guardian.id, draft.id, { stem });
  return learningLoop.saveMistake(guardian.id, question.id, details);
}

test("saved mistakes appear in the child's mistake book with their learning details", () => {
  let now = 1_000_000;
  const learningLoop = new LearningLoop(undefined, { now: () => now });
  const { guardian, child } = confirmedGuardianWithChild(learningLoop);

  const first = saveMistake(learningLoop, guardian, child, "3 + 5 = ?", {
    primaryKnowledgePoint: "20以内进位加法",
    mistakeCause: "粗心",
  });
  now += 60_000;
  saveMistake(learningLoop, guardian, child, "9 - 4 = ?", {
    primaryKnowledgePoint: "20以内退位减法",
  });

  const entries = learningLoop.listMistakes(guardian.id, child.id);

  assert.equal(entries.length, 2);
  assert.deepEqual(
    entries.find((entry) => entry.id === first.id),
    {
      ...first,
      masteryStatus: "not-started",
      stem: "3 + 5 = ?",
    },
  );

  const otherChild = learningLoop.createChildProfile(guardian.id, {
    nickname: "小红",
    grade: 6,
    region: "上海",
  });
  assert.deepEqual(learningLoop.listMistakes(guardian.id, otherChild.id), []);

  const otherGuardian = learningLoop.startWeChatLogin("other-code").account;
  learningLoop.confirmGuardianship(otherGuardian.id);
  assert.throws(
    () => learningLoop.listMistakes(otherGuardian.id, child.id),
    /not available to this guardian/i,
  );
});

test("parents can combine knowledge point, cause, date, mastery, and keyword filters", () => {
  let now = 1_000_000;
  const learningLoop = new LearningLoop(undefined, { now: () => now });
  const { guardian, child } = confirmedGuardianWithChild(learningLoop);

  saveMistake(learningLoop, guardian, child, "3 + 5 = ?", {
    primaryKnowledgePoint: "20以内进位加法",
    secondaryKnowledgePoints: ["凑十法"],
    mistakeCause: "粗心抄错数字",
  });
  now += 60_000;
  saveMistake(learningLoop, guardian, child, "9 - 4 = ?", {
    primaryKnowledgePoint: "20以内退位减法",
    mistakeCause: "概念不清",
  });
  now += 60_000;
  const third = saveMistake(learningLoop, guardian, child, "长方形面积是多少", {
    primaryKnowledgePoint: "长方形面积",
    secondaryKnowledgePoints: ["面积单位"],
    mistakeCause: "粗心",
  });

  const all = learningLoop.listMistakes(guardian.id, child.id);
  assert.equal(all.length, 3);

  expectStems(
    learningLoop.listMistakes(guardian.id, child.id, {
      knowledgePoint: "加法",
    }),
    ["3 + 5 = ?"],
  );
  expectStems(
    learningLoop.listMistakes(guardian.id, child.id, {
      knowledgePoint: "面积单位",
    }),
    ["长方形面积是多少"],
  );
  expectStems(
    learningLoop.listMistakes(guardian.id, child.id, {
      mistakeCause: "粗心",
    }),
    ["3 + 5 = ?", "长方形面积是多少"],
  );
  expectStems(
    learningLoop.listMistakes(guardian.id, child.id, {
      createdFrom: 1_060_000,
    }),
    ["9 - 4 = ?", "长方形面积是多少"],
  );
  expectStems(
    learningLoop.listMistakes(guardian.id, child.id, {
      createdTo: 1_060_000,
    }),
    ["3 + 5 = ?", "9 - 4 = ?"],
  );
  expectStems(
    learningLoop.listMistakes(guardian.id, child.id, { keyword: "面积" }),
    ["长方形面积是多少"],
  );
  expectStems(
    learningLoop.listMistakes(guardian.id, child.id, {
      masteryStatus: "not-started",
    }),
    ["3 + 5 = ?", "9 - 4 = ?", "长方形面积是多少"],
  );
  expectStems(
    learningLoop.listMistakes(guardian.id, child.id, {
      masteryStatus: "mastered",
    }),
    [],
  );
  expectStems(
    learningLoop.listMistakes(guardian.id, child.id, {
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
  const { guardian, child } = confirmedGuardianWithChild(learningLoop);

  const original = saveMistake(learningLoop, guardian, child, "3 + 5 = ?", {
    primaryKnowledgePoint: "20以内进位加法",
    secondaryKnowledgePoints: ["凑十法"],
    mistakeCause: "粗心",
  });
  const duplicate = saveMistake(learningLoop, guardian, child, "3+5=?", {
    primaryKnowledgePoint: "20以内进位加法",
    secondaryKnowledgePoints: ["数的组成"],
  });
  saveMistake(learningLoop, guardian, child, "9 - 4 = ?", {
    primaryKnowledgePoint: "20以内退位减法",
  });

  const suspected = learningLoop.findDuplicateMistakes(guardian.id, child.id);

  assert.equal(suspected.length, 1);
  assert.deepEqual(
    suspected[0]?.map((entry) => entry.id).sort(),
    [original.id, duplicate.id].sort(),
  );

  assert.equal(learningLoop.listMistakes(guardian.id, child.id).length, 3);

  const merged = learningLoop.mergeMistakes(
    guardian.id,
    original.id,
    duplicate.id,
  );

  assert.equal(merged.id, original.id);
  assert.deepEqual(merged.secondaryKnowledgePoints, ["凑十法", "数的组成"]);

  const remaining = learningLoop.listMistakes(guardian.id, child.id);
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
  const { guardian, child } = confirmedGuardianWithChild(learningLoop);
  const otherChild = learningLoop.createChildProfile(guardian.id, {
    nickname: "小红",
    grade: 6,
    region: "上海",
  });

  const first = saveMistake(learningLoop, guardian, child, "3 + 5 = ?", {
    primaryKnowledgePoint: "20以内进位加法",
  });
  const second = saveMistake(learningLoop, guardian, child, "9 - 4 = ?", {
    primaryKnowledgePoint: "20以内退位减法",
  });
  const otherChildMistake = saveMistake(
    learningLoop,
    guardian,
    otherChild,
    "2x = 10",
    { primaryKnowledgePoint: "简易方程" },
  );

  learningLoop.deleteMistake(guardian.id, first.id);

  expectStems(learningLoop.listMistakes(guardian.id, child.id), ["9 - 4 = ?"]);
  await assert.rejects(
    learningLoop.getExplanation(guardian.id, first.questionId),
    /not available to this guardian/i,
  );

  learningLoop.selectChildProfile(guardian.id, child.id);
  learningLoop.deleteChildProfile(guardian.id, child.id);

  assert.equal(learningLoop.getSelectedChildProfile(guardian.id), undefined);
  assert.throws(
    () => learningLoop.listMistakes(guardian.id, child.id),
    /not available to this guardian/i,
  );
  await assert.rejects(
    learningLoop.getExplanation(guardian.id, second.questionId),
    /not available to this guardian/i,
  );

  expectStems(learningLoop.listMistakes(guardian.id, otherChild.id), ["2x = 10"]);
  assert.ok(
    await learningLoop.getExplanation(guardian.id, otherChildMistake.questionId),
  );

  store.close();

  const reopenedStore = new SqliteLearningLoopStore(databasePath);
  const reopenedLoop = new LearningLoop(reopenedStore);
  assert.equal(reopenedLoop.getSelectedChildProfile(guardian.id), undefined);
  assert.throws(
    () => reopenedLoop.listMistakes(guardian.id, child.id),
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

test("deleting the account removes every child, session, and learning record", () => {
  const learningLoop = new LearningLoop();
  const login = learningLoop.startWeChatLogin("guardian-code");
  const guardian = login.account;
  learningLoop.confirmGuardianship(guardian.id);
  const child = learningLoop.createChildProfile(guardian.id, {
    nickname: "小明",
    grade: 3,
    region: "浙江",
  });
  const mistake = saveMistake(learningLoop, guardian, child, "3 + 5 = ?", {
    primaryKnowledgePoint: "20以内进位加法",
  });

  learningLoop.deleteParentAccount(guardian.id);

  assert.throws(
    () => learningLoop.resumeSession(login.session.token),
    /log in again/i,
  );
  assert.throws(
    () => learningLoop.getSelectedChildProfile(guardian.id),
    /parent account was not found/i,
  );
  assert.throws(
    () => learningLoop.listMistakes(guardian.id, child.id),
    /parent account was not found/i,
  );
  assert.throws(
    () =>
      learningLoop.updateMistakeCause(guardian.id, mistake.id, "粗心"),
    /parent account was not found/i,
  );
});
