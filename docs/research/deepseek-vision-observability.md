# DeepSeek Vision Observability Research

Research date: 2026-09-02. Sources below are DeepSeek's official API
documentation. This note records externally documented behaviour; it does not
prove the cause of any one failed recognition.

## Request constraints that can look intermittent

The vision model is `deepseek-v4-flash-vision-exp`. It accepts JPEG, PNG, GIF,
and WebP, detecting the format from file content rather than its file name or
declared MIME type. Images must be supplied in a `user` message; sending one
in a `system` or `assistant` message returns HTTP 400. A non-vision model also
returns HTTP 400 for an image request.
[Vision guide](https://api-docs.deepseek.com/guides/vision/)

For the OpenAI-compatible Chat Completions endpoint, an image can be a base64
`data:` URL, a publicly reachable `http(s)` URL, or a prior Files API
`file_id`. Inline base64 contributes to the 48 MiB request-body limit. An
external URL has an 8192-character limit, its downloaded file must be at most
32 MiB, and DeepSeek must finish downloading it within 60 seconds. A `file_id`
image can be as large as 64 MiB.
[Vision guide: sending images and limits](https://api-docs.deepseek.com/guides/vision/#sending-images)

Other per-request limits are 600 images, 64 MiB of total image data without
`file_id` images (up to 200 MiB with them), and 8192 pixels per side. The
per-side limit drops to 4096 pixels when there are 15 or more images. These
conditions are deterministic, so log them before calling the API instead of
treating their failures as model instability.
[Vision guide: limits](https://api-docs.deepseek.com/guides/vision/#limits)

`detail: "low"` downscales an `image_url` input to 512 by 512 and is documented
as faster and cheaper. `high`, `original`, and the currently equivalent `auto`
keep the original image. Independently, DeepSeek resizes images before
inference and bills image tokens by dimensions, capped at 384 tokens per image.
The response `usage` object contains prompt, completion, cache-hit,
cache-miss, and total token counts; record it on successful calls.
[Vision guide: detail and token usage](https://api-docs.deepseek.com/guides/vision/#detail-level)
[Chat Completions reference: response usage](https://api-docs.deepseek.com/api/create-chat-completion)

## Error and retry classification

DeepSeek documents 400 (invalid body), 401 (authentication), 402 (insufficient
balance), and 422 (invalid parameters) as request/account corrections, not
retry candidates. It documents 429 as rate limiting: pace requests. It
documents 500 as a server error and 503 as overload, both to retry after a
brief wait. Use a bounded exponential backoff with jitter for 429, 500, and
503 only, and preserve the same application request ID across attempts.
[DeepSeek error codes](https://api-docs.deepseek.com/quick_start/error_codes)

The vision model's documented account-level concurrency limit is 2500; a
request consumes one connection from send until the response completes, and
exceeding the account or applicable `user_id` limit yields 429. A request that
has not started inference after 10 minutes is closed by the server. This makes
queue time and in-flight count useful signals alongside status codes.
[Rate limit and isolation](https://api-docs.deepseek.com/quick_start/rate_limit)

An HTTP 530 from Cloudflare Tunnel is not a DeepSeek API status. Log it as the
client-to-local-backend transport stage, separately from any DeepSeek request.

## Minimum diagnostic events

Emit structured events with a shared `requestId` and an `attempt` number. Do
not log image bytes, base64 data, bearer tokens, WeChat login codes, or the
full generated answer.

- Client: `recognition_submit_started`, `upload_started`, `upload_finished`,
  `upload_failed`, `recognition_response_received`, and
  `recognition_request_failed`. Include elapsed milliseconds, file byte size,
  detected MIME type, pixel width/height when available, API base host, HTTP
  status, and a sanitized error category.
- Backend before DeepSeek: `vision_request_validated` and
  `vision_request_started`. Include input method (`base64`, URL, or `file_id`),
  byte size, image count, dimensions, selected `detail`, model, request-body
  byte size, and current in-flight vision count.
- Backend after DeepSeek: `vision_request_succeeded` with elapsed milliseconds,
  upstream status, completion ID/model, finish reason, and `usage` counters;
  or `vision_request_failed` with elapsed milliseconds, upstream status,
  sanitized upstream error code/message, retryable boolean, and retry delay.

To locate a sporadic failure, compare timestamps for the four stages: client
upload, client-to-backend HTTP call, backend image retrieval/preparation, and
backend-to-DeepSeek call. Only the final stage plus a DeepSeek 429/500/503
supports the conclusion that the provider was involved; a tunnel error, URL
download timeout, validation 400/422, or missing backend event points
elsewhere.
