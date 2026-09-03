import { createOpenAiCompatibleHomeworkRecognitionClient } from "../adapters/openai-compatible-homework-recognition.ts";
import { createOpenAiCompatibleRecognitionClient } from "../adapters/openai-compatible-recognition.ts";
import { createCloudBaseNodeStorageVerifier } from "../adapters/cloudbase-storage.ts";
import { createMysqlPool, readMysqlConnectionConfig } from "../adapters/mysql-pool.ts";
import { MysqlRecognitionTaskStore } from "../adapters/recognition-task-store.ts";
import { createTencentScfInvoker } from "../adapters/tencent-scf-invoker.ts";
import { processRecognitionTask } from "../server/recognition-worker.ts";

export async function main(event: { taskId?: string; cleanup?: boolean } | string) {
  const request = typeof event === "string" ? JSON.parse(event) : event;
  const taskId = request.taskId;
  const mysql = readMysqlConnectionConfig();
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const env = process.env.CLOUDBASE_ENV;
  if (!mysql || !apiKey || !env) throw new Error("Worker database, DeepSeek, and CloudBase environment configuration is required.");
  const pool = createMysqlPool(mysql);
  const storage = createCloudBaseNodeStorageVerifier({ env, region: process.env.CLOUDBASE_REGION ?? "ap-shanghai" });
  const taskStore = new MysqlRecognitionTaskStore(pool);
  const retryInvoker = process.env.RECOGNITION_WORKER_FUNCTION_NAME && process.env.SCF_REGION && process.env.TENCENTCLOUD_SECRETID && process.env.TENCENTCLOUD_SECRETKEY
    ? createTencentScfInvoker({ functionName: process.env.RECOGNITION_WORKER_FUNCTION_NAME, region: process.env.SCF_REGION, secretId: process.env.TENCENTCLOUD_SECRETID, secretKey: process.env.TENCENTCLOUD_SECRETKEY })
    : undefined;
  const question = createOpenAiCompatibleRecognitionClient({ baseUrl: process.env.LLM_BASE_URL ?? "https://api.deepseek.com", apiKey, model: process.env.RECOGNITION_MODEL ?? "deepseek-v4-flash-vision-exp", timeoutMs: 55_000, maxRetries: 0, onEvent: (event) => console.log(JSON.stringify(event)) });
  const homework = createOpenAiCompatibleHomeworkRecognitionClient({ baseUrl: process.env.LLM_BASE_URL ?? "https://api.deepseek.com", apiKey, model: process.env.HOMEWORK_RECOGNITION_MODEL ?? process.env.RECOGNITION_MODEL ?? "deepseek-v4-flash-vision-exp", timeoutMs: 55_000, maxRetries: 0, onEvent: (event) => console.log(JSON.stringify(event)) });
  try {
    if (request.cleanup) {
      const imageKeys = await taskStore.findExpiredImages(Date.now());
      for (const imageKey of imageKeys) {
        await storage.deleteUploadedFile(imageKey);
        await taskStore.markImageDeleted(imageKey);
      }
      console.log(JSON.stringify({ event: "recognition_image_cleanup_completed", deletedCount: imageKeys.length }));
      return { status: "cleaned", deletedCount: imageKeys.length };
    }
    if (!taskId) throw new Error("taskId is required.");
    return await processRecognitionTask({ taskId, taskStore, resolveImageUrl: storage.getTemporaryUrl, recognizeQuestion: question, recognizeHomework: homework, triggerRetry: retryInvoker, log: (event) => console.log(JSON.stringify(event)) });
  } finally { await pool.end(); }
}
