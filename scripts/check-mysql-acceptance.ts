import { closeMysqlPool, createMysqlPool, readMysqlConnectionConfig, verifyMysqlPool } from "../src/adapters/mysql-pool.ts";
import { migrateMysqlSchema } from "../src/adapters/mysql-schema.ts";

const config = readMysqlConnectionConfig();
if (!config) throw new Error("MYSQL_* configuration is required.");
const pool = createMysqlPool(config);
try {
  await verifyMysqlPool(pool);
  await migrateMysqlSchema(pool);
  const [versions] = await pool.query("SELECT COUNT(*) AS count FROM schema_migrations");
  const [tables] = await pool.query("SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('parent_accounts','child_profiles','questions','mistakes','review_schedules','reviews','reminder_settings','reminder_dispatches','homework_reviews','idempotency_records')");
  console.log(JSON.stringify({ reachable: true, tlsConfigured: config.ssl, schemaVersions: Number((versions as Array<{ count: number }>)[0]?.count ?? 0), requiredTables: Number((tables as Array<{ count: number }>)[0]?.count ?? 0) }));
} finally {
  await closeMysqlPool(pool);
}
