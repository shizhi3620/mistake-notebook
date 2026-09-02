export function parseModelJson(content: unknown): unknown {
  if (typeof content !== "string") throw new Error("Model content is missing.");
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced ? fenced[1]!.trim() : trimmed;
  try { return JSON.parse(candidate); } catch { /* Model output may include a short prose preface. */ }

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Model content does not contain a JSON object.");
  return JSON.parse(candidate.slice(start, end + 1));
}

export function modelResponseMetadata(payload: any): Record<string, unknown> {
  const choice = payload?.choices?.[0];
  return {
    finishReason: typeof choice?.finish_reason === "string" ? choice.finish_reason : "",
    contentLength: typeof choice?.message?.content === "string" ? choice.message.content.length : 0,
    promptTokens: Number.isFinite(payload?.usage?.prompt_tokens) ? payload.usage.prompt_tokens : null,
    completionTokens: Number.isFinite(payload?.usage?.completion_tokens) ? payload.usage.completion_tokens : null,
    totalTokens: Number.isFinite(payload?.usage?.total_tokens) ? payload.usage.total_tokens : null,
  };
}
