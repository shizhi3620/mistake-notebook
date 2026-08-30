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
