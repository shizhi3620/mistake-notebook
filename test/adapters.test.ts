import assert from "node:assert/strict";
import test from "node:test";

import { createOpenAiCompatibleExplanationProvider } from "../src/adapters/openai-compatible-explanation.ts";
import { createOpenAiCompatibleRecognitionClient } from "../src/adapters/openai-compatible-recognition.ts";
import { createWeChatIdentityResolver } from "../src/adapters/wechat-login.ts";
import { runImageCleanup, scheduleImageCleanup } from "../src/image-retention.ts";

test("image retention schedules originals, crops, and drafts with retryable cleanup", async () => {
  const original = scheduleImageCleanup({ id: "o", fileId: "cloud://o", kind: "original", createdAt: 0 });
  const crop = scheduleImageCleanup({ id: "c", fileId: "cloud://c", kind: "crop", createdAt: 0 });
  const draft = scheduleImageCleanup({ id: "d", fileId: "cloud://d", kind: "draft", createdAt: 0 });
  assert.equal(original.deleteAfter, 0);
  assert.ok(crop.deleteAfter > draft.deleteAfter);
  let attempts = 0;
  await runImageCleanup([original], 1, async () => { attempts += 1; throw new Error("temporary outage"); }, 2);
  assert.equal(original.attempts, 1);
  await runImageCleanup([original], 2, async () => { attempts += 1; }, 2);
  assert.equal(original.deletedAt, 2);
  assert.equal(attempts, 2);
});

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
  suggestedPrimaryKnowledgePoint: "20以内进位加法",
  suggestedSecondaryKnowledgePoints: ["凑十法"],
  suggestedMistakeCause: "把进位漏掉了",
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
    studentAnswer: "7",
    studentAnswerConfidence: 0.74,
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
  assert.equal(JSON.parse(body).max_tokens, 1000);

  const fencedRecognition = createOpenAiCompatibleRecognitionClient({
    baseUrl: "https://llm.example.com",
    apiKey: "test-key",
    model: "vision-model",
    fetchImpl: fakeFetch(() => ({
      body: { choices: [{ message: { content: `\`\`\`json\n${JSON.stringify(recognitionJson)}\n\`\`\`` } }] },
    })).fetchImpl,
  });
  assert.deepEqual(
    await fencedRecognition({ imageDataUrl: "data:image/jpeg;base64,QUJD" }),
    recognitionJson,
  );

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

test("the WeChat identity resolver exchanges a temporary code without exposing session data", async () => {
  const calls: string[] = [];
  const resolveIdentity = createWeChatIdentityResolver({
    appId: "test-app-id",
    appSecret: "test-app-secret",
    fetchImpl: (async (url: URL) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ openid: "openid-for-guardian", session_key: "secret" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  });

  const identity = await resolveIdentity("temporary-login-code");

  assert.deepEqual(identity, { subject: "openid-for-guardian" });
  assert.equal(calls.length, 1);
  assert.match(calls[0]!, /^https:\/\/api\.weixin\.qq\.com\/sns\/jscode2session\?/);
  assert.match(calls[0]!, /appid=test-app-id/);
  assert.match(calls[0]!, /js_code=temporary-login-code/);
  assert.doesNotMatch(JSON.stringify(identity), /secret|temporary-login-code/);

  const rejectInvalid = createWeChatIdentityResolver({
    appId: "test-app-id",
    appSecret: "test-app-secret",
    fetchImpl: (async () =>
      new Response(JSON.stringify({ errcode: 40029, errmsg: "invalid code" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch,
  });
  await assert.rejects(rejectInvalid("invalid-code"), /could not be verified/i);

  const unavailable = createWeChatIdentityResolver({
    appId: "test-app-id",
    appSecret: "test-app-secret",
    fetchImpl: (async () => {
      throw new Error("connection reset");
    }) as typeof fetch,
  });
  await assert.rejects(unavailable("retry-code"), /could not be verified/i);
});
test("CloudBase storage deletion only accepts cloud file IDs", async () => {
  let deleted = "";
  const { createCloudBaseStorageVerifier } = await import("../src/adapters/cloudbase-storage.ts");
  const storage = createCloudBaseStorageVerifier({ getTemporaryUrl: async () => "https://example.test/image", deleteFile: async (fileId) => { deleted = fileId; } });
  await storage.deleteUploadedFile("cloud://env/path/image.jpg");
  assert.equal(deleted, "cloud://env/path/image.jpg");
  await assert.rejects(() => storage.deleteUploadedFile("https://example.test/image"), /invalid CloudBase file ID/);
});

test("CloudBase upload verification binds a file ID to its upload credential path", async () => {
  const { createCloudBaseStorageVerifier } = await import("../src/adapters/cloudbase-storage.ts");
  const storage = createCloudBaseStorageVerifier({
    getTemporaryUrl: async () => "https://example.test/image",
  });
  assert.deepEqual(
    await storage.verifyUploadedFile({
      fileId: "cloud://prod-env/questions/draft-1/file-1",
      expectedImageKey: "questions/draft-1/file-1",
    }),
    { imageUrl: "https://example.test/image" },
  );
  await assert.rejects(
    storage.verifyUploadedFile({
      fileId: "cloud://prod-env/questions/other/file-2",
      expectedImageKey: "questions/draft-1/file-1",
    }),
    /does not belong/i,
  );
});

test("WeChat reminder sender caches tokens and sends only privacy-safe template data", async () => {
  const { createWeChatSubscriptionReminderSender } = await import("../src/adapters/wechat-subscription-reminder.ts");
  const requests: Array<{ url: string; body?: any }> = [];
  const sender = createWeChatSubscriptionReminderSender({
    appId: "app-id",
    appSecret: "app-secret",
    templateId: "template-id",
    nicknameField: "thing1",
    dueCountField: "number2",
    resolveOpenId: async () => "openid-1",
    fetchImpl: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.includes("/cgi-bin/token")) {
        return new Response(JSON.stringify({ access_token: "token-1", expires_in: 7200 }));
      }
      return new Response(JSON.stringify({ errcode: 0, errmsg: "ok" }));
    }) as typeof fetch,
  });
  const notification = {
    childNickname: "小明",
    dueCount: 2,
    entryPath: "/pages/review/index?childId=child-1",
  };
  await sender(notification, "parent-1");
  await sender(notification, "parent-1");

  assert.equal(requests.filter((request) => request.url.includes("/cgi-bin/token")).length, 1);
  const delivery = requests.find((request) => request.url.includes("/subscribe/send"))!.body;
  assert.deepEqual(delivery, {
    touser: "openid-1",
    template_id: "template-id",
    page: "pages/review/index?childId=child-1",
    data: {
      thing1: { value: "小明" },
      number2: { value: 2 },
    },
  });
  assert.equal(JSON.stringify(delivery).includes("题干"), false);
});
