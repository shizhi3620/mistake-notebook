import type { HomeworkRecognition, QuestionRecognition } from "../learning-loop.ts";
import type { RecognitionTaskStore } from "../adapters/recognition-task-store.ts";

const TASK_TIMEOUT_MS = 60_000;

export async function processRecognitionTask(input: { taskId: string; taskStore: RecognitionTaskStore; resolveImageUrl: (fileId: string) => Promise<string>; recognizeQuestion: (input: { imageDataUrl: string }) => Promise<QuestionRecognition>; recognizeHomework: (input: { imageDataUrl: string }) => Promise<HomeworkRecognition>; triggerRetry?: (taskId: string) => Promise<void>; log?: (event: Record<string, unknown>) => void; now?: () => number; }) {
  const now = input.now ?? Date.now;
  const task = await input.taskStore.claim(input.taskId, now());
  if (!task) return { status: "ignored" as const };
  const startedAt = now();
  const deadline = task.createdAt + TASK_TIMEOUT_MS;
  try {
    if (startedAt >= deadline) throw new Error("recognition_timeout");
    const imageUrl = await input.resolveImageUrl(task.imageKey);
    if (!imageUrl.startsWith("https://")) throw new Error("recognition_image_unavailable");
    const remaining = deadline - now();
    if (remaining <= 0) throw new Error("recognition_timeout");
    const result = task.kind === "single_question"
      ? await withTimeout<QuestionRecognition>(input.recognizeQuestion({ imageDataUrl: imageUrl }), remaining)
      : await withTimeout<HomeworkRecognition>(input.recognizeHomework({ imageDataUrl: imageUrl }), remaining);
    await input.taskStore.complete(task.id, result);
    input.log?.({ event: "recognition_task_succeeded", taskId: task.id, kind: task.kind, attempt: task.attempts, durationMs: now() - startedAt });
    return { status: "succeeded" as const };
  } catch (error) {
    const code = errorCode(error);
    const retry = retryable(error) && now() < deadline && await input.taskStore.retry(task.id, code);
    input.log?.({ event: retry ? "recognition_task_retrying" : "recognition_task_failed", taskId: task.id, kind: task.kind, attempt: task.attempts, durationMs: now() - startedAt, errorCode: code });
    if (retry) await input.triggerRetry?.(task.id); else await input.taskStore.fail(task.id, code);
    return { status: retry ? "retrying" as const : "failed" as const };
  }
}
function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return Promise.race([promise, new Promise<T>((_resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("recognition_timeout")), milliseconds);
    timer.unref();
  })]);
}
function retryable(error: unknown) { return /(?:timeout|abort|network|429|500|502|503|504|unavailable|busy)/i.test(error instanceof Error ? error.message : ""); }
function errorCode(error: unknown) { return retryable(error) ? "recognition_busy" : /image|format|invalid/i.test(error instanceof Error ? error.message : "") ? "recognition_image_invalid" : "recognition_failed"; }
