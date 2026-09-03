import { createOpenAiCompatibleHomeworkRecognitionClient } from "../adapters/openai-compatible-homework-recognition.ts";
import { createOpenAiCompatibleRecognitionClient } from "../adapters/openai-compatible-recognition.ts";
import { createMysqlPool, readMysqlConnectionConfig } from "../adapters/mysql-pool.ts";
import { MysqlRecognitionTaskStore } from "../adapters/recognition-task-store.ts";
import { createTencentScfInvoker } from "../adapters/tencent-scf-invoker.ts";
import { createTencentCosPhotoStorage } from "../adapters/tencent-cos-storage.ts";
import { processRecognitionTask } from "../server/recognition-worker.ts";

export async function main(event: { taskId?: string; cleanup?: boolean } | string) {
  const request = typeof event === "string" ? JSON.parse(event) : event;
  const taskId = request.taskId;
  console.log(JSON.stringify({ event: "recognition_worker_started", mode: request.cleanup ? "cleanup" : "task", hasTaskId: Boolean(taskId) }));
  const mysql = readMysqlConnectionConfig();
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const cosSecretId = process.env.COS_SECRET_ID;
  const cosSecretKey = process.env.COS_SECRET_KEY;
  const cosBucket = process.env.COS_BUCKET;
  const cosRegion = process.env.COS_REGION;
  if (!mysql || !apiKey || !cosSecretId || !cosSecretKey || !cosBucket || !cosRegion) {
    console.error(JSON.stringify({ event: "recognition_worker_configuration_missing", hasMysql: Boolean(mysql), hasDeepSeekApiKey: Boolean(apiKey), hasCosSecretId: Boolean(cosSecretId), hasCosSecretKey: Boolean(cosSecretKey), hasCosBucket: Boolean(cosBucket), hasCosRegion: Boolean(cosRegion) }));
    throw new Error("Worker database, DeepSeek, and COS configuration are required.");
  }
  const pool = createMysqlPool(mysql);
  const photoStorage = createTencentCosPhotoStorage({ secretId: cosSecretId, secretKey: cosSecretKey, bucket: cosBucket, region: cosRegion });
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
        await photoStorage.deleteUploadedFile(imageKey);
        await taskStore.markImageDeleted(imageKey);
      }
      console.log(JSON.stringify({ event: "recognition_image_cleanup_completed", deletedCount: imageKeys.length }));
      return { status: "cleaned", deletedCount: imageKeys.length };
    }
    if (!taskId) throw new Error("taskId is required.");
    return await processRecognitionTask({ taskId, taskStore, resolveImageUrl: photoStorage.getTemporaryUrl, recognizeQuestion: question, recognizeHomework: homework, triggerRetry: retryInvoker, log: (event) => console.log(JSON.stringify(event)) });
  } catch (error) {
    console.error(JSON.stringify({ event: "recognition_worker_failed", name: error instanceof Error ? error.name : "Error", message: error instanceof Error ? error.message : String(error) }));
    throw error;
  } finally { await pool.end(); }
}

// Standard Tencent SCF Node.js handler name; keep `main` for direct invocations.
export const main_handler = main;
