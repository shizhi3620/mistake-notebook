import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { createOpenAiCompatibleExplanationProvider } from "../adapters/openai-compatible-explanation.ts";
import { createOpenAiCompatibleRecognitionClient } from "../adapters/openai-compatible-recognition.ts";
import { LearningLoop } from "../learning-loop.ts";
import { SqliteLearningLoopStore } from "../sqlite-learning-loop-store.ts";
import { createLearningLoopServer } from "./http-server.ts";

const deepSeekApiKey = process.env.DEEPSEEK_API_KEY;
const port = Number(process.env.PORT ?? 3000);
const databasePath =
  process.env.DATABASE_PATH ?? new URL("../../data/learning.db", import.meta.url).pathname;

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

const server = createLearningLoopServer({ learningLoop, recognitionClient });

server.listen(port, () => {
  console.log(
    `math-mistake-notebook server listening on http://127.0.0.1:${port}` +
      (deepSeekApiKey ? "" : " (DEEPSEEK_API_KEY not set: explanation and recognition disabled)"),
  );
});
