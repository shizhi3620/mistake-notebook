import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import { LearningLoop } from "../src/learning-loop.ts";
import { SqliteLearningLoopStore } from "../src/sqlite-learning-loop-store.ts";

test("a guardian must confirm guardianship before creating a child profile", async () => {
  const learningLoop = new LearningLoop();
  const account = (await learningLoop.startWeChatLoginAsync("test-wechat-code")).account;

  await assert.rejects(
    () =>
      learningLoop.createChildProfileAsync(account.id, {
        nickname: "小明",
        grade: 3,
        region: "浙江",
      }),
    /guardianship confirmation/i,
  );
});

test("a confirmed guardian can create a minimal child profile", async () => {
  const learningLoop = new LearningLoop();
  const account = (await learningLoop.startWeChatLoginAsync("test-wechat-code")).account;

  await learningLoop.confirmGuardianshipAsync(account.id);

  const child = await learningLoop.createChildProfileAsync(account.id, {
    nickname: "小明",
    grade: 3,
    location: {
      provinceCode: "330000",
      provinceName: "浙江省",
      cityCode: "330100",
      cityName: "杭州市",
    },
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
      region: "浙江省 杭州市",
      location: {
        provinceCode: "330000",
        provinceName: "浙江省",
        cityCode: "330100",
        cityName: "杭州市",
      },
      textbookVersion: "人教版",
    },
  );
});

test("a selected child profile is restored only for its guardian", async () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), "mistake-notebook-")), "learning.db");
  const firstStore = new SqliteLearningLoopStore(databasePath);
  const firstLearningLoop = new LearningLoop(firstStore);
  const guardian = (await firstLearningLoop.startWeChatLoginAsync("guardian-code")).account;

  await firstLearningLoop.confirmGuardianshipAsync(guardian.id);
  const child = await firstLearningLoop.createChildProfileAsync(guardian.id, {
    nickname: "小明",
    grade: 3,
    region: "浙江",
  });
  firstStore.close();

  const restoredStore = new SqliteLearningLoopStore(databasePath);
  const restoredLearningLoop = new LearningLoop(restoredStore);

  assert.deepEqual(await restoredLearningLoop.getSelectedChildProfileAsync(guardian.id), child);
  await assert.rejects(
    () => restoredLearningLoop.getSelectedChildProfileAsync("parent-without-access"),
    /parent account was not found/i,
  );
  restoredStore.close();
});

test("SQLite keeps legacy regions pending and persists selected province/city", () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), "mistake-notebook-")), "learning.db");
  const legacyDatabase = new Database(databasePath);
  legacyDatabase.exec(`
    CREATE TABLE child_profiles (
      id TEXT PRIMARY KEY,
      parent_account_id TEXT NOT NULL,
      nickname TEXT NOT NULL,
      grade INTEGER NOT NULL,
      region TEXT NOT NULL,
      textbook_version TEXT
    );
    INSERT INTO child_profiles
      (id, parent_account_id, nickname, grade, region)
      VALUES ('legacy-child', 'parent-1', '小明', 3, '浙江');
  `);
  legacyDatabase.close();

  const store = new SqliteLearningLoopStore(databasePath);
  assert.deepEqual(store.listChildProfiles("parent-1")[0], {
    id: "legacy-child",
    parentAccountId: "parent-1",
    nickname: "小明",
    grade: 3,
    region: "浙江",
  });

  store.createChildProfile({
    id: "new-child",
    parentAccountId: "parent-1",
    nickname: "小红",
    grade: 4,
    region: "上海市 上海市",
    location: {
      provinceCode: "310000",
      provinceName: "上海市",
      cityCode: "310100",
      cityName: "上海市",
    },
  });
  assert.deepEqual(store.findChildProfile("parent-1", "new-child")?.location, {
    provinceCode: "310000",
    provinceName: "上海市",
    cityCode: "310100",
    cityName: "上海市",
  });
  store.close();
});

test("a guardian can edit and switch only their own child profiles", async () => {
  const learningLoop = new LearningLoop();
  const guardian = (await learningLoop.startWeChatLoginAsync("guardian-code")).account;
  const otherGuardian = (await learningLoop.startWeChatLoginAsync("other-guardian-code")).account;

  await learningLoop.confirmGuardianshipAsync(guardian.id);
  await learningLoop.confirmGuardianshipAsync(otherGuardian.id);
  const firstChild = await learningLoop.createChildProfileAsync(guardian.id, {
    nickname: "小明",
    grade: 3,
    region: "浙江",
  });
  const secondChild = await learningLoop.createChildProfileAsync(guardian.id, {
    nickname: "小红",
    grade: 6,
    region: "上海",
  });

  assert.deepEqual(
    await learningLoop.updateChildProfileAsync(guardian.id, firstChild.id, {
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

  await learningLoop.selectChildProfileAsync(guardian.id, secondChild.id);
  assert.deepEqual(await learningLoop.getSelectedChildProfileAsync(guardian.id), secondChild);
  await assert.rejects(
    () => learningLoop.selectChildProfileAsync(otherGuardian.id, secondChild.id),
    /not available to this guardian/i,
  );
});

test("child profiles require a nickname and valid grade, with optional province", async () => {
  const learningLoop = new LearningLoop();
  const guardian = (await learningLoop.startWeChatLoginAsync("guardian-code")).account;

  await learningLoop.confirmGuardianshipAsync(guardian.id);

  await assert.rejects(
    () =>
      learningLoop.createChildProfileAsync(guardian.id, {
        nickname: "",
        grade: 3,
        region: "浙江",
      }),
    /nickname/i,
  );
  await assert.rejects(
    () =>
      learningLoop.createChildProfileAsync(guardian.id, {
        nickname: "小明",
        grade: 10,
        region: "浙江",
      }),
    /grade/i,
  );
  const withoutProvince = await learningLoop.createChildProfileAsync(guardian.id, {
    nickname: "小明",
    grade: 3,
  });
  assert.equal(withoutProvince.region, undefined);
  await assert.rejects(
    () =>
      learningLoop.createChildProfileAsync(guardian.id, {
        nickname: "小红",
        grade: 3,
        location: { provinceCode: "bad", provinceName: "浙江省" },
      }),
    /province is invalid/i,
  );
});

test("login issues an expiring session without exposing the WeChat credential", async () => {
  const learningLoop = new LearningLoop();
  const login = await learningLoop.startWeChatLoginAsync("secret-wechat-code");

  assert.match(login.session.token, /^[0-9a-f-]{36}$/i);
  assert.ok(login.session.expiresAt > Date.now());
  assert.equal(JSON.stringify(login).includes("secret-wechat-code"), false);

  assert.deepEqual(await learningLoop.resumeSessionAsync(login.session.token), login.account);
});

test("a WeChat identity restores its persisted guardian account", async () => {
  const learningLoop = new LearningLoop();
  const firstLogin = await learningLoop.startWeChatLoginAsync("openid-guardian");
  await learningLoop.confirmGuardianshipAsync(firstLogin.account.id);

  const secondLogin = await learningLoop.startWeChatLoginAsync("openid-guardian");

  assert.equal(secondLogin.account.id, firstLogin.account.id);
  assert.equal(secondLogin.account.guardianshipConfirmed, true);
  assert.notEqual(secondLogin.session.token, firstLogin.session.token);
});

test("deleting a guardian releases its WeChat identity", async () => {
  const learningLoop = new LearningLoop();
  const firstLogin = await learningLoop.startWeChatLoginAsync("openid-deleted-guardian");

  await learningLoop.deleteParentAccountAsync(firstLogin.account.id);
  const secondLogin = await learningLoop.startWeChatLoginAsync("openid-deleted-guardian");

  assert.notEqual(secondLogin.account.id, firstLogin.account.id);
});

test("an expired or unknown session asks the guardian to log in again", async () => {
  let now = 1_000_000;
  const learningLoop = new LearningLoop(undefined, { now: () => now });
  const login = await learningLoop.startWeChatLoginAsync("wechat-code");

  assert.deepEqual(await learningLoop.resumeSessionAsync(login.session.token), login.account);

  now += 100 * 24 * 60 * 60 * 1000;

  await assert.rejects(
    () => learningLoop.resumeSessionAsync(login.session.token),
    /log in again/i,
  );
  await assert.rejects(
    () => learningLoop.resumeSessionAsync("no-such-token"),
    /log in again/i,
  );
});
