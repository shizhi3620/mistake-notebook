import { createPool, type Pool, type PoolOptions } from "mysql2/promise";

export type MysqlConnectionConfig = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
};

export function readMysqlConnectionConfig(
  environment: NodeJS.ProcessEnv = process.env,
): MysqlConnectionConfig | undefined {
  const values = [
    environment.MYSQL_HOST,
    environment.MYSQL_DATABASE,
    environment.MYSQL_USER,
    environment.MYSQL_PASSWORD,
  ];
  if (values.every((value) => !value?.trim())) return undefined;
  if (values.some((value) => !value?.trim())) {
    throw new Error(
      "MYSQL_HOST, MYSQL_DATABASE, MYSQL_USER, and MYSQL_PASSWORD must be configured together.",
    );
  }

  const port = Number(environment.MYSQL_PORT ?? 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("MYSQL_PORT must be a valid TCP port.");
  }

  return {
    host: environment.MYSQL_HOST!.trim(),
    port,
    database: environment.MYSQL_DATABASE!.trim(),
    user: environment.MYSQL_USER!.trim(),
    password: environment.MYSQL_PASSWORD!,
    ssl: environment.MYSQL_SSL !== "false",
  };
}

export function createMysqlPool(config: MysqlConnectionConfig): Pool {
  const options: PoolOptions = {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    waitForConnections: true,
    connectionLimit: 10,
    enableKeepAlive: true,
    ssl: config.ssl ? {} : undefined,
  };
  return createPool(options);
}

export function shouldRetryMysqlWithoutTls(
  error: unknown,
  cloudHosting: boolean,
  tlsEnabled: boolean,
): boolean {
  return (
    cloudHosting &&
    tlsEnabled &&
    error instanceof Error &&
    error.message.includes("Server does not support secure connection")
  );
}

export async function verifyMysqlPool(pool: Pool): Promise<void> {
  const connection = await pool.getConnection();
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}

export async function closeMysqlPool(pool: Pool): Promise<void> {
  await pool.end();
}
