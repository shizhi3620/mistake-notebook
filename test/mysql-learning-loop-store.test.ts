import assert from "node:assert/strict";
import test from "node:test";

import { MysqlLearningLoopStore } from "../src/adapters/mysql-learning-loop-store.ts";

test("MySQL store scopes child reads to the owning account", async () => {
  const pool = {
    async query() {
      return [[{
        id: "child-1",
        parent_account_id: "parent-1",
        nickname: "小明",
        grade: 3,
        region: "",
        province_code: "JS",
        province_name: "江苏",
        city_code: null,
        city_name: null,
        textbook_version: null,
      }]];
    },
  };
  const store = new MysqlLearningLoopStore(pool as never);
  assert.equal((await store.findChildProfile("parent-1", "child-1"))?.parentAccountId, "parent-1");
});

test("MySQL account-plus-identity creation rolls back both writes on failure", async () => {
  const calls: string[] = [];
  const connection = {
    async beginTransaction() { calls.push("begin"); },
    async execute(sql: string) { calls.push(sql); if (sql.includes("wechat_identities")) throw new Error("duplicate identity"); },
    async commit() { calls.push("commit"); },
    async rollback() { calls.push("rollback"); },
    release() { calls.push("release"); },
  };
  const pool = { async getConnection() { return connection; } };
  const store = new MysqlLearningLoopStore(pool as never);
  await assert.rejects(() => store.createParentAccountWithWeChatSubject({ id: "p", guardianshipConfirmed: false, allowDirectAnswerReveal: false, plan: "free" }, "wx"), /duplicate identity/);
  assert.deepEqual(calls, ["begin", "INSERT INTO parent_accounts (id, guardianship_confirmed, allow_direct_answer_reveal, plan) VALUES (?, ?, ?, ?)", "INSERT INTO wechat_identities (wechat_subject, parent_account_id) VALUES (?, ?)", "rollback", "release"]);
});

test("child deletion removes dependent records and clears selection in one transaction", async () => {
  const calls: string[] = [];
  const connection = {
    async beginTransaction() { calls.push("begin"); },
    async execute(sql: string) { calls.push(sql); },
    async commit() { calls.push("commit"); },
    async rollback() { calls.push("rollback"); },
    release() { calls.push("release"); },
  };
  const store = new MysqlLearningLoopStore({ async getConnection() { return connection; } } as never);
  await store.deleteChildProfile("parent-1", "child-1");
  assert.equal(calls[0], "begin");
  assert.ok(calls.some((sql) => sql.includes("DELETE FROM mistakes")));
  assert.ok(calls.some((sql) => sql.includes("selected_child_profile_id=NULL")));
  assert.equal(calls.at(-2), "commit");
  assert.equal(calls.at(-1), "release");
});

test("daily reminder dispatch is idempotent", async () => {
  const statements: string[] = [];
  const store = new MysqlLearningLoopStore({
    async execute(sql: string) { statements.push(sql); return [{}]; },
  } as never);
  await store.createReminderDispatch({ id: "dispatch-1", parentAccountId: "parent-1", childProfileId: "child-1", dateKey: "2026-08-30", sentAt: 1, status: "sent" });
  assert.match(statements[0], /ON DUPLICATE KEY UPDATE/);
});
