import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { LearningLoop } from "../src/learning-loop.ts";
import { SqliteLearningLoopStore } from "../src/sqlite-learning-loop-store.ts";

test("a guardian must confirm guardianship before creating a child profile", () => {
  const learningLoop = new LearningLoop();
  const account = learningLoop.startWeChatLogin("test-wechat-code").account;

  assert.throws(
    () =>
      learningLoop.createChildProfile(account.id, {
        nickname: "小明",
        grade: 3,
        region: "浙江",
      }),
    /guardianship confirmation/i,
  );
});

test("a confirmed guardian can create a minimal child profile", () => {
  const learningLoop = new LearningLoop();
  const account = learningLoop.startWeChatLogin("test-wechat-code").account;

  learningLoop.confirmGuardianship(account.id);

  const child = learningLoop.createChildProfile(account.id, {
    nickname: "小明",
    grade: 3,
    region: "浙江",
    textbookVersion: "人教版",
  });

  assert.match(child.id, /^[0-9a-f-]{36}$/i);
  assert.deepEqual(
    { ...child, id: "generated-id" },
    {
      id: "generated-id",
      parentAccountId: account.id,
      nickname: "小明",
      grade: 3,
      region: "浙江",
      textbookVersion: "人教版",
    },
  );
});

test("a selected child profile is restored only for its guardian", () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), "mistake-notebook-")), "learning.db");
  const firstStore = new SqliteLearningLoopStore(databasePath);
  const firstLearningLoop = new LearningLoop(firstStore);
  const guardian = firstLearningLoop.startWeChatLogin("guardian-code").account;

  firstLearningLoop.confirmGuardianship(guardian.id);
  const child = firstLearningLoop.createChildProfile(guardian.id, {
    nickname: "小明",
    grade: 3,
    region: "浙江",
  });
  firstStore.close();

  const restoredStore = new SqliteLearningLoopStore(databasePath);
  const restoredLearningLoop = new LearningLoop(restoredStore);

  assert.deepEqual(restoredLearningLoop.getSelectedChildProfile(guardian.id), child);
  assert.throws(
    () => restoredLearningLoop.getSelectedChildProfile("parent-without-access"),
    /parent account was not found/i,
  );
  restoredStore.close();
});

test("a guardian can edit and switch only their own child profiles", () => {
  const learningLoop = new LearningLoop();
  const guardian = learningLoop.startWeChatLogin("guardian-code").account;
  const otherGuardian = learningLoop.startWeChatLogin("other-guardian-code").account;

  learningLoop.confirmGuardianship(guardian.id);
  learningLoop.confirmGuardianship(otherGuardian.id);
  const firstChild = learningLoop.createChildProfile(guardian.id, {
    nickname: "小明",
    grade: 3,
    region: "浙江",
  });
  const secondChild = learningLoop.createChildProfile(guardian.id, {
    nickname: "小红",
    grade: 6,
    region: "上海",
  });

  assert.deepEqual(
    learningLoop.updateChildProfile(guardian.id, firstChild.id, {
      nickname: "小明同学",
      grade: 4,
      region: "浙江",
    }),
    {
      ...firstChild,
      nickname: "小明同学",
      grade: 4,
    },
  );

  learningLoop.selectChildProfile(guardian.id, secondChild.id);
  assert.deepEqual(learningLoop.getSelectedChildProfile(guardian.id), secondChild);
  assert.throws(
    () => learningLoop.selectChildProfile(otherGuardian.id, secondChild.id),
    /not available to this guardian/i,
  );
});

test("child profiles require a nickname, a grade from one to nine, and a region", () => {
  const learningLoop = new LearningLoop();
  const guardian = learningLoop.startWeChatLogin("guardian-code").account;

  learningLoop.confirmGuardianship(guardian.id);

  assert.throws(
    () =>
      learningLoop.createChildProfile(guardian.id, {
        nickname: "",
        grade: 3,
        region: "浙江",
      }),
    /nickname/i,
  );
  assert.throws(
    () =>
      learningLoop.createChildProfile(guardian.id, {
        nickname: "小明",
        grade: 10,
        region: "浙江",
      }),
    /grade/i,
  );
  assert.throws(
    () =>
      learningLoop.createChildProfile(guardian.id, {
        nickname: "小明",
        grade: 3,
        region: "",
      }),
    /region/i,
  );
});

test("login issues an expiring session without exposing the WeChat credential", () => {
  const learningLoop = new LearningLoop();
  const login = learningLoop.startWeChatLogin("secret-wechat-code");

  assert.match(login.session.token, /^[0-9a-f-]{36}$/i);
  assert.ok(login.session.expiresAt > Date.now());
  assert.equal(JSON.stringify(login).includes("secret-wechat-code"), false);

  assert.deepEqual(learningLoop.resumeSession(login.session.token), login.account);
});

test("an expired or unknown session asks the guardian to log in again", () => {
  let now = 1_000_000;
  const learningLoop = new LearningLoop(undefined, { now: () => now });
  const login = learningLoop.startWeChatLogin("wechat-code");

  assert.deepEqual(learningLoop.resumeSession(login.session.token), login.account);

  now += 100 * 24 * 60 * 60 * 1000;

  assert.throws(
    () => learningLoop.resumeSession(login.session.token),
    /log in again/i,
  );
  assert.throws(
    () => learningLoop.resumeSession("no-such-token"),
    /log in again/i,
  );
});
