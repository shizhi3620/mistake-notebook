import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

loadDotEnv();

import { createOpenAiCompatibleExplanationProvider } from "../adapters/openai-compatible-explanation.ts";
import { createOpenAiCompatibleRecognitionClient } from "../adapters/openai-compatible-recognition.ts";
import { createWeChatIdentityResolver } from "../adapters/wechat-login.ts";
import { createCloudBaseNodeStorageVerifier } from "../adapters/cloudbase-storage.ts";
import { LearningLoop } from "../learning-loop.ts";
import { SqliteLearningLoopStore } from "../sqlite-learning-loop-store.ts";
import { createLearningLoopServer } from "./http-server.ts";

const deepSeekApiKey = process.env.DEEPSEEK_API_KEY;
const weChatAppId = requiredEnvironment("WECHAT_APP_ID");
const weChatAppSecret = requiredEnvironment("WECHAT_APP_SECRET");
const mysqlConfig = readMysqlConfig();
const port = Number(process.env.PORT ?? 3000);
const databasePath =
  process.env.DATABASE_PATH ?? new URL("../../data/learning.db", import.meta.url).pathname;

if (process.env.CLOUD_HOSTING === "true" && !mysqlConfig) {
  throw new Error(
    "MYSQL_HOST, MYSQL_DATABASE, MYSQL_USER, and MYSQL_PASSWORD are required in Cloud Hosting.",
  );
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

const learningLoop = new LearningLoop(
  new SqliteLearningLoopStore(databasePath),
  { explanationProvider },
);
const photoStorage = process.env.CLOUDBASE_ENV
  ? createCloudBaseNodeStorageVerifier({
      env: process.env.CLOUDBASE_ENV,
      region: process.env.CLOUDBASE_REGION ?? "ap-shanghai",
    })
  : undefined;

const server = createLearningLoopServer({
  learningLoop,
  photoStorage,
  recognitionClient,
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

function readMysqlConfig(): {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
} | undefined {
  const values = [
    process.env.MYSQL_HOST,
    process.env.MYSQL_DATABASE,
    process.env.MYSQL_USER,
    process.env.MYSQL_PASSWORD,
  ];
  if (values.every((value) => !value?.trim())) return undefined;
  if (values.some((value) => !value?.trim())) {
    throw new Error(
      "MYSQL_HOST, MYSQL_DATABASE, MYSQL_USER, and MYSQL_PASSWORD must be configured together.",
    );
  }
  const port = Number(process.env.MYSQL_PORT ?? 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("MYSQL_PORT must be a valid TCP port.");
  }
  return {
    host: process.env.MYSQL_HOST!.trim(),
    port,
    database: process.env.MYSQL_DATABASE!.trim(),
    user: process.env.MYSQL_USER!.trim(),
    password: process.env.MYSQL_PASSWORD!,
    ssl: process.env.MYSQL_SSL !== "false",
  };
}
