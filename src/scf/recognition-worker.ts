import { createOpenAiCompatibleHomeworkRecognitionClient } from "../adapters/openai-compatible-homework-recognition.ts";
import { createOpenAiCompatibleRecognitionClient } from "../adapters/openai-compatible-recognition.ts";
import { createMysqlPool, readMysqlConnectionConfig } from "../adapters/mysql-pool.ts";
import { MysqlRecognitionTaskStore } from "../adapters/recognition-task-store.ts";
import { createTencentScfInvoker } from "../adapters/tencent-scf-invoker.ts";
import { processRecognitionTask } from "../server/recognition-worker.ts";

export async function main(event: { taskId?: string; cleanup?: boolean } | string) {
  const request = typeof event === "string" ? JSON.parse(event) : event;
  const taskId = request.taskId;
  console.log(JSON.stringify({ event: "recognition_worker_started", mode: request.cleanup ? "cleanup" : "task", hasTaskId: Boolean(taskId) }));
  const mysql = readMysqlConnectionConfig();
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const imageApiBaseUrl = process.env.RECOGNITION_IMAGE_API_BASE_URL?.replace(/\/+$/, "");
  const imageApiSecret = process.env.RECOGNITION_WORKER_SECRET;
  if (!mysql || !apiKey || !imageApiBaseUrl || !imageApiSecret) {
    console.error(JSON.stringify({ event: "recognition_worker_configuration_missing", hasMysql: Boolean(mysql), hasDeepSeekApiKey: Boolean(apiKey), hasImageApiBaseUrl: Boolean(imageApiBaseUrl), hasImageApiSecret: Boolean(imageApiSecret) }));
    throw new Error("Worker database, DeepSeek, image API URL, and shared secret configuration is required.");
  }
  const pool = createMysqlPool(mysql);
  const imageApi = createRecognitionImageApi(imageApiBaseUrl, imageApiSecret);
  const taskStore = new MysqlRecognitionTaskStore(pool);
  const retryInvoker = process.env.RECOGNITION_WORKER_FUNCTION_NAME && process.env.SCF_REGION && process.env.TENCENTCLOUD_SECRETID && process.env.TENCENTCLOUD_SECRETKEY
    ? createTencentScfInvoker({ functionName: process.env.RECOGNITION_WORKER_FUNCTION_NAME, region: process.env.SCF_REGION, secretId: process.env.TENCENTCLOUD_SECRETID, secretKey: process.env.TENCENTCLOUD_SECRETKEY })
    : undefined;
  const question = createOpenAiCompatibleRecognitionClient({ baseUrl: process.env.LLM_BASE_URL ?? "https://api.deepseek.com", apiKey, model: process.env.RECOGNITION_MODEL ?? "deepseek-v4-flash-vision-exp", timeoutMs: 55_000, maxRetries: 0, onEvent: (event) => console.log(JSON.stringify(event)) });
  const homework = createOpenAiCompatibleHomeworkRecognitionClient({ baseUrl: process.env.LLM_BASE_URL ?? "https://api.deepseek.com", apiKey, model: process.env.HOMEWORK_RECOGNITION_MODEL ?? process.env.RECOGNITION_MODEL ?? "deepseek-v4-flash-vision-exp", timeoutMs: 55_000, maxRetries: 0, onEvent: (event) => console.log(JSON.stringify(event)) });
  try {
    if (request.cleanup) {
      console.log(JSON.stringify({ event: "recognition_image_cleanup_started" }));
      const imageKeys = await taskStore.findExpiredImages(Date.now());
      for (const imageKey of imageKeys) {
        // ctb owns CloudBase credentials and deletes the expired object.
        await imageApi.cleanup();
        break;
      }
      console.log(JSON.stringify({ event: "recognition_image_cleanup_completed", deletedCount: imageKeys.length }));
      return { status: "cleaned", deletedCount: imageKeys.length };
    }
    if (!taskId) throw new Error("taskId is required.");
    return await processRecognitionTask({ taskId, taskStore, resolveImageUrl: async () => imageApi.getTemporaryUrl(taskId), recognizeQuestion: question, recognizeHomework: homework, triggerRetry: retryInvoker, log: (event) => console.log(JSON.stringify(event)) });
  } catch (error) {
    console.error(JSON.stringify({ event: "recognition_worker_failed", name: error instanceof Error ? error.name : "Error", message: error instanceof Error ? error.message : String(error) }));
    throw error;
  } finally { await pool.end(); }
}

// Standard Tencent SCF Node.js handler name; keep `main` for direct invocations.
export const main_handler = main;

function createRecognitionImageApi(baseUrl: string, secret: string) {
  const request = async (path: string) => {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, { method: "POST", headers: { "x-recognition-worker-secret": secret }, signal: AbortSignal.timeout(15_000) });
    } catch (error) {
      const cause = error instanceof Error && "cause" in error ? (error as Error & { cause?: unknown }).cause : undefined;
      const causeMessage = cause instanceof Error ? cause.message : String(cause ?? "");
      throw new Error(`Recognition image API network request failed: ${causeMessage.slice(0, 200)}`);
    }
    if (!response.ok) throw new Error(`Recognition image API failed with status ${response.status}.`);
    return response.json() as Promise<{ imageUrl?: string; deletedCount?: number }>;
  };
  return {
    async getTemporaryUrl(taskId: string) {
      const result = await request(`/internal/recognition-tasks/${encodeURIComponent(taskId)}/image-url`);
      if (!result.imageUrl || !result.imageUrl.startsWith("https://")) throw new Error("Recognition image API returned an invalid temporary URL.");
      return result.imageUrl;
    },
    async cleanup() { await request("/internal/recognition-tasks/cleanup-images"); },
  };
}
