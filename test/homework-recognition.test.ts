import assert from "node:assert/strict";
import test from "node:test";
import { createOpenAiCompatibleHomeworkRecognitionClient } from "../src/adapters/openai-compatible-homework-recognition.ts";

test("homework recognition returns AI candidates for a page image", async () => {
  const recognize = createOpenAiCompatibleHomeworkRecognitionClient({
    baseUrl: "https://example.test",
    apiKey: "test",
    model: "vision",
    fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ questions: [{ stem: "1 + 1 = ?", studentAnswer: "2", studentAnswerConfidence: 0.9, verdict: "correct", confidence: 0.92, answerSource: "ai", referenceAnswer: "2", reasoning: "计算正确", suggestedPrimaryKnowledgePoint: "加法", suggestedSecondaryKnowledgePoints: [], suggestedMistakeCause: null }] }) } }] }), { status: 200 }),
  });
  const result = await recognize({ imageDataUrl: "data:image/jpeg;base64,QUJD" });
  assert.equal(result.questions[0]?.stem, "1 + 1 = ?");
  assert.equal(result.questions[0]?.verdict, "correct");
});
