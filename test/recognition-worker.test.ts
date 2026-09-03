import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryRecognitionTaskStore } from "../src/adapters/recognition-task-store.ts";
import { processRecognitionTask } from "../src/server/recognition-worker.ts";

async function createTask(store: InMemoryRecognitionTaskStore) {
  return store.create({ parentAccountId: "parent", childProfileId: "child", draftId: "draft", kind: "single_question", imageKey: "cloud://env/questions/draft/photo", idempotencyKey: crypto.randomUUID(), expiresAt: Date.now() + 60_000 });
}

test("worker resolves the stored object reference and persists a recognition result", async () => {
  const store = new InMemoryRecognitionTaskStore(); const task = await createTask(store);
  const outcome = await processRecognitionTask({ taskId: task.id, taskStore: store, resolveImageUrl: async (fileId) => { assert.match(fileId, /^cloud:\/\//); return "https://storage.example/photo.jpg"; }, recognizeQuestion: async () => ({ stem: "1 + 1", formulas: [], confidence: 1, region: null }), recognizeHomework: async () => ({ questions: [] }) });
  assert.equal(outcome.status, "succeeded");
  assert.equal((await store.find("parent", task.id))?.status, "succeeded");
});

test("worker retries only retryable failures up to two times", async () => {
  const store = new InMemoryRecognitionTaskStore(); const task = await createTask(store); const retried: string[] = [];
  for (let attempt = 0; attempt < 3; attempt += 1) await processRecognitionTask({ taskId: task.id, taskStore: store, resolveImageUrl: async () => "https://storage.example/photo.jpg", recognizeQuestion: async () => { throw new Error("503 unavailable"); }, recognizeHomework: async () => ({ questions: [] }), triggerRetry: async (id) => { retried.push(id); } });
  const saved = await store.find("parent", task.id);
  assert.equal(saved?.status, "failed");
  assert.equal(saved?.attempts, 3);
  assert.equal(retried.length, 2);
});

test("worker does not retry invalid image failures", async () => {
  const store = new InMemoryRecognitionTaskStore(); const task = await createTask(store);
  await processRecognitionTask({ taskId: task.id, taskStore: store, resolveImageUrl: async () => { throw new Error("invalid image format"); }, recognizeQuestion: async () => ({ stem: "", formulas: [], confidence: 0, region: null }), recognizeHomework: async () => ({ questions: [] }) });
  assert.equal((await store.find("parent", task.id))?.errorCode, "recognition_image_invalid");
});

test("task storage retains the task for seven days but exposes its image for 24-hour cleanup", async () => {
  const store = new InMemoryRecognitionTaskStore();
  const task = await createTask(store);
  const expiredImages = await store.findExpiredImages(task.imageExpiresAt);
  assert.deepEqual(expiredImages, [task.imageKey]);
  await store.markImageDeleted(task.imageKey, task.imageExpiresAt);
  assert.deepEqual(await store.findExpiredImages(task.imageExpiresAt + 1), []);
  assert.ok(await store.find("parent", task.id));
});

test("task creation does not spend more recognition quota than remains after confirmed photos", async () => {
  const store = new InMemoryRecognitionTaskStore();
  await assert.rejects(
    () => store.create({ parentAccountId: "parent", childProfileId: "child", draftId: null, kind: "single_question", imageKey: "cloud://env/questions/second", idempotencyKey: "quota", expiresAt: Date.now() + 60_000 }, { startsAt: 0, remaining: 0 }),
    /额度已用完/,
  );
});
