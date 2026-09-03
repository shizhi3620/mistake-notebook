import type { HomeworkRecognition, QuestionRecognition } from "../learning-loop.ts";
import type { RecognitionTaskStore } from "../adapters/recognition-task-store.ts";

export async function processRecognitionTask(input: { taskId: string; taskStore: RecognitionTaskStore; recognizeQuestion: (input: { imageDataUrl: string }) => Promise<QuestionRecognition>; recognizeHomework: (input: { imageDataUrl: string }) => Promise<HomeworkRecognition> }) {
  const task = await input.taskStore.claim(input.taskId);
  if (!task) return { status: "ignored" as const };
  try {
    if (!task.imageUrl) throw new Error("recognition_image_unavailable");
    const result = task.kind === "single_question"
      ? await input.recognizeQuestion({ imageDataUrl: task.imageUrl })
      : await input.recognizeHomework({ imageDataUrl: task.imageUrl });
    await input.taskStore.complete(task.id, result);
    return { status: "succeeded" as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    await input.taskStore.fail(task.id, /(?:timeout|429|500|503|unavailable)/i.test(message) ? "recognition_busy" : "recognition_failed");
    return { status: "failed" as const };
  }
}
