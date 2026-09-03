import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("production startup reports MySQL failures without requiring COS before connection", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "src/server/start.ts"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        PRODUCTION: "true",
        WECHAT_APP_ID: "test-app",
        WECHAT_APP_SECRET: "test-secret",
        MYSQL_HOST: "127.0.0.1",
        MYSQL_PORT: "1",
        MYSQL_DATABASE: "test",
        MYSQL_USER: "test",
        MYSQL_PASSWORD: "test",
        MYSQL_SSL: "true",
      },
      timeout: 5_000,
    },
  );

  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stderr, /COS_SECRET_ID must be configured/);
  assert.match(result.stderr, /MySQL connection or schema initialization failed/);
});
