import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  asAsyncLearningLoopStore,
  type LearningLoopStore,
} from "../src/learning-loop.ts";
import { SqliteLearningLoopStore } from "../src/sqlite-learning-loop-store.ts";

test("the async learning-store seam preserves synchronous adapter results", async () => {
  const calls: string[] = [];
  const store = {
    createParentAccount() {
      calls.push("create");
    },
    findParentAccount() {
      return { id: "guardian" };
    },
  } as unknown as LearningLoopStore;

  const asyncStore = asAsyncLearningLoopStore(store);
  await asyncStore.createParentAccount({} as never);
  assert.deepEqual(await asyncStore.findParentAccount("guardian"), {
    id: "guardian",
  });
  assert.deepEqual(calls, ["create"]);
});

test("the SQLite adapter satisfies the same async seam", async () => {
  const directory = mkdtempSync(join(tmpdir(), "math-mistake-async-store-"));
  const store = new SqliteLearningLoopStore(join(directory, "learning.db"));
  try {
    const asyncStore = asAsyncLearningLoopStore(store);
    await asyncStore.createParentAccount({
      id: "guardian",
      guardianshipConfirmed: false,
      allowDirectAnswerReveal: false,
      plan: "free",
    });
    assert.equal((await asyncStore.findParentAccount("guardian"))?.id, "guardian");
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
