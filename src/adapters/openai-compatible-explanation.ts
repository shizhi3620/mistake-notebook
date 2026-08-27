import type {
  ExplanationContent,
  ExplanationRequest,
} from "../learning-loop.ts";

export type OpenAiCompatibleAdapterOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const GRADE_NAMES = [
  "一年级",
  "二年级",
  "三年级",
  "四年级",
  "五年级",
  "六年级",
  "七年级",
  "八年级",
  "九年级",
];

const SYSTEM_PROMPT = `你是一位面向中国大陆一至九年级学生的数学辅导老师。\
严格依据国家课程标准和学生所在年级的知识点体系讲解，不得使用超年级的方法或术语。\
只输出一个 JSON 对象，不要输出任何其他文字。字段：
- "hint": 一句启发式提示，引导学生先独立思考，不泄露答案。
- "approach": 解题思路概述。
- "steps": 字符串数组，按顺序给出分步解题过程。
- "finalAnswer": 最终答案。
- "variantExercise": 对象 { "stem", "answer" }，一道考查同一知识点、难度相近、学生可独立完成的变式题。
- "suggestedPrimaryKnowledgePoint": 建议的一个主知识点；不确定时为 null。
- "suggestedSecondaryKnowledgePoints": 建议的零到两个次知识点字符串数组。
- "suggestedMistakeCause": 根据学生作答建议的错因；没有学生作答或无法可靠判断时为 null。`;

export function createOpenAiCompatibleExplanationProvider(
  options: OpenAiCompatibleAdapterOptions,
): (request: ExplanationRequest) => Promise<ExplanationContent> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? 30_000;

  return async (request) => {
    const gradeName = GRADE_NAMES[request.grade - 1] ?? `${request.grade} 年级`;
    const studentAnswerPart = request.skipAnswerAnalysis
      ? "学生作答无法识别，请跳过作答分析，不要猜测学生的错误步骤。"
      : request.studentAnswer
        ? `学生作答：${request.studentAnswer}。请指出可能的错误步骤。`
        : "学生未提供作答。";

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
              `学生年级：${gradeName}。`,
              `题目：${request.stem}`,
              request.formulas.length > 0
                ? `识别出的公式：${request.formulas.join("；")}。`
                : "",
              studentAnswerPart,
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      throw new Error(
        `Explanation provider request failed with status ${response.status}.`,
      );
    }

    const payload = (await response.json()) as any;
    const text = payload?.choices?.[0]?.message?.content;

    if (typeof text !== "string") {
      throw new Error("Explanation provider returned an invalid payload.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Explanation provider returned invalid JSON.");
    }

    return assertExplanationContent(parsed);
  };
}

function assertExplanationContent(value: unknown): ExplanationContent {
  const content = value as Partial<ExplanationContent> | null;

  if (
    !content ||
    typeof content.hint !== "string" ||
    typeof content.approach !== "string" ||
    !Array.isArray(content.steps) ||
    !content.steps.every((step) => typeof step === "string") ||
    typeof content.finalAnswer !== "string" ||
    typeof content.variantExercise?.stem !== "string" ||
    typeof content.variantExercise?.answer !== "string"
  ) {
    throw new Error(
      "Explanation provider returned JSON with an invalid shape.",
    );
  }

  if (
    content.suggestedPrimaryKnowledgePoint !== undefined &&
    content.suggestedPrimaryKnowledgePoint !== null &&
    typeof content.suggestedPrimaryKnowledgePoint !== "string"
  ) {
    throw new Error("Suggested primary knowledge point has an invalid shape.");
  }
  if (
    content.suggestedSecondaryKnowledgePoints !== undefined &&
    (!Array.isArray(content.suggestedSecondaryKnowledgePoints) ||
      !content.suggestedSecondaryKnowledgePoints.every(
        (point) => typeof point === "string",
      ) ||
      content.suggestedSecondaryKnowledgePoints.length > 2)
  ) {
    throw new Error("Suggested secondary knowledge points have an invalid shape.");
  }
  if (
    content.suggestedMistakeCause !== undefined &&
    content.suggestedMistakeCause !== null &&
    typeof content.suggestedMistakeCause !== "string"
  ) {
    throw new Error("Suggested mistake cause has an invalid shape.");
  }

  return content as ExplanationContent;
}
