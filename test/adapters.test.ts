import assert from "node:assert/strict";
import test from "node:test";

import { createOpenAiCompatibleExplanationProvider } from "../src/adapters/openai-compatible-explanation.ts";
import { createOpenAiCompatibleRecognitionClient } from "../src/adapters/openai-compatible-recognition.ts";

type FetchCall = { url: string; init: RequestInit };

function fakeFetch(
  handler: (call: FetchCall) => { status?: number; body: unknown },
): { fetchImpl: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetchImpl = (async (url: any, init: any) => {
    const call = { url: String(url), init: init as RequestInit };
    calls.push(call);
    const { status = 200, body } = handler(call);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function chatCompletion(content: unknown) {
  return {
    choices: [
      {
        message: {
          content: typeof content === "string" ? content : JSON.stringify(content),
        },
      },
    ],
  };
}

const explanationJson = {
  hint: "先想一想：把 5 拆开会怎样？",
  approach: "用凑十法。",
  steps: ["把 5 分成 2 和 3", "3 + 2 = 5", "5 + 3 = 8"],
  finalAnswer: "8",
  variantExercise: { stem: "4 + 5 = ?", answer: "9" },
};

test("the explanation provider posts a grade-aware prompt and parses strict JSON", async () => {
  const { fetchImpl, calls } = fakeFetch(() => ({
    body: chatCompletion(explanationJson),
  }));
  const provider = createOpenAiCompatibleExplanationProvider({
    baseUrl: "https://llm.example.com",
    apiKey: "test-key",
    model: "test-model",
    fetchImpl,
  });

  const content = await provider({
    stem: "3 + 5 = ?",
    formulas: ["3+5"],
    grade: 3,
    studentAnswer: "7",
    skipAnswerAnalysis: false,
  });

  assert.deepEqual(content, explanationJson);

  assert.equal(calls.length, 1);
  const call = calls[0]!;
  assert.equal(call.url, "https://llm.example.com/v1/chat/completions");
  const headers = call.init.headers as Record<string, string>;
  assert.equal(headers.authorization, "Bearer test-key");
  const body = JSON.parse(String(call.init.body));
  assert.equal(body.model, "test-model");
  assert.deepEqual(body.response_format, { type: "json_object" });
  const prompt = JSON.stringify(body.messages);
  assert.match(prompt, /三年级/);
  assert.match(prompt, /3 \+ 5 = \?/);
  assert.match(prompt, /7/);
});

test("the explanation provider notes skipped answer analysis and surfaces failures", async () => {
  const { fetchImpl, calls } = fakeFetch(() => ({
    body: chatCompletion(explanationJson),
  }));
  const provider = createOpenAiCompatibleExplanationProvider({
    baseUrl: "https://llm.example.com/",
    apiKey: "test-key",
    model: "test-model",
    fetchImpl,
  });

  await provider({
    stem: "9 - 4 = ?",
    formulas: [],
    grade: 2,
    studentAnswer: null,
    skipAnswerAnalysis: true,
  });

  assert.equal(calls[0]!.url, "https://llm.example.com/v1/chat/completions");
  const prompt = calls[0]!.init.body as string;
  assert.match(prompt, /跳过|无法识别/);

  const failing = createOpenAiCompatibleExplanationProvider({
    baseUrl: "https://llm.example.com",
    apiKey: "test-key",
    model: "test-model",
    fetchImpl: fakeFetch(() => ({ status: 500, body: { error: "boom" } }))
      .fetchImpl,
  });
  await assert.rejects(
    failing({
      stem: "1 + 1 = ?",
      formulas: [],
      grade: 1,
      studentAnswer: null,
      skipAnswerAnalysis: false,
    }),
    /500/,
  );

  const malformed = createOpenAiCompatibleExplanationProvider({
    baseUrl: "https://llm.example.com",
    apiKey: "test-key",
    model: "test-model",
    fetchImpl: fakeFetch(() => ({ body: chatCompletion("not json") })).fetchImpl,
  });
  await assert.rejects(
    malformed({
      stem: "1 + 1 = ?",
      formulas: [],
      grade: 1,
      studentAnswer: null,
      skipAnswerAnalysis: false,
    }),
    /json|parse|invalid/i,
  );

  const missingFields = createOpenAiCompatibleExplanationProvider({
    baseUrl: "https://llm.example.com",
    apiKey: "test-key",
    model: "test-model",
    fetchImpl: fakeFetch(() => ({
      body: chatCompletion({ hint: "只有提示" }),
    })).fetchImpl,
  });
  await assert.rejects(
    missingFields({
      stem: "1 + 1 = ?",
      formulas: [],
      grade: 1,
      studentAnswer: null,
      skipAnswerAnalysis: false,
    }),
    /invalid|missing|shape/i,
  );
});

test("the recognition client sends the image and validates the structured result", async () => {
  const recognitionJson = {
    stem: "3 + 5 = ?",
    formulas: ["3+5"],
    confidence: 0.92,
    region: { x: 0.1, y: 0.2, width: 0.5, height: 0.3 },
  };
  const { fetchImpl, calls } = fakeFetch(() => ({
    body: chatCompletion(recognitionJson),
  }));
  const recognize = createOpenAiCompatibleRecognitionClient({
    baseUrl: "https://llm.example.com",
    apiKey: "test-key",
    model: "vision-model",
    fetchImpl,
  });

  const recognition = await recognize({
    imageDataUrl: "data:image/jpeg;base64,QUJD",
  });

  assert.deepEqual(recognition, recognitionJson);
  const body = calls[0]!.init.body as string;
  assert.match(body, /data:image\/jpeg;base64,QUJD/);

  const lowConfidence = createOpenAiCompatibleRecognitionClient({
    baseUrl: "https://llm.example.com",
    apiKey: "test-key",
    model: "vision-model",
    fetchImpl: fakeFetch(() => ({
      body: chatCompletion({ ...recognitionJson, confidence: 1.5 }),
    })).fetchImpl,
  });
  await assert.rejects(
    lowConfidence({ imageDataUrl: "data:image/jpeg;base64,QUJD" }),
    /confidence/i,
  );

  const httpError = createOpenAiCompatibleRecognitionClient({
    baseUrl: "https://llm.example.com",
    apiKey: "test-key",
    model: "vision-model",
    fetchImpl: fakeFetch(() => ({ status: 429, body: {} })).fetchImpl,
  });
  await assert.rejects(
    httpError({ imageDataUrl: "data:image/jpeg;base64,QUJD" }),
    /429/,
  );
});
