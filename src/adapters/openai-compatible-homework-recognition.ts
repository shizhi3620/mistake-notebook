import type { HomeworkRecognition } from "../learning-loop.ts";
import type { OpenAiCompatibleAdapterOptions } from "./openai-compatible-explanation.ts";

const PROMPT = `你是中国数学作业批改助手。识别图片中每一道清晰可见的数学题及学生作答，并只输出 JSON 对象：
{"questions":[{"stem":"题干","studentAnswer":"学生答案或null","studentAnswerConfidence":0到1或null,"verdict":"correct|incorrect|uncertain","confidence":0到1,"answerSource":"ai","referenceAnswer":"参考答案或null","reasoning":"简短理由或null","suggestedPrimaryKnowledgePoint":"知识点或null","suggestedSecondaryKnowledgePoints":[],"suggestedMistakeCause":"错因或null"}]}
忽略姓名、页码、草稿和无法可靠读取的内容；最多返回20题。无法判断正误时 verdict 为 uncertain。`;

export function createOpenAiCompatibleHomeworkRecognitionClient(options: OpenAiCompatibleAdapterOptions): (input: { imageDataUrl: string }) => Promise<HomeworkRecognition> {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  return async ({ imageDataUrl }) => {
    let response: Response;
    const startedAt = Date.now();
    try {
      response = await fetchImpl(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${options.apiKey}` },
        body: JSON.stringify({ model: options.model, max_tokens: 3000, response_format: { type: "json_object" }, messages: [{ role: "system", content: PROMPT }, { role: "user", content: [{ type: "image_url", image_url: { url: imageDataUrl } }] }] }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 14_000),
      });
    } catch (error) {
      options.onEvent?.({ event: "vision_provider_failure", kind: "homework_page", attempt: 1, durationMs: Date.now() - startedAt, errorName: error instanceof Error ? error.name : "UnknownError", errorMessage: error instanceof Error ? error.message.slice(0, 200) : "unknown error" });
      throw new Error(`Recognition request unavailable: ${error instanceof Error ? error.message : "unknown error"}`);
    }
    options.onEvent?.({ event: "vision_provider_response", kind: "homework_page", attempt: 1, status: response.status, durationMs: Date.now() - startedAt, retryAfter: response.headers.get("retry-after") ?? "" });
    if (!response.ok) throw new Error(`Recognition request failed with status ${response.status}.`);
    const content = (await response.json() as any)?.choices?.[0]?.message?.content;
    let parsed: any;
    try { parsed = JSON.parse(content); } catch { options.onEvent?.({ event: "vision_provider_invalid_payload", kind: "homework_page", reason: "invalid_json" }); throw new Error("Recognition provider returned invalid JSON."); }
    if (!Array.isArray(parsed?.questions) || parsed.questions.length === 0 || parsed.questions.length > 20) throw new Error("Recognition provider returned an invalid homework payload.");
    const questions = parsed.questions.map((question: any) => ({
      stem: typeof question.stem === "string" ? question.stem : "",
      studentAnswer: typeof question.studentAnswer === "string" ? question.studentAnswer : null,
      studentAnswerConfidence: typeof question.studentAnswerConfidence === "number" ? question.studentAnswerConfidence : null,
      verdict: ["correct", "incorrect", "uncertain"].includes(question.verdict) ? question.verdict : "uncertain",
      confidence: typeof question.confidence === "number" ? question.confidence : 0,
      answerSource: "ai" as const,
      referenceAnswer: typeof question.referenceAnswer === "string" ? question.referenceAnswer : null,
      reasoning: typeof question.reasoning === "string" ? question.reasoning : null,
      suggestedPrimaryKnowledgePoint: typeof question.suggestedPrimaryKnowledgePoint === "string" ? question.suggestedPrimaryKnowledgePoint : null,
      suggestedSecondaryKnowledgePoints: Array.isArray(question.suggestedSecondaryKnowledgePoints) ? question.suggestedSecondaryKnowledgePoints.filter((value: unknown) => typeof value === "string").slice(0, 2) : [],
      suggestedMistakeCause: typeof question.suggestedMistakeCause === "string" ? question.suggestedMistakeCause : null,
    }));
    if (questions.some((question: any) => !question.stem.trim() || question.confidence < 0 || question.confidence > 1)) throw new Error("Recognition provider returned an invalid homework payload.");
    return { questions };
  };
}
