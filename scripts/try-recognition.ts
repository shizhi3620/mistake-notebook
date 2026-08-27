import { readFileSync } from "node:fs";
import { extname } from "node:path";

import { createOpenAiCompatibleRecognitionClient } from "../src/adapters/openai-compatible-recognition.ts";

const imagePath = process.argv[2];

if (!imagePath) {
  console.error("Usage: npx tsx scripts/try-recognition.ts <image-path>");
  process.exit(1);
}

const mimeByExt: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};
const mime = mimeByExt[extname(imagePath).toLowerCase()] ?? "image/jpeg";
const imageDataUrl = `data:${mime};base64,${readFileSync(imagePath).toString("base64")}`;

const recognize = createOpenAiCompatibleRecognitionClient({
  baseUrl: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY!,
  model: process.env.TRY_MODEL ?? "deepseek-v4-flash-vision-exp",
});

const recognition = await recognize({ imageDataUrl });

console.log(JSON.stringify(recognition, null, 2));
