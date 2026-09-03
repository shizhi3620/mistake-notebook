import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import packageJson from "../../package.json" with { type: "json" };

loadDotEnv();

import { createOpenAiCompatibleExplanationProvider } from "../adapters/openai-compatible-explanation.ts";
import { createOpenAiCompatibleRecognitionClient } from "../adapters/openai-compatible-recognition.ts";
import { createOpenAiCompatibleHomeworkRecognitionClient } from "../adapters/openai-compatible-homework-recognition.ts";
import { createWeChatIdentityResolver } from "../adapters/wechat-login.ts";
import { createWeChatSubscriptionReminderSender } from "../adapters/wechat-subscription-reminder.ts";
import { createTencentCosPhotoStorage } from "../adapters/tencent-cos-storage.ts";
import {
  createMysqlPool,
  closeMysqlPool,
  readMysqlConnectionConfig,
  shouldRetryMysqlWithoutTls,
  verifyMysqlPool,
} from "../adapters/mysql-pool.ts";
import { migrateMysqlSchema } from "../adapters/mysql-schema.ts";
import { MysqlLearningLoopStore } from "../adapters/mysql-learning-loop-store.ts";
import { LearningLoop } from "../learning-loop.ts";
import { SqliteLearningLoopStore } from "../sqlite-learning-loop-store.ts";
import { createLearningLoopServer } from "./http-server.ts";
import { MysqlIdempotencyStore } from "./idempotency-store.ts";
import { MysqlRecognitionTaskStore, InMemoryRecognitionTaskStore } from "../adapters/recognition-task-store.ts";
import { processRecognitionTask } from "./recognition-worker.ts";
import { createTencentScfInvoker } from "../adapters/tencent-scf-invoker.ts";

const deepSeekApiKey = process.env.DEEPSEEK_API_KEY;
const buildVersion = process.env.BUILD_VERSION ?? process.env.APP_VERSION ?? packageJson.version;
const buildBranch = process.env.BUILD_BRANCH ?? process.env.GIT_BRANCH ?? "unknown";
const buildCommit = process.env.BUILD_COMMIT ?? process.env.GIT_COMMIT ?? "unknown";
const logEvent = (event: Record<string, unknown>) => console.log(JSON.stringify(event));
const weChatAppId = requiredEnvironment("WECHAT_APP_ID");
const weChatAppSecret = requiredEnvironment("WECHAT_APP_SECRET");
const mysqlConfig = readMysqlConnectionConfig();
let mysqlHealthCheck: (() => Promise<void>) | undefined;
let mysqlPool: Awaited<ReturnType<typeof createMysqlPool>> | undefined;
const port = Number(process.env.PORT ?? 3000);
const databasePath =
  process.env.DATABASE_PATH ?? new URL("../../data/learning.db", import.meta.url).pathname;

if (process.env.PRODUCTION === "true" && !mysqlConfig) {
  throw new Error(
    "MYSQL_HOST, MYSQL_DATABASE, MYSQL_USER, and MYSQL_PASSWORD are required in production.",
  );
}

if (mysqlConfig) {
  let configuredMysqlPool = createMysqlPool(mysqlConfig);
  try {
    try {
      await verifyMysqlPool(configuredMysqlPool);
    } catch (error) {
      if (
        !shouldRetryMysqlWithoutTls(
          error,
          process.env.PRODUCTION === "true",
          mysqlConfig.ssl,
        )
      ) {
        throw error;
      }
      await closeMysqlPool(configuredMysqlPool);
      console.warn(
        "[mysql_tls_unavailable] Server does not support TLS; retrying without TLS.",
      );
      configuredMysqlPool = createMysqlPool({ ...mysqlConfig, ssl: false });
      await verifyMysqlPool(configuredMysqlPool);
    }
    await migrateMysqlSchema(configuredMysqlPool);
  } catch (error) {
    await closeMysqlPool(configuredMysqlPool);
    throw new Error(
      `MySQL connection or schema initialization failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }
  mysqlPool = configuredMysqlPool;
  mysqlHealthCheck = async () => {
    await verifyMysqlPool(configuredMysqlPool);
  };
}

mkdirSync(dirname(databasePath), { recursive: true });

const explanationProvider = deepSeekApiKey
  ? createOpenAiCompatibleExplanationProvider({
      baseUrl: process.env.LLM_BASE_URL ?? "https://api.deepseek.com",
      apiKey: deepSeekApiKey,
      model: process.env.EXPLANATION_MODEL ?? "deepseek-chat",
    })
  : undefined;

const recognitionClient = deepSeekApiKey
  ? createOpenAiCompatibleRecognitionClient({
      baseUrl: process.env.LLM_BASE_URL ?? "https://api.deepseek.com",
      apiKey: deepSeekApiKey,
      model: process.env.RECOGNITION_MODEL ?? "deepseek-v4-flash-vision-exp",
      timeoutMs: 55_000,
      maxRetries: 0,
      onEvent: logEvent,
    })
  : undefined;
const homeworkRecognitionClient = deepSeekApiKey
  ? createOpenAiCompatibleHomeworkRecognitionClient({
      baseUrl: process.env.LLM_BASE_URL ?? "https://api.deepseek.com",
      apiKey: deepSeekApiKey,
      model: process.env.HOMEWORK_RECOGNITION_MODEL ?? process.env.RECOGNITION_MODEL ?? "deepseek-v4-flash-vision-exp",
      timeoutMs: 55_000,
      maxRetries: 0,
      onEvent: logEvent,
    })
  : undefined;

const learningStore = mysqlPool
  ? new MysqlLearningLoopStore(mysqlPool)
  : new SqliteLearningLoopStore(databasePath);

const photoStorage = process.env.COS_SECRET_ID && process.env.COS_SECRET_KEY && process.env.COS_BUCKET && process.env.COS_REGION
  ? createTencentCosPhotoStorage({
      secretId: process.env.COS_SECRET_ID,
      secretKey: process.env.COS_SECRET_KEY,
      bucket: process.env.COS_BUCKET,
      region: process.env.COS_REGION,
    })
  : undefined;
const reminderTemplateId = process.env.WECHAT_REMINDER_TEMPLATE_ID?.trim();
const reminderSchedulerSecret = reminderTemplateId
  ? requiredEnvironment("REMINDER_SCHEDULER_SECRET")
  : undefined;
const reminderSender = reminderTemplateId
  ? createWeChatSubscriptionReminderSender({
      appId: weChatAppId,
      appSecret: weChatAppSecret,
      templateId: reminderTemplateId,
      nicknameField: requiredEnvironment("WECHAT_REMINDER_NICKNAME_FIELD"),
      dueCountField: requiredEnvironment("WECHAT_REMINDER_DUE_COUNT_FIELD"),
      resolveOpenId: async (parentAccountId) => learningStore.findWeChatSubject(parentAccountId),
    })
  : undefined;
const learningLoop = new LearningLoop(learningStore, {
  explanationProvider,
  imageDeleter: photoStorage?.deleteUploadedFile,
  reminderSender,
});
const recognitionTaskStore = mysqlPool ? new MysqlRecognitionTaskStore(mysqlPool) : new InMemoryRecognitionTaskStore();
const scfInvoker = process.env.RECOGNITION_WORKER_FUNCTION_NAME
  ? createTencentScfInvoker({
      secretId: requiredEnvironment("TENCENTCLOUD_SECRETID"),
      secretKey: requiredEnvironment("TENCENTCLOUD_SECRETKEY"),
      region: requiredEnvironment("SCF_REGION"),
      functionName: requiredEnvironment("RECOGNITION_WORKER_FUNCTION_NAME"),
    })
  : undefined;

const server = createLearningLoopServer({
  learningLoop,
  healthCheck: mysqlHealthCheck,
  idempotencyStore: mysqlPool ? new MysqlIdempotencyStore(mysqlPool) : undefined,
  photoStorage,
  recognitionClient,
  homeworkRecognitionClient,
  recognitionTaskStore,
  triggerRecognitionTask: async (taskId) => {
    if (!recognitionClient || !homeworkRecognitionClient) throw new Error("recognition_unavailable");
    if (scfInvoker) return scfInvoker(taskId);
    if (!photoStorage) throw new Error("recognition storage is not configured");
    // Local development intentionally runs synchronously; production invokes SCF.
    await processRecognitionTask({ taskId, taskStore: recognitionTaskStore, resolveImageUrl: photoStorage.getTemporaryUrl, recognizeQuestion: recognitionClient, recognizeHomework: homeworkRecognitionClient, log: logEvent });
  },
  recognitionWorkerSecret: process.env.RECOGNITION_WORKER_SECRET?.trim() || undefined,
  reminderSchedulerSecret,
  feedbackOperatorSecret: process.env.FEEDBACK_OPERATOR_SECRET?.trim() || undefined,
  feedbackOperatorId: process.env.FEEDBACK_OPERATOR_ID?.trim() || "feedback-operator",
  log: logEvent,
  weChatIdentityResolver: createWeChatIdentityResolver({
    appId: weChatAppId,
    appSecret: weChatAppSecret,
    onVerificationFailure: (details) =>
      console.warn(
        `[wechat_login_verification_failed] status=${String(details.status ?? "network")} ` +
          `errcode=${String(details.errcode ?? "unknown")} ` +
          `errmsg=${String(details.errmsg ?? "unknown")} ` +
          `errorName=${String(details.errorName ?? "unknown")} ` +
          `errorMessage=${String(details.errorMessage ?? "unknown")}`,
      ),
  }),
});

server.listen(port, () => {
  logEvent({ event: "service_started", version: buildVersion, branch: buildBranch, commit: buildCommit, deployment: process.env.PRODUCTION === "true" ? "tencent-cloud" : "local" });
  console.log(
    `math-mistake-notebook server listening on http://127.0.0.1:${port}` +
      (deepSeekApiKey ? "" : " (DEEPSEEK_API_KEY not set: explanation and recognition disabled)"),
  );
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (mysqlPool) await closeMysqlPool(mysqlPool);
  console.log(`math-mistake-notebook stopped (${signal})`);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

function loadDotEnv(): void {
  let contents: string;
  try {
    contents = readFileSync(new URL("../../.env", import.meta.url), "utf8");
  } catch {
    return;
  }

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function requiredEnvironment(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`${key} must be configured before starting the server.`);
  }
  return value;
}
