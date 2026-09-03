import type {
  CropRegion,
  QuestionRecognition,
} from "../learning-loop.ts";
import type { OpenAiCompatibleAdapterOptions } from "./openai-compatible-explanation.ts";
import { modelResponseMetadata, parseModelJson } from "./openai-json.ts";

const SYSTEM_PROMPT = `你是数学题图片识别助手。从用户上传的图片中识别唯一一道数学题。\
只输出一个 JSON 对象，不要输出任何其他文字或解释；所有字段尽量简短，禁止输出分析过程。字段：
- "stem": 识别出的题干文字，数学符号用纯文本表示。
- "formulas": 字符串数组，列出题干中的公式；没有则为空数组。
- "confidence": 0 到 1 的数字，表示识别置信度；图片模糊、题干不完整或被遮挡时应低于 0.6。
- "region": 题目在图片中的归一化区域 { "x", "y", "width", "height" }（0 到 1），无法判断时为 null。
- "studentAnswer": 图片中学生的手写作答或步骤；没有或无法可靠识别时为 null。
- "studentAnswerConfidence": 0 到 1 的数字，表示手写作答识别置信度；studentAnswer 为 null 时为 null。`;

export function createOpenAiCompatibleRecognitionClient(
  options: OpenAiCompatibleAdapterOptions,
): (input: { imageDataUrl: string }) => Promise<QuestionRecognition> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxRetries = Math.max(0, Math.min(3, options.maxRetries ?? 2));

  return async ({ imageDataUrl }) => {
    let response: Response | undefined;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const startedAt = Date.now();
      try {
        response = await fetchImpl(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        max_tokens: 1600,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: imageDataUrl },
              },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(timeoutMs),
        });
        options.onEvent?.({ event: "vision_provider_response", kind: "single_question", attempt: attempt + 1, status: response.status, durationMs: Date.now() - startedAt, retryAfter: response.headers.get("retry-after") ?? "" });
        if (response.ok || response.status < 500 || attempt === maxRetries) break;
      } catch (error) {
        options.onEvent?.({ event: "vision_provider_failure", kind: "single_question", attempt: attempt + 1, durationMs: Date.now() - startedAt, errorName: error instanceof Error ? error.name : "UnknownError", errorMessage: error instanceof Error ? error.message.slice(0, 200) : "unknown error" });
        if (attempt === maxRetries) throw new Error(`Recognition request unavailable after ${attempt + 1} attempts: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }
    if (!response) throw new Error("Recognition request unavailable.");

    if (!response.ok) {
      throw new Error(
        `Recognition request failed with status ${response.status}.`,
      );
    }

    const payload = (await response.json()) as any;
    const text = payload?.choices?.[0]?.message?.content;
    options.onEvent?.({ event: "vision_provider_payload", kind: "single_question", ...modelResponseMetadata(payload) });

    let parsed: unknown;
    try {
      parsed = parseModelJson(text);
    } catch (error) {
      options.onEvent?.({ event: "vision_provider_invalid_payload", kind: "single_question", reason: "invalid_json", errorMessage: error instanceof Error ? error.message : "unknown error" });
      throw new Error("Recognition provider returned invalid JSON.");
    }

    return assertRecognition(parsed);
  };
}

function assertRecognition(value: unknown): QuestionRecognition {
  const recognition = value as Partial<QuestionRecognition> | null;

  if (
    !recognition ||
    typeof recognition.stem !== "string" ||
    !Array.isArray(recognition.formulas) ||
    !recognition.formulas.every((formula) => typeof formula === "string") ||
    typeof recognition.confidence !== "number"
  ) {
    throw new Error(
      "Recognition provider returned JSON with an invalid shape.",
    );
  }

  if (recognition.confidence < 0 || recognition.confidence > 1) {
    throw new Error(
      "Recognition confidence must be between 0 and 1.",
    );
  }

  const studentAnswer = assertOptionalStudentAnswer(recognition.studentAnswer);
  const studentAnswerConfidence = assertOptionalConfidence(
    recognition.studentAnswerConfidence,
  );
  if (
    (studentAnswer === undefined) !== (studentAnswerConfidence === undefined)
  ) {
    throw new Error("Handwritten answer and its confidence must be provided together.");
  }
  if ((studentAnswer === null) !== (studentAnswerConfidence === null)) {
    throw new Error("Handwritten answer and its confidence must be provided together.");
  }

  return {
    stem: recognition.stem,
    formulas: recognition.formulas,
    confidence: recognition.confidence,
    region: assertRegion(recognition.region),
    ...(studentAnswerConfidence !== undefined
      ? { studentAnswer, studentAnswerConfidence }
      : {}),
  };
}

function assertOptionalStudentAnswer(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value === "string") return value;
  throw new Error("Handwritten answer must be a string or null.");
}

function assertOptionalConfidence(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value !== "number" || value < 0 || value > 1) {
    throw new Error("Handwritten answer confidence must be between 0 and 1.");
  }
  return value;
}

function assertRegion(region: unknown): CropRegion | null {
  if (region === null || region === undefined) {
    return null;
  }

  const candidate = region as Partial<CropRegion>;

  if (
    typeof candidate.x !== "number" ||
    typeof candidate.y !== "number" ||
    typeof candidate.width !== "number" ||
    typeof candidate.height !== "number"
  ) {
    throw new Error("Recognition region has an invalid shape.");
  }

  return {
    x: candidate.x,
    y: candidate.y,
    width: candidate.width,
    height: candidate.height,
  };
}
