import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

loadDotEnv();

import { createOpenAiCompatibleExplanationProvider } from "../adapters/openai-compatible-explanation.ts";
import { createOpenAiCompatibleRecognitionClient } from "../adapters/openai-compatible-recognition.ts";
import { createWeChatIdentityResolver } from "../adapters/wechat-login.ts";
import { createWeChatSubscriptionReminderSender } from "../adapters/wechat-subscription-reminder.ts";
import { createCloudBaseNodeStorageVerifier } from "../adapters/cloudbase-storage.ts";
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

const deepSeekApiKey = process.env.DEEPSEEK_API_KEY;
const weChatAppId = requiredEnvironment("WECHAT_APP_ID");
const weChatAppSecret = requiredEnvironment("WECHAT_APP_SECRET");
const mysqlConfig = readMysqlConnectionConfig();
let mysqlHealthCheck: (() => Promise<void>) | undefined;
let mysqlPool: Awaited<ReturnType<typeof createMysqlPool>> | undefined;
const port = Number(process.env.PORT ?? 3000);
const databasePath =
  process.env.DATABASE_PATH ?? new URL("../../data/learning.db", import.meta.url).pathname;

if (process.env.CLOUD_HOSTING === "true" && !mysqlConfig) {
  throw new Error(
    "MYSQL_HOST, MYSQL_DATABASE, MYSQL_USER, and MYSQL_PASSWORD are required in Cloud Hosting.",
  );
}
if (process.env.CLOUD_HOSTING === "true") {
  requiredEnvironment("CLOUDBASE_ENV");
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
          process.env.CLOUD_HOSTING === "true",
          mysqlConfig.ssl,
        )
      ) {
        throw error;
      }
      await closeMysqlPool(configuredMysqlPool);
      console.warn(
        "[mysql_tls_unavailable] Server does not support TLS; retrying over the Cloud Hosting private network.",
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
    })
  : undefined;

const learningStore = mysqlPool
  ? new MysqlLearningLoopStore(mysqlPool)
  : new SqliteLearningLoopStore(databasePath);

const photoStorage = process.env.CLOUDBASE_ENV
  ? createCloudBaseNodeStorageVerifier({
      env: process.env.CLOUDBASE_ENV,
      region: process.env.CLOUDBASE_REGION ?? "ap-shanghai",
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

const server = createLearningLoopServer({
  learningLoop,
  healthCheck: mysqlHealthCheck,
  idempotencyStore: mysqlPool ? new MysqlIdempotencyStore(mysqlPool) : undefined,
  photoStorage,
  recognitionClient,
  reminderSchedulerSecret,
  log: (event) => console.log(JSON.stringify(event)),
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
