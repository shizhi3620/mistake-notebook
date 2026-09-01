import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const apiSource = readFileSync(new URL("../miniprogram/services/api.js", import.meta.url), "utf8");
type ContainerCallOptions = {
  success?: (response: { statusCode: number; data: unknown }) => void;
  fail?: () => void;
  [key: string]: unknown;
};

test("the release API client calls Cloud Hosting with the API path and service header", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const api = loadApi({
    transport: "container",
    cloudEnv: "prod-d8giqy4sjc5925f68",
    containerService: "ctb",
  }, {
    getSystemInfoSync: () => ({ SDKVersion: "2.13.1" }),
    cloud: {
      callContainer(options: ContainerCallOptions) {
        calls.push(options);
        options.success?.({ statusCode: 200, data: { stage: "ready" } });
      },
    },
  });

  assert.deepEqual(await api.request("GET", "/home"), { stage: "ready" });
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), {
    config: { env: "prod-d8giqy4sjc5925f68" },
    path: "/api/home",
    method: "GET",
    header: { "X-WX-SERVICE": "ctb" },
  });
});

test("the API client rejects Cloud Hosting calls below the supported base library", async () => {
  let called = false;
  const api = loadApi({
    transport: "container",
    cloudEnv: "prod-d8giqy4sjc5925f68",
    containerService: "ctb",
  }, {
    getSystemInfoSync: () => ({ SDKVersion: "2.13.0" }),
    cloud: {
      callContainer() { called = true; },
    },
  });

  await assert.rejects(() => api.request("GET", "/home"), /升级微信/i);
  assert.equal(called, false);
});

test("the development API client keeps using its HTTPS API base", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const api = loadApi({
    transport: "https",
    apiBase: "https://localhost.example/api",
  }, {
    request(options: Record<string, unknown>) {
      calls.push(options);
      (options.success as ((response: { statusCode: number; data: unknown }) => void) | undefined)?.({ statusCode: 200, data: { stage: "ready" } });
    },
  });

  assert.deepEqual(await api.request("GET", "/home"), { stage: "ready" });
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), {
    url: "https://localhost.example/api/home",
    method: "GET",
    header: {},
  });
});

test("the Cloud Hosting API client preserves session and idempotency headers", async () => {
  const calls: Array<ContainerCallOptions> = [];
  const api = loadApi({
    transport: "container",
    cloudEnv: "prod-d8giqy4sjc5925f68",
    containerService: "ctb",
  }, {
    getSystemInfoSync: () => ({ SDKVersion: "2.13.1" }),
    cloud: {
      callContainer(options: ContainerCallOptions) {
        calls.push(options);
        options.success?.({ statusCode: 200, data: { ok: true } });
      },
    },
  }, "saved-token");

  assert.deepEqual(await api.request("POST", "/feedback", { type: "feature" }, { idempotencyKey: "feedback-1" }), { ok: true });
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0]?.header)), {
    "X-WX-SERVICE": "ctb",
    authorization: "Bearer saved-token",
    "Idempotency-Key": "feedback-1",
  });
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0]?.data)), { type: "feature" });
});

for (const transport of ["https", "container"] as const) {
  test(`${transport} transport supports login and one session-expiry retry`, async () => {
    const calls: Array<Record<string, unknown>> = [];
    let attempt = 0;
    const api = loadApi({
      transport,
      apiBase: "https://localhost.example/api",
      cloudEnv: "prod-d8giqy4sjc5925f68",
      containerService: "ctb",
    }, {
      getSystemInfoSync: () => ({ SDKVersion: "2.13.1" }),
      login(options: { success: (value: { code: string }) => void }) {
        options.success({ code: "login-code" });
      },
      request(options: Record<string, unknown>) {
        calls.push(options);
        attempt += 1;
        const success = options.success as (response: Record<string, unknown>) => void;
        success(attempt === 1 ? { statusCode: 401, data: {} } : { statusCode: 200, data: attempt === 2 ? { session: { token: "fresh-token" } } : { ok: true } });
      },
      cloud: {
        callContainer(options: ContainerCallOptions) {
          calls.push(options);
          attempt += 1;
          options.success?.(attempt === 1 ? { statusCode: 401, data: {} } : { statusCode: 200, data: attempt === 2 ? { session: { token: "fresh-token" } } : { ok: true } });
        },
      },
    }, "expired-token");

    assert.deepEqual(await api.request("GET", "/home"), { ok: true });
    assert.equal(calls.length, 3);
    assert.equal((calls[1]?.data as { code?: string })?.code, "login-code");
  });
}

function loadApi(config: Record<string, unknown>, wxOverrides: Record<string, unknown>, savedToken = "") {
  const storage = new Map<string, unknown>();
  if (savedToken) storage.set("sessionToken", savedToken);
  const wx = {
    getStorageSync(key: string) { return storage.get(key) || ""; },
    setStorageSync(key: string, value: unknown) { storage.set(key, value); },
    removeStorageSync(key: string) { storage.delete(key); },
    login() {},
    ...wxOverrides,
  };
  const module = { exports: {} as Record<string, unknown> };
  runInNewContext(apiSource, {
    module,
    require(path: string) {
      if (path === "../config") return config;
      throw new Error(`Unexpected require: ${path}`);
    },
    wx,
    Promise,
    Date,
    Math,
    Error,
  });
  return module.exports as {
    request(method: string, path: string, body?: unknown, options?: { idempotencyKey?: string }): Promise<unknown>;
  };
}
