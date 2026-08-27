import assert from "node:assert/strict";
import test from "node:test";

import {
  LearningLoop,
  type ChildProfile,
  type ParentAccount,
  type ReminderNotification,
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

function saveDueMistake(
  learningLoop: LearningLoop,
  guardian: ParentAccount,
  child: ChildProfile,
  stem = "3 + 5 = ?",
): void {
  const draft = learningLoop.startQuestionDraft(guardian.id, child.id, "manual");
  const question = learningLoop.confirmQuestion(guardian.id, draft.id, { stem });
  learningLoop.saveMistake(guardian.id, question.id, {
    primaryKnowledgePoint: "20以内进位加法",
    mistakeCause: "粗心",
  });
}

test("reminders are opt-in and send at most one privacy-safe notification per child per day", () => {
  // Mistake saved 2026-08-27, due 2026-08-28 (Shanghai).
  let now = Date.parse("2026-08-27T10:00:00+08:00");
  const sent: ReminderNotification[] = [];
  const learningLoop = new LearningLoop(undefined, {
    now: () => now,
    reminderSender: (notification) => {
      sent.push(notification);
    },
  });
  const { guardian, child } = confirmedGuardianWithChild(learningLoop);
  saveDueMistake(learningLoop, guardian, child);

  now = Date.parse("2026-08-28T09:00:00+08:00");
  learningLoop.dispatchDueReminders();
  assert.equal(sent.length, 0);

  const settings = learningLoop.updateReminderSettings(
    guardian.id,
    child.id,
    { enabled: true, hourOfDay: 8 },
  );
  assert.equal(settings.enabled, true);

  now = Date.parse("2026-08-28T07:00:00+08:00");
  learningLoop.dispatchDueReminders();
  assert.equal(sent.length, 0);

  now = Date.parse("2026-08-28T09:00:00+08:00");
  learningLoop.dispatchDueReminders();
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0], {
    childNickname: "小明",
    dueCount: 1,
    entryPath: `/pages/review/index?childId=${child.id}`,
  });
  assert.equal(JSON.stringify(sent[0]).includes("3 + 5"), false);
  assert.equal(JSON.stringify(sent[0]).includes("粗心"), false);

  learningLoop.dispatchDueReminders();
  assert.equal(sent.length, 1);

  now = Date.parse("2026-08-29T09:00:00+08:00");
  learningLoop.dispatchDueReminders();
  assert.equal(sent.length, 2);
});

test("failed or unavailable sends are not retried and never touch review state", () => {
  let now = Date.parse("2026-08-27T10:00:00+08:00");
  let attempts = 0;
  const learningLoop = new LearningLoop(undefined, {
    now: () => now,
    reminderSender: () => {
      attempts += 1;
      throw new Error("template unavailable");
    },
  });
  const { guardian, child } = confirmedGuardianWithChild(learningLoop);
  saveDueMistake(learningLoop, guardian, child);
  learningLoop.updateReminderSettings(guardian.id, child.id, {
    enabled: true,
    hourOfDay: 8,
  });

  now = Date.parse("2026-08-28T09:00:00+08:00");
  const outcomes = learningLoop.dispatchDueReminders();

  assert.deepEqual(outcomes, [{ childProfileId: child.id, status: "failed" }]);
  assert.equal(attempts, 1);

  const retry = learningLoop.dispatchDueReminders();
  assert.deepEqual(retry, []);
  assert.equal(attempts, 1);

  assert.equal(learningLoop.getDueReviews(guardian.id, child.id).length, 1);

  let silentNow = Date.parse("2026-08-27T10:00:00+08:00");
  const silent = new LearningLoop(undefined, {
    now: () => silentNow,
  });
  const silentFamily = confirmedGuardianWithChild(silent);
  saveDueMistake(silent, silentFamily.guardian, silentFamily.child);
  silent.updateReminderSettings(silentFamily.guardian.id, silentFamily.child.id, {
    enabled: true,
    hourOfDay: 8,
  });
  silentNow = Date.parse("2026-08-28T09:00:00+08:00");
  assert.deepEqual(silent.dispatchDueReminders(), [
    { childProfileId: silentFamily.child.id, status: "failed" },
  ]);
  assert.equal(
    silent.getDueReviews(silentFamily.guardian.id, silentFamily.child.id)
      .length,
    1,
  );
});

test("disabling reminders or deleting the profile stops them immediately", () => {
  let now = Date.parse("2026-08-27T10:00:00+08:00");
  const sent: ReminderNotification[] = [];
  const learningLoop = new LearningLoop(undefined, {
    now: () => now,
    reminderSender: (notification) => {
      sent.push(notification);
    },
  });
  const { guardian, child } = confirmedGuardianWithChild(learningLoop);
  const otherChild = learningLoop.createChildProfile(guardian.id, {
    nickname: "小红",
    grade: 6,
    region: "上海",
  });
  saveDueMistake(learningLoop, guardian, child);
  saveDueMistake(learningLoop, guardian, otherChild, "2x = 10");
  learningLoop.updateReminderSettings(guardian.id, child.id, {
    enabled: true,
    hourOfDay: 8,
  });
  learningLoop.updateReminderSettings(guardian.id, otherChild.id, {
    enabled: true,
    hourOfDay: 8,
  });

  learningLoop.updateReminderSettings(guardian.id, child.id, {
    enabled: false,
    hourOfDay: 8,
  });

  now = Date.parse("2026-08-28T09:00:00+08:00");
  learningLoop.dispatchDueReminders();
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.childNickname, "小红");

  learningLoop.deleteChildProfile(guardian.id, otherChild.id);
  assert.equal(
    learningLoop.getReminderSettings(guardian.id, child.id)?.enabled,
    false,
  );

  now = Date.parse("2026-08-29T09:00:00+08:00");
  learningLoop.dispatchDueReminders();
  assert.equal(sent.length, 1);
});
