import assert from "node:assert/strict";
import test from "node:test";

import { migrateMysqlSchema } from "../src/adapters/mysql-schema.ts";

test("schema migration records each version and skips already applied versions", async () => {
  const queries: string[] = [];
  const applied = new Set<number>();
  const connection = {
    async query(sql: string, params?: unknown[]) {
      queries.push(sql);
      if (sql.startsWith("SELECT version")) {
        return [[...(applied.has(Number((params as number[])[0])) ? [{ version: 1 }] : [])]];
      }
      if (sql.startsWith("INSERT INTO schema_migrations")) {
        applied.add(Number((params as number[])[0]));
      }
      return [[]];
    },
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
  };
  const pool = {
    async getConnection() {
      return connection;
    },
  };

  await migrateMysqlSchema(pool as never);
  const firstRunStatements = queries.length;
  await migrateMysqlSchema(pool as never);
  assert.ok(queries.length > firstRunStatements);
  assert.equal(
    queries.filter((query) => query.startsWith("INSERT INTO schema_migrations")).length,
    15,
  );
});
