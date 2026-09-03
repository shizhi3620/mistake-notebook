import { randomUUID } from "node:crypto";
import type { Pool, RowDataPacket } from "mysql2/promise";

export type RecognitionTaskKind = "single_question" | "homework_page";
export type RecognitionTaskStatus = "pending" | "processing" | "succeeded" | "failed";
export type RecognitionTask = {
  id: string; parentAccountId: string; childProfileId: string; draftId: string | null;
  kind: RecognitionTaskKind; imageKey: string; status: RecognitionTaskStatus; attempts: number;
  result: unknown | null; errorCode: string | null; idempotencyKey: string; createdAt: number;
  updatedAt: number; imageExpiresAt: number; imageDeletedAt: number | null; expiresAt: number;
};
export type HomeworkUploadCredential = { uploadToken: string; parentAccountId: string; childProfileId: string; imageKey: string; expiresAt: number; usedAt: number | null; };
export interface RecognitionTaskStore {
  create(input: Omit<RecognitionTask, "id" | "status" | "attempts" | "result" | "errorCode" | "createdAt" | "updatedAt" | "imageExpiresAt" | "imageDeletedAt">, quota?: { startsAt: number; remaining: number }): Promise<RecognitionTask>;
  find(parentAccountId: string, id: string): Promise<RecognitionTask | undefined>;
  findById(id: string): Promise<RecognitionTask | undefined>;
  claim(id: string, now?: number): Promise<RecognitionTask | undefined>;
  complete(id: string, result: unknown): Promise<void>;
  retry(id: string, errorCode: string): Promise<boolean>;
  fail(id: string, errorCode: string): Promise<void>;
  findExpiredImages(now: number): Promise<string[]>;
  markImageDeleted(imageKey: string, now?: number): Promise<void>;
  cleanup(now: number): Promise<string[]>;
  createHomeworkUploadCredential(parentAccountId: string, childProfileId: string, now?: number): Promise<HomeworkUploadCredential>;
  consumeHomeworkUploadCredential(parentAccountId: string, uploadToken: string, fileId: string, now?: number): Promise<HomeworkUploadCredential>;
}

export class InMemoryRecognitionTaskStore implements RecognitionTaskStore {
  private readonly tasks = new Map<string, RecognitionTask>();
  private readonly uploads = new Map<string, HomeworkUploadCredential>();
  async create(input: Omit<RecognitionTask, "id" | "status" | "attempts" | "result" | "errorCode" | "createdAt" | "updatedAt" | "imageExpiresAt" | "imageDeletedAt">, quota?: { startsAt: number; remaining: number }) {
    const existing = [...this.tasks.values()].find((v) => v.parentAccountId === input.parentAccountId && v.idempotencyKey === input.idempotencyKey && (v.status === "pending" || v.status === "processing"));
    if (existing) return existing;
    if ([...this.tasks.values()].some((v) => v.parentAccountId === input.parentAccountId && (v.status === "pending" || v.status === "processing"))) throw new Error("A recognition task is already running for this family.");
    if (quota && [...this.tasks.values()].filter((v) => v.parentAccountId === input.parentAccountId && v.createdAt >= quota.startsAt).length >= quota.remaining) throw new Error("本月拍题额度已用完；可手动录入或等待下月额度重置。");
    const now = Date.now(); const task: RecognitionTask = { ...input, id: randomUUID(), status: "pending", attempts: 0, result: null, errorCode: null, createdAt: now, updatedAt: now, imageExpiresAt: now + 24 * 60 * 60_000, imageDeletedAt: null };
    this.tasks.set(task.id, task); return task;
  }
  async find(parentAccountId: string, id: string) { const task = this.tasks.get(id); return task?.parentAccountId === parentAccountId ? task : undefined; }
  async findById(id: string) { return this.tasks.get(id); }
  async claim(id: string, now = Date.now()) { const task = this.tasks.get(id); if (!task || task.status !== "pending" || task.expiresAt <= now) return undefined; task.status = "processing"; task.attempts += 1; task.updatedAt = now; return task; }
  async complete(id: string, result: unknown) { const task = this.tasks.get(id); if (!task) return; task.status = "succeeded"; task.result = result; task.updatedAt = Date.now(); }
  async retry(id: string, errorCode: string) { const task = this.tasks.get(id); if (!task || task.status !== "processing") return false; if (task.attempts >= 3) { await this.fail(id, errorCode); return false; } task.status = "pending"; task.errorCode = errorCode; task.updatedAt = Date.now(); return true; }
  async fail(id: string, errorCode: string) { const task = this.tasks.get(id); if (!task) return; task.status = "failed"; task.errorCode = errorCode; task.updatedAt = Date.now(); }
  async findExpiredImages(now: number) { return [...this.tasks.values()].filter((task) => task.imageDeletedAt === null && task.imageExpiresAt <= now).map((task) => task.imageKey); }
  async markImageDeleted(imageKey: string, now = Date.now()) { for (const task of this.tasks.values()) if (task.imageKey === imageKey) task.imageDeletedAt = now; }
  async cleanup(now: number) { const expired = [...this.tasks.values()].filter((task) => task.expiresAt <= now).map((task) => task.imageKey); for (const [id, task] of this.tasks) if (task.expiresAt <= now) this.tasks.delete(id); return expired; }
  async createHomeworkUploadCredential(parentAccountId: string, childProfileId: string, now = Date.now()) { const credential = { uploadToken: randomUUID(), parentAccountId, childProfileId, imageKey: `homework/${childProfileId}/${randomUUID()}`, expiresAt: now + 15 * 60_000, usedAt: null }; this.uploads.set(credential.uploadToken, credential); return credential; }
  async consumeHomeworkUploadCredential(parentAccountId: string, uploadToken: string, objectKey: string, now = Date.now()) { const credential = this.uploads.get(uploadToken); if (!credential || credential.parentAccountId !== parentAccountId || credential.usedAt !== null || credential.expiresAt <= now || objectKey !== credential.imageKey) throw new Error("Homework upload credential is not valid."); credential.usedAt = now; return credential; }
}

export class MysqlRecognitionTaskStore implements RecognitionTaskStore {
  constructor(private readonly pool: Pool) {}
  async create(input: Omit<RecognitionTask, "id" | "status" | "attempts" | "result" | "errorCode" | "createdAt" | "updatedAt" | "imageExpiresAt" | "imageDeletedAt">, quota?: { startsAt: number; remaining: number }) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      // Lock the stable parent row so concurrent creates for one family serialize.
      await connection.query("SELECT id FROM parent_accounts WHERE id=? FOR UPDATE", [input.parentAccountId]);
      const [found] = await connection.query<RowDataPacket[]>("SELECT * FROM recognition_tasks WHERE parent_account_id=? AND idempotency_key=? AND status IN ('pending','processing') LIMIT 1", [input.parentAccountId, input.idempotencyKey]);
      if (found[0]) { await connection.commit(); return row(found[0]); }
      const [running] = await connection.query<RowDataPacket[]>("SELECT id FROM recognition_tasks WHERE parent_account_id=? AND status IN ('pending','processing') LIMIT 1", [input.parentAccountId]);
      if (running[0]) throw new Error("A recognition task is already running for this family.");
      if (quota) {
        const [used] = await connection.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM recognition_tasks WHERE parent_account_id=? AND created_at>=?", [input.parentAccountId, quota.startsAt]);
        if (Number(used[0]?.count ?? 0) >= quota.remaining) throw new Error("本月拍题额度已用完；可手动录入或等待下月额度重置。");
      }
      const now = Date.now(); const task: RecognitionTask = { ...input, id: randomUUID(), status: "pending", attempts: 0, result: null, errorCode: null, createdAt: now, updatedAt: now, imageExpiresAt: now + 24 * 60 * 60_000, imageDeletedAt: null };
      await connection.execute("INSERT INTO recognition_tasks (id,parent_account_id,child_profile_id,draft_id,kind,image_key,status,attempts,idempotency_key,created_at,updated_at,image_expires_at,image_deleted_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [task.id,task.parentAccountId,task.childProfileId,task.draftId,task.kind,task.imageKey,task.status,0,task.idempotencyKey,now,now,task.imageExpiresAt,null,task.expiresAt]);
      await connection.commit();
      return task;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
  async find(parentAccountId: string, id: string) { const [rows] = await this.pool.query<RowDataPacket[]>("SELECT * FROM recognition_tasks WHERE id=? AND parent_account_id=?", [id,parentAccountId]); return rows[0] ? row(rows[0]) : undefined; }
  async findById(id: string) { const [rows] = await this.pool.query<RowDataPacket[]>("SELECT * FROM recognition_tasks WHERE id=?", [id]); return rows[0] ? row(rows[0]) : undefined; }
  async claim(id: string, now = Date.now()) { const [result] = await this.pool.execute("UPDATE recognition_tasks SET status='processing',attempts=attempts+1,updated_at=? WHERE id=? AND status='pending' AND expires_at>?", [now,id,now]); if ((result as { affectedRows: number }).affectedRows !== 1) return undefined; return this.findById(id); }
  async complete(id: string, result: unknown) { await this.pool.execute("UPDATE recognition_tasks SET status='succeeded',result_json=?,updated_at=? WHERE id=?", [JSON.stringify(result),Date.now(),id]); }
  async retry(id: string, errorCode: string) { const [result] = await this.pool.execute("UPDATE recognition_tasks SET status=IF(attempts>=3,'failed','pending'),error_code=?,updated_at=? WHERE id=? AND status='processing'", [errorCode,Date.now(),id]); if ((result as { affectedRows: number }).affectedRows !== 1) return false; return (await this.findById(id))?.status === "pending"; }
  async fail(id: string, errorCode: string) { await this.pool.execute("UPDATE recognition_tasks SET status='failed',error_code=?,updated_at=? WHERE id=?", [errorCode,Date.now(),id]); }
  async findExpiredImages(now: number) { const [rows] = await this.pool.query<RowDataPacket[]>("SELECT image_key FROM recognition_tasks WHERE image_deleted_at IS NULL AND image_expires_at<=?", [now]); return rows.map((value) => String(value.image_key)); }
  async markImageDeleted(imageKey: string, now = Date.now()) { await this.pool.execute("UPDATE recognition_tasks SET image_deleted_at=? WHERE image_key=? AND image_deleted_at IS NULL", [now,imageKey]); }
  async cleanup(now: number) { const [rows] = await this.pool.query<RowDataPacket[]>("SELECT image_key FROM recognition_tasks WHERE expires_at<=?", [now]); await this.pool.execute("DELETE FROM recognition_tasks WHERE expires_at<=?", [now]); return rows.map((value) => String(value.image_key)); }
  async createHomeworkUploadCredential(parentAccountId: string, childProfileId: string, now = Date.now()) { const credential = { uploadToken: randomUUID(), parentAccountId, childProfileId, imageKey: `homework/${childProfileId}/${randomUUID()}`, expiresAt: now + 15 * 60_000, usedAt: null }; await this.pool.execute("INSERT INTO homework_upload_credentials (upload_token,parent_account_id,child_profile_id,image_key,expires_at,used_at) VALUES (?,?,?,?,?,NULL)", [credential.uploadToken,credential.parentAccountId,credential.childProfileId,credential.imageKey,credential.expiresAt]); return credential; }
  async consumeHomeworkUploadCredential(parentAccountId: string, uploadToken: string, objectKey: string, now = Date.now()) { const [rows] = await this.pool.query<RowDataPacket[]>("SELECT * FROM homework_upload_credentials WHERE upload_token=? AND parent_account_id=?", [uploadToken,parentAccountId]); const credential = rows[0] ? uploadRow(rows[0]) : undefined; if (!credential || credential.usedAt !== null || credential.expiresAt <= now || objectKey !== credential.imageKey) throw new Error("Homework upload credential is not valid."); const [result] = await this.pool.execute("UPDATE homework_upload_credentials SET used_at=? WHERE upload_token=? AND used_at IS NULL", [now,uploadToken]); if ((result as { affectedRows: number }).affectedRows !== 1) throw new Error("Homework upload credential is already used."); return { ...credential, usedAt: now }; }
}
function row(v: RowDataPacket): RecognitionTask { return { id:String(v.id),parentAccountId:String(v.parent_account_id),childProfileId:String(v.child_profile_id),draftId:v.draft_id as string|null,kind:v.kind as RecognitionTaskKind,imageKey:String(v.image_key),status:v.status as RecognitionTaskStatus,attempts:Number(v.attempts),result:v.result_json ? JSON.parse(String(v.result_json)) : null,errorCode:v.error_code as string|null,idempotencyKey:String(v.idempotency_key),createdAt:Number(v.created_at),updatedAt:Number(v.updated_at),imageExpiresAt:Number(v.image_expires_at),imageDeletedAt:v.image_deleted_at === null ? null : Number(v.image_deleted_at),expiresAt:Number(v.expires_at) }; }
function uploadRow(v: RowDataPacket): HomeworkUploadCredential { return { uploadToken:String(v.upload_token),parentAccountId:String(v.parent_account_id),childProfileId:String(v.child_profile_id),imageKey:String(v.image_key),expiresAt:Number(v.expires_at),usedAt:v.used_at === null ? null : Number(v.used_at) }; }
