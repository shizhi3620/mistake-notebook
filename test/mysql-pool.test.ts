import assert from "node:assert/strict";
import test from "node:test";

import {
  readMysqlConnectionConfig,
  shouldRetryMysqlWithoutTls,
} from "../src/adapters/mysql-pool.ts";

test("cloud hosting retries without TLS only when the server explicitly does not support it", () => {
  const unsupported = new Error("Server does not support secure connection");
  assert.equal(shouldRetryMysqlWithoutTls(unsupported, true, true), true);
  assert.equal(shouldRetryMysqlWithoutTls(unsupported, false, true), false);
  assert.equal(shouldRetryMysqlWithoutTls(unsupported, true, false), false);
  assert.equal(shouldRetryMysqlWithoutTls(new Error("Access denied"), true, true), false);
});

test("MySQL configuration is absent only when every required value is absent", () => {
  assert.equal(readMysqlConnectionConfig({}), undefined);
  assert.throws(
    () => readMysqlConnectionConfig({ MYSQL_HOST: "db.internal" }),
    /must be configured together/,
  );
});

test("MySQL configuration validates ports and keeps TLS enabled by default", () => {
  const environment = {
    MYSQL_HOST: "db.internal",
    MYSQL_DATABASE: "mistakes",
    MYSQL_USER: "app",
    MYSQL_PASSWORD: "secret",
  };
  assert.deepEqual(readMysqlConnectionConfig(environment), {
    host: "db.internal",
    port: 3306,
    database: "mistakes",
    user: "app",
    password: "secret",
    ssl: true,
  });
  assert.throws(
    () => readMysqlConnectionConfig({ ...environment, MYSQL_PORT: "nope" }),
    /valid TCP port/,
  );
});
