import assert from "node:assert/strict";
import test from "node:test";

import {
  LearningLoop,
  type ChildProfile,
  type ParentAccount,
  type ReminderNotification,
} from "../src/learning-loop.ts";

async function confirmedGuardianWithChild(learningLoop: LearningLoop): Promise<{
  guardian: ParentAccount;
  child: ChildProfile;
}> {
  const guardian = (await learningLoop.startWeChatLoginAsync("guardian-code")).account;
  await learningLoop.confirmGuardianshipAsync(guardian.id);
  const child = await learningLoop.createChildProfileAsync(guardian.id, {
    nickname: "小明",
    grade: 3,
    region: "浙江",
  });
  return { guardian, child };
}

async function saveDueMistake(
  learningLoop: LearningLoop,
  guardian: ParentAccount,
  child: ChildProfile,
  stem = "3 + 5 = ?",
): Promise<void> {
  const draft = await learningLoop.startQuestionDraftAsync(guardian.id, child.id, "manual");
  const question = await learningLoop.confirmQuestionAsync(guardian.id, draft.id, { stem });
  await learningLoop.saveMistakeAsync(guardian.id, question.id, {
    primaryKnowledgePoint: "20以内进位加法",
    mistakeCause: "粗心",
  });
}

test("reminders are opt-in and send at most one privacy-safe notification per child per day", async () => {
  // Mistake saved 2026-08-27, due 2026-08-28 (Shanghai).
  let now = Date.parse("2026-08-27T10:00:00+08:00");
  const sent: ReminderNotification[] = [];
  const learningLoop = new LearningLoop(undefined, {
    now: () => now,
    reminderSender: (notification) => {
      sent.push(notification);
    },
  });
  const { guardian, child } = await confirmedGuardianWithChild(learningLoop);
  await saveDueMistake(learningLoop, guardian, child);

  now = Date.parse("2026-08-28T09:00:00+08:00");
  await learningLoop.dispatchDueRemindersAsync();
  assert.equal(sent.length, 0);

  const settings = await learningLoop.updateReminderSettingsAsync(
    guardian.id,
    child.id,
    { enabled: true, hourOfDay: 8 },
  );
  assert.equal(settings.enabled, true);

  now = Date.parse("2026-08-28T07:00:00+08:00");
  await learningLoop.dispatchDueRemindersAsync();
  assert.equal(sent.length, 0);

  now = Date.parse("2026-08-28T09:00:00+08:00");
  await learningLoop.dispatchDueRemindersAsync();
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0], {
    childNickname: "小明",
    dueCount: 1,
    entryPath: `/pages/review/index?childId=${child.id}`,
  });
  assert.equal(JSON.stringify(sent[0]).includes("3 + 5"), false);
  assert.equal(JSON.stringify(sent[0]).includes("粗心"), false);

  await learningLoop.dispatchDueRemindersAsync();
  assert.equal(sent.length, 1);

  now = Date.parse("2026-08-29T09:00:00+08:00");
  await learningLoop.dispatchDueRemindersAsync();
  assert.equal(sent.length, 2);
});

test("failed or unavailable sends are not retried and never touch review state", async () => {
  let now = Date.parse("2026-08-27T10:00:00+08:00");
  let attempts = 0;
  const learningLoop = new LearningLoop(undefined, {
    now: () => now,
    reminderSender: () => {
      attempts += 1;
      throw new Error("template unavailable");
    },
  });
  const { guardian, child } = await confirmedGuardianWithChild(learningLoop);
  await saveDueMistake(learningLoop, guardian, child);
  await learningLoop.updateReminderSettingsAsync(guardian.id, child.id, {
    enabled: true,
    hourOfDay: 8,
  });

  now = Date.parse("2026-08-28T09:00:00+08:00");
  const outcomes = await learningLoop.dispatchDueRemindersAsync();

  assert.deepEqual(outcomes, [{ childProfileId: child.id, status: "failed" }]);
  assert.equal(attempts, 1);

  const retry = await learningLoop.dispatchDueRemindersAsync();
  assert.deepEqual(retry, []);
  assert.equal(attempts, 1);

  assert.equal((await learningLoop.getDueReviewsAsync(guardian.id, child.id)).length, 1);

  let silentNow = Date.parse("2026-08-27T10:00:00+08:00");
  const silent = new LearningLoop(undefined, {
    now: () => silentNow,
  });
  const silentFamily = await confirmedGuardianWithChild(silent);
  await saveDueMistake(silent, silentFamily.guardian, silentFamily.child);
  await silent.updateReminderSettingsAsync(silentFamily.guardian.id, silentFamily.child.id, {
    enabled: true,
    hourOfDay: 8,
  });
  silentNow = Date.parse("2026-08-28T09:00:00+08:00");
  assert.deepEqual(await silent.dispatchDueRemindersAsync(), [
    { childProfileId: silentFamily.child.id, status: "failed" },
  ]);
  assert.equal(
    (await silent.getDueReviewsAsync(silentFamily.guardian.id, silentFamily.child.id)).length,
    1,
  );
});

test("async reminder sender failures are recorded instead of being treated as success", async () => {
  let now = Date.parse("2026-08-30T10:00:00+08:00");
  const learningLoop = new LearningLoop(undefined, {
    now: () => now,
    reminderSender: async () => { throw new Error("wechat unavailable"); },
  });
  const account = (await learningLoop.startWeChatLoginAsync("async-reminder")).account;
  await learningLoop.confirmGuardianshipAsync(account.id);
  const child = await learningLoop.createChildProfileAsync(account.id, { nickname: "小明", grade: 3 });
  const draft = await learningLoop.startQuestionDraftAsync(account.id, child.id, "manual");
  const question = await learningLoop.confirmQuestionAsync(account.id, draft.id, { stem: "1+1=?" });
  await learningLoop.saveMistakeAsync(account.id, question.id, { primaryKnowledgePoint: "加法" });
  await learningLoop.updateReminderSettingsAsync(account.id, child.id, { enabled: true, hourOfDay: 9 });
  now += 2 * 24 * 60 * 60 * 1000;
  const outcomes = await learningLoop.dispatchDueRemindersAsync();
  assert.deepEqual(outcomes, [{ childProfileId: child.id, status: "failed" }]);
});

test("disabling reminders or deleting the profile stops them immediately", async () => {
  let now = Date.parse("2026-08-27T10:00:00+08:00");
  const sent: ReminderNotification[] = [];
  const learningLoop = new LearningLoop(undefined, {
    now: () => now,
    reminderSender: (notification) => {
      sent.push(notification);
    },
  });
  const { guardian, child } = await confirmedGuardianWithChild(learningLoop);
  const otherChild = await learningLoop.createChildProfileAsync(guardian.id, {
    nickname: "小红",
    grade: 6,
    region: "上海",
  });
  await saveDueMistake(learningLoop, guardian, child);
  await saveDueMistake(learningLoop, guardian, otherChild, "2x = 10");
  await learningLoop.updateReminderSettingsAsync(guardian.id, child.id, {
    enabled: true,
    hourOfDay: 8,
  });
  await learningLoop.updateReminderSettingsAsync(guardian.id, otherChild.id, {
    enabled: true,
    hourOfDay: 8,
  });

  await learningLoop.updateReminderSettingsAsync(guardian.id, child.id, {
    enabled: false,
    hourOfDay: 8,
  });

  now = Date.parse("2026-08-28T09:00:00+08:00");
  await learningLoop.dispatchDueRemindersAsync();
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.childNickname, "小红");

  await learningLoop.deleteChildProfileAsync(guardian.id, otherChild.id);
  assert.equal(
    (await learningLoop.getReminderSettingsAsync(guardian.id, child.id))?.enabled,
    false,
  );

  now = Date.parse("2026-08-29T09:00:00+08:00");
  await learningLoop.dispatchDueRemindersAsync();
  assert.equal(sent.length, 1);
});
