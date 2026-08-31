import type { Pool, RowDataPacket } from "mysql2/promise";

export type IdempotencyClaim =
  | { state: "claimed" }
  | { state: "pending" }
  | { state: "completed"; response: unknown };

export interface IdempotencyStore {
  claim(parentAccountId: string, operation: string, key: string): Promise<IdempotencyClaim>;
  complete(parentAccountId: string, operation: string, key: string, response: unknown): Promise<void>;
  release(parentAccountId: string, operation: string, key: string): Promise<void>;
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<string, { state: "pending" | "completed"; response?: unknown }>();

  async claim(parentAccountId: string, operation: string, key: string): Promise<IdempotencyClaim> {
    const recordKey = this.key(parentAccountId, operation, key);
    const existing = this.records.get(recordKey);
    if (!existing) {
      this.records.set(recordKey, { state: "pending" });
      return { state: "claimed" };
    }
    return existing.state === "completed"
      ? { state: "completed", response: existing.response }
      : { state: "pending" };
  }

  async complete(parentAccountId: string, operation: string, key: string, response: unknown): Promise<void> {
    this.records.set(this.key(parentAccountId, operation, key), { state: "completed", response });
  }

  async release(parentAccountId: string, operation: string, key: string): Promise<void> {
    const recordKey = this.key(parentAccountId, operation, key);
    if (this.records.get(recordKey)?.state === "pending") this.records.delete(recordKey);
  }

  private key(parentAccountId: string, operation: string, key: string): string {
    return `${parentAccountId}\u0000${operation}\u0000${key}`;
  }
}

export class MysqlIdempotencyStore implements IdempotencyStore {
  constructor(private readonly pool: Pool) {}

  async claim(parentAccountId: string, operation: string, key: string): Promise<IdempotencyClaim> {
    try {
      await this.pool.execute(
        "INSERT INTO idempotency_records (parent_account_id, operation_name, idempotency_key, state) VALUES (?, ?, ?, 'pending')",
        [parentAccountId, operation, key],
      );
      return { state: "claimed" };
    } catch (error) {
      if ((error as { code?: string }).code !== "ER_DUP_ENTRY") throw error;
    }
    const [rows] = await this.pool.query<(RowDataPacket & { state: string; response_json: string | unknown | null })[]>(
      "SELECT state, response_json FROM idempotency_records WHERE parent_account_id=? AND operation_name=? AND idempotency_key=?",
      [parentAccountId, operation, key],
    );
    const record = rows[0];
    if (!record || record.state === "pending") return { state: "pending" };
    return {
      state: "completed",
      response: typeof record.response_json === "string"
        ? JSON.parse(record.response_json)
        : record.response_json,
    };
  }

  async complete(parentAccountId: string, operation: string, key: string, response: unknown): Promise<void> {
    await this.pool.execute(
      "UPDATE idempotency_records SET state='completed', response_json=? WHERE parent_account_id=? AND operation_name=? AND idempotency_key=? AND state='pending'",
      [JSON.stringify(response), parentAccountId, operation, key],
    );
  }

  async release(parentAccountId: string, operation: string, key: string): Promise<void> {
    await this.pool.execute(
      "DELETE FROM idempotency_records WHERE parent_account_id=? AND operation_name=? AND idempotency_key=? AND state='pending'",
      [parentAccountId, operation, key],
    );
  }
}
