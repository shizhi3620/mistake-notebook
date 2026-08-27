import { createOpenAiCompatibleExplanationProvider } from "../src/adapters/openai-compatible-explanation.ts";

const provider = createOpenAiCompatibleExplanationProvider({
  baseUrl: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY!,
  model: process.env.TRY_MODEL ?? "deepseek-chat",
});

const content = await provider({
  stem: "小明有 3 个苹果，又买来 5 个，现在一共有多少个苹果？",
  formulas: [],
  grade: 3,
  studentAnswer: "7",
  skipAnswerAnalysis: false,
});

console.log(JSON.stringify(content, null, 2));
