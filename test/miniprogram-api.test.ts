import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../miniprogram/services/api.js", import.meta.url), "utf8");

test("the release API client calls the filed HTTPS API domain", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const api = loadApi({ apiBase: "https://api.example.com/api" }, { request(options: Record<string, unknown>) { calls.push(options); (options.success as (response: { statusCode: number; data: unknown }) => void)({ statusCode: 200, data: { stage: "ready" } }); } });
  assert.deepEqual(await api.request("GET", "/home"), { stage: "ready" });
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), { url: "https://api.example.com/api/home", method: "GET", header: {} });
});

test("the HTTPS API client preserves session and idempotency headers", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const api = loadApi({ apiBase: "https://api.example.com/api" }, { request(options: Record<string, unknown>) { calls.push(options); (options.success as (response: { statusCode: number; data: unknown }) => void)({ statusCode: 200, data: { ok: true } }); } }, "saved-token");
  assert.deepEqual(await api.request("POST", "/feedback", { type: "feature" }, { idempotencyKey: "feedback-1" }), { ok: true });
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0]?.header)), { authorization: "Bearer saved-token", "Idempotency-Key": "feedback-1" });
});

test("the HTTPS API client supports login and one session-expiry retry", async () => {
  const calls: Array<Record<string, unknown>> = [];
  let attempt = 0;
  const api = loadApi({ apiBase: "https://api.example.com/api" }, {
    login(options: { success: (value: { code: string }) => void }) { options.success({ code: "login-code" }); },
    request(options: Record<string, unknown>) { calls.push(options); attempt += 1; const success = options.success as (response: Record<string, unknown>) => void; success(attempt === 1 ? { statusCode: 401, data: {} } : { statusCode: 200, data: attempt === 2 ? { session: { token: "fresh-token" } } : { ok: true } }); },
  }, "expired-token");
  assert.deepEqual(await api.request("GET", "/home"), { ok: true });
  assert.equal(calls.length, 3);
  assert.equal((calls[1]?.data as { code?: string }).code, "login-code");
});

function loadApi(config: Record<string, unknown>, wxOverrides: Record<string, unknown>, savedToken = "") {
  const storage = new Map<string, unknown>();
  if (savedToken) storage.set("sessionToken", savedToken);
  const wx = { getStorageSync(key: string) { return storage.get(key) || ""; }, setStorageSync(key: string, value: unknown) { storage.set(key, value); }, removeStorageSync(key: string) { storage.delete(key); }, login() {}, ...wxOverrides };
  const module = { exports: {} as Record<string, unknown> };
  runInNewContext(source, { module, require(path: string) { if (path === "../config") return config; throw new Error(`Unexpected require: ${path}`); }, wx, Promise, Date, Math, Error });
  return module.exports as { request(method: string, path: string, body?: unknown, options?: { idempotencyKey?: string }): Promise<unknown> };
}
