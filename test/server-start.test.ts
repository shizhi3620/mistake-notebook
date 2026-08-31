import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("cloud hosting startup does not require long-lived Tencent Cloud credentials", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "src/server/start.ts"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        CLOUD_HOSTING: "true",
        CLOUDBASE_ENV: "test-env",
        WECHAT_APP_ID: "test-app",
        WECHAT_APP_SECRET: "test-secret",
        MYSQL_HOST: "127.0.0.1",
        MYSQL_PORT: "1",
        MYSQL_DATABASE: "test",
        MYSQL_USER: "test",
        MYSQL_PASSWORD: "test",
        MYSQL_SSL: "true",
        TENCENTCLOUD_SECRETID: " ",
        TENCENTCLOUD_SECRETKEY: " ",
      },
      timeout: 5_000,
    },
  );

  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stderr, /TENCENTCLOUD_SECRETID must be configured/);
  assert.match(result.stderr, /MySQL connection or schema initialization failed/);
});
