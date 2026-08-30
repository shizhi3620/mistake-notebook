import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type {
  ChildProfile,
  ConfirmedQuestion,
  CorrectPracticeEvidence,
  HomeworkReview,
  LearningLoopStore,
  LoginSession,
  MistakeRecord,
  ParentAccount,
  PhotoUploadCredential,
  QuestionDraft,
  ReminderDispatch,
  ReminderSettings,
  Review,
  ReviewSchedule,
} from "../learning-loop.ts";

type AccountRow = RowDataPacket & {
  id: string;
  guardianship_confirmed: number;
  allow_direct_answer_reveal: number;
  plan: ParentAccount["plan"];
};
type ChildRow = RowDataPacket & {
  id: string; parent_account_id: string; nickname: string; grade: number;
  region: string; province_code: string | null; province_name: string | null;
  city_code: string | null; city_name: string | null; textbook_version: string | null;
};

/** Promise-based MySQL implementation. The domain can adopt this seam without exposing SQL. */
export class MysqlLearningLoopStore {
  constructor(private readonly pool: Pool) {}

  private async one<T extends RowDataPacket>(sql: string, params: unknown[]): Promise<T | undefined> {
    const [rows] = await this.pool.query<T[]>(sql, params);
    return rows[0];
  }
  private account(row: AccountRow): ParentAccount {
    return { id: row.id, guardianshipConfirmed: Boolean(row.guardianship_confirmed), allowDirectAnswerReveal: Boolean(row.allow_direct_answer_reveal), plan: row.plan };
  }
  private child(row: ChildRow): ChildProfile {
    const location = row.province_code || row.province_name ? { provinceCode: row.province_code ?? "", provinceName: row.province_name ?? "", ...(row.city_code ? { cityCode: row.city_code } : {}), ...(row.city_name ? { cityName: row.city_name } : {}) } : undefined;
    return { id: row.id, parentAccountId: row.parent_account_id, nickname: row.nickname, grade: row.grade, region: row.region, ...(location ? { location } : {}), ...(row.textbook_version ? { textbookVersion: row.textbook_version } : {}) };
  }

  async createParentAccount(account: ParentAccount): Promise<void> { await this.pool.execute("INSERT INTO parent_accounts (id, guardianship_confirmed, allow_direct_answer_reveal, plan) VALUES (?, ?, ?, ?)", [account.id, account.guardianshipConfirmed, account.allowDirectAnswerReveal, account.plan]); }
  async findParentAccount(id: string): Promise<ParentAccount | undefined> { const row = await this.one<AccountRow>("SELECT id, guardianship_confirmed, allow_direct_answer_reveal, plan FROM parent_accounts WHERE id = ?", [id]); return row && this.account(row); }
  async findParentAccountByWeChatSubject(subject: string): Promise<ParentAccount | undefined> { const row = await this.one<AccountRow>("SELECT p.id, p.guardianship_confirmed, p.allow_direct_answer_reveal, p.plan FROM parent_accounts p JOIN wechat_identities w ON w.parent_account_id=p.id WHERE w.wechat_subject=?", [subject]); return row && this.account(row); }
  async saveWeChatSubject(parentAccountId: string, subject: string): Promise<void> { await this.pool.execute("INSERT INTO wechat_identities (wechat_subject, parent_account_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE parent_account_id=VALUES(parent_account_id)", [subject, parentAccountId]); }
  async saveParentAccount(account: ParentAccount): Promise<void> { await this.pool.execute("UPDATE parent_accounts SET guardianship_confirmed=?, allow_direct_answer_reveal=?, plan=? WHERE id=?", [account.guardianshipConfirmed, account.allowDirectAnswerReveal, account.plan, account.id]); }
  async createSession(session: LoginSession): Promise<void> { await this.pool.execute("INSERT INTO sessions (token, parent_account_id, expires_at) VALUES (?, ?, ?)", [session.token, session.parentAccountId, session.expiresAt]); }
  async findSession(token: string): Promise<LoginSession | undefined> { const row = await this.one<RowDataPacket & { token: string; parent_account_id: string; expires_at: number }>("SELECT token,parent_account_id,expires_at FROM sessions WHERE token=? AND expires_at>?", [token, Date.now()]); return row && { token: row.token, parentAccountId: row.parent_account_id, expiresAt: row.expires_at }; }
  async createChildProfile(profile: ChildProfile): Promise<void> { await this.pool.execute("INSERT INTO child_profiles (id,parent_account_id,nickname,grade,region,province_code,province_name,city_code,city_name,textbook_version) VALUES (?,?,?,?,?,?,?,?,?,?)", [profile.id, profile.parentAccountId, profile.nickname, profile.grade, profile.region ?? profile.location?.provinceName ?? "", profile.location?.provinceCode ?? null, profile.location?.provinceName ?? null, profile.location?.cityCode ?? null, profile.location?.cityName ?? null, profile.textbookVersion ?? null]); }
  async listChildProfiles(parentAccountId: string): Promise<ChildProfile[]> { const [rows] = await this.pool.query<ChildRow[]>("SELECT id,parent_account_id,nickname,grade,region,province_code,province_name,city_code,city_name,textbook_version FROM child_profiles WHERE parent_account_id=?", [parentAccountId]); return rows.map((row) => this.child(row)); }
  async findChildProfile(parentAccountId: string, childProfileId: string): Promise<ChildProfile | undefined> { const row = await this.one<ChildRow>("SELECT id,parent_account_id,nickname,grade,region,province_code,province_name,city_code,city_name,textbook_version FROM child_profiles WHERE id=? AND parent_account_id=?", [childProfileId, parentAccountId]); return row && this.child(row); }
  async saveChildProfile(profile: ChildProfile): Promise<void> { await this.pool.execute("UPDATE child_profiles SET nickname=?,grade=?,region=?,province_code=?,province_name=?,city_code=?,city_name=?,textbook_version=? WHERE id=? AND parent_account_id=?", [profile.nickname, profile.grade, profile.region ?? profile.location?.provinceName ?? "", profile.location?.provinceCode ?? null, profile.location?.provinceName ?? null, profile.location?.cityCode ?? null, profile.location?.cityName ?? null, profile.textbookVersion ?? null, profile.id, profile.parentAccountId]); }
  async findSelectedChildProfile(parentAccountId: string): Promise<ChildProfile | undefined> { const row = await this.one<ChildRow>("SELECT c.id,c.parent_account_id,c.nickname,c.grade,c.region,c.province_code,c.province_name,c.city_code,c.city_name,c.textbook_version FROM parent_accounts p JOIN child_profiles c ON c.id=p.selected_child_profile_id WHERE p.id=?", [parentAccountId]); return row && this.child(row); }
  async selectChildProfile(parentAccountId: string, childProfileId: string): Promise<void> { await this.pool.execute("UPDATE parent_accounts SET selected_child_profile_id=? WHERE id=? AND EXISTS (SELECT 1 FROM child_profiles WHERE id=? AND parent_account_id=?)", [childProfileId, parentAccountId, childProfileId, parentAccountId]); }

  async deleteParentAccount(parentAccountId: string): Promise<void> { const connection = await this.pool.getConnection(); try { await connection.beginTransaction(); await connection.execute("DELETE FROM parent_accounts WHERE id=?", [parentAccountId]); await connection.commit(); } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); } }

  async createQuestionDraft(draft: QuestionDraft): Promise<void> { await this.pool.execute("INSERT INTO question_drafts (id,parent_account_id,child_profile_id,source,image_key,crop_json,rotation_degrees,recognition_json) VALUES (?,?,?,?,?,?,?,?)", [draft.id,draft.parentAccountId,draft.childProfileId,draft.source,draft.imageKey,JSON.stringify(draft.crop),draft.rotationDegrees,JSON.stringify(draft.recognition)]); }
  async findQuestionDraft(parentAccountId: string, id: string): Promise<QuestionDraft | undefined> { const row = await this.one<RowDataPacket & Record<string, unknown>>("SELECT * FROM question_drafts WHERE id=? AND parent_account_id=?", [id,parentAccountId]); return row && { id: String(row.id), parentAccountId: String(row.parent_account_id), childProfileId: String(row.child_profile_id), source: row.source as QuestionDraft["source"], imageKey: row.image_key as string | null, crop: row.crop_json as QuestionDraft["crop"], rotationDegrees: Number(row.rotation_degrees), recognition: row.recognition_json as QuestionDraft["recognition"] }; }
  async saveQuestionDraft(draft: QuestionDraft): Promise<void> { await this.pool.execute("UPDATE question_drafts SET image_key=?,crop_json=?,rotation_degrees=?,recognition_json=? WHERE id=? AND parent_account_id=?", [draft.imageKey,JSON.stringify(draft.crop),draft.rotationDegrees,JSON.stringify(draft.recognition),draft.id,draft.parentAccountId]); }
  async deleteQuestionDraft(parentAccountId: string, id: string): Promise<void> { await this.pool.execute("DELETE FROM question_drafts WHERE id=? AND parent_account_id=?", [id,parentAccountId]); }
  async createUploadCredential(value: PhotoUploadCredential): Promise<void> { await this.pool.execute("INSERT INTO upload_credentials (upload_token,parent_account_id,draft_id,image_key,expires_at,used_at) VALUES (?,?,?,?,?,?)", [value.uploadToken,value.parentAccountId,value.draftId,value.imageKey,value.expiresAt,value.usedAt]); }
  async findUploadCredential(token: string): Promise<PhotoUploadCredential | undefined> { const row = await this.one<RowDataPacket & Record<string, unknown>>("SELECT * FROM upload_credentials WHERE upload_token=?", [token]); return row && { uploadToken: String(row.upload_token), parentAccountId: String(row.parent_account_id), draftId: String(row.draft_id), imageKey: String(row.image_key), expiresAt: Number(row.expires_at), usedAt: row.used_at == null ? null : Number(row.used_at) }; }
  async saveUploadCredential(value: PhotoUploadCredential): Promise<void> { await this.pool.execute("UPDATE upload_credentials SET used_at=? WHERE upload_token=? AND parent_account_id=?", [value.usedAt,value.uploadToken,value.parentAccountId]); }

  async createQuestion(value: ConfirmedQuestion): Promise<void> { await this.pool.execute("INSERT INTO questions (id,parent_account_id,child_profile_id,source,stem,formulas_json,image_key,crop_json,rotation_degrees,region_json,student_answer,answer_analysis_skipped,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [value.id,value.parentAccountId,value.childProfileId,value.source,value.stem,JSON.stringify(value.formulas),value.imageKey,JSON.stringify(value.crop),value.rotationDegrees,JSON.stringify(value.region),value.studentAnswer,value.answerAnalysisSkipped,value.status,value.createdAt]); }
  async findQuestion(parentAccountId: string, id: string): Promise<ConfirmedQuestion | undefined> { const row = await this.one<RowDataPacket & Record<string, unknown>>("SELECT * FROM questions WHERE id=? AND parent_account_id=?", [id,parentAccountId]); return row && this.question(row); }
  async saveQuestion(value: ConfirmedQuestion): Promise<void> { await this.pool.execute("UPDATE questions SET stem=?,formulas_json=?,image_key=?,crop_json=?,rotation_degrees=?,region_json=?,student_answer=?,answer_analysis_skipped=?,status=? WHERE id=? AND parent_account_id=?", [value.stem,JSON.stringify(value.formulas),value.imageKey,JSON.stringify(value.crop),value.rotationDegrees,JSON.stringify(value.region),value.studentAnswer,value.answerAnalysisSkipped,value.status,value.id,value.parentAccountId]); }
  async countQuestionsSince(parentAccountId: string, since: number): Promise<number> { const row = await this.one<RowDataPacket & { count: number }>("SELECT COUNT(*) count FROM questions WHERE parent_account_id=? AND created_at>=?", [parentAccountId,since]); return Number(row?.count ?? 0); }
  private question(row: RowDataPacket & Record<string, unknown>): ConfirmedQuestion { return { id:String(row.id),parentAccountId:String(row.parent_account_id),childProfileId:String(row.child_profile_id),source:row.source as ConfirmedQuestion["source"],stem:String(row.stem),formulas:JSON.parse(String(row.formulas_json)),imageKey:row.image_key as string|null,crop:row.crop_json as ConfirmedQuestion["crop"],rotationDegrees:Number(row.rotation_degrees),region:row.region_json as ConfirmedQuestion["region"],studentAnswer:row.student_answer as string|null,answerAnalysisSkipped:Boolean(row.answer_analysis_skipped),status:row.status as ConfirmedQuestion["status"],createdAt:Number(row.created_at) }; }

  /** Atomically creates the account and its platform identity during first login. */
  async createParentAccountWithWeChatSubject(account: ParentAccount, subject: string): Promise<void> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute("INSERT INTO parent_accounts (id, guardianship_confirmed, allow_direct_answer_reveal, plan) VALUES (?, ?, ?, ?)", [account.id, account.guardianshipConfirmed, account.allowDirectAnswerReveal, account.plan]);
      await connection.execute("INSERT INTO wechat_identities (wechat_subject, parent_account_id) VALUES (?, ?)", [subject, account.id]);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

export type MysqlStoreConnection = Pool | PoolConnection;
