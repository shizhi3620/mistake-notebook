import type {
  CropRegion,
  QuestionRecognition,
} from "../learning-loop.ts";
import type { OpenAiCompatibleAdapterOptions } from "./openai-compatible-explanation.ts";

const SYSTEM_PROMPT = `你是数学题图片识别助手。从用户上传的图片中识别唯一一道数学题。\
只输出一个 JSON 对象，不要输出任何其他文字。字段：
- "stem": 识别出的题干文字，数学符号用纯文本表示。
- "formulas": 字符串数组，列出题干中的公式；没有则为空数组。
- "confidence": 0 到 1 的数字，表示识别置信度；图片模糊、题干不完整或被遮挡时应低于 0.6。
- "region": 题目在图片中的归一化区域 { "x", "y", "width", "height" }（0 到 1），无法判断时为 null。`;

export function createOpenAiCompatibleRecognitionClient(
  options: OpenAiCompatibleAdapterOptions,
): (input: { imageDataUrl: string }) => Promise<QuestionRecognition> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? 30_000;

  return async ({ imageDataUrl }) => {
    const response = await fetchImpl(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
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

    if (!response.ok) {
      throw new Error(
        `Recognition request failed with status ${response.status}.`,
      );
    }

    const payload = (await response.json()) as any;
    const text = payload?.choices?.[0]?.message?.content;

    if (typeof text !== "string") {
      throw new Error("Recognition provider returned an invalid payload.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
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

  return {
    stem: recognition.stem,
    formulas: recognition.formulas,
    confidence: recognition.confidence,
    region: assertRegion(recognition.region),
  };
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
