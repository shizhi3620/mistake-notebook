import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type {
  ChildProfile,
  ConfirmedQuestion,
  CorrectPracticeEvidence,
  FeedbackRecord,
  HomeworkReview,
  AsyncLearningLoopStore,
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
export class MysqlLearningLoopStore implements AsyncLearningLoopStore {
  constructor(private readonly pool: Pool) {}

  private async one<T extends RowDataPacket>(sql: string, params: unknown[]): Promise<T | undefined> {
    const [rows] = await this.pool.query<T[]>(sql, params);
    return rows[0];
  }
  private json<T>(value: unknown): T { return typeof value === "string" ? JSON.parse(value) as T : value as T; }
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
  async findWeChatSubject(parentAccountId: string): Promise<string | undefined> { const row = await this.one<RowDataPacket & { wechat_subject: string }>("SELECT wechat_subject FROM wechat_identities WHERE parent_account_id=?", [parentAccountId]); return row?.wechat_subject; }
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
  async findQuestionDraft(parentAccountId: string, id: string): Promise<QuestionDraft | undefined> { const row = await this.one<RowDataPacket & Record<string, unknown>>("SELECT * FROM question_drafts WHERE id=? AND parent_account_id=?", [id,parentAccountId]); return row && { id: String(row.id), parentAccountId: String(row.parent_account_id), childProfileId: String(row.child_profile_id), source: row.source as QuestionDraft["source"], imageKey: row.image_key as string | null, crop: row.crop_json == null ? null : this.json<QuestionDraft["crop"]>(row.crop_json), rotationDegrees: Number(row.rotation_degrees), recognition: row.recognition_json == null ? null : this.json<QuestionDraft["recognition"]>(row.recognition_json) }; }
  async saveQuestionDraft(draft: QuestionDraft): Promise<void> { await this.pool.execute("UPDATE question_drafts SET image_key=?,crop_json=?,rotation_degrees=?,recognition_json=? WHERE id=? AND parent_account_id=?", [draft.imageKey,JSON.stringify(draft.crop),draft.rotationDegrees,JSON.stringify(draft.recognition),draft.id,draft.parentAccountId]); }
  async deleteQuestionDraft(parentAccountId: string, id: string): Promise<void> { await this.pool.execute("DELETE FROM question_drafts WHERE id=? AND parent_account_id=?", [id,parentAccountId]); }
  async createUploadCredential(value: PhotoUploadCredential): Promise<void> { await this.pool.execute("INSERT INTO upload_credentials (upload_token,parent_account_id,draft_id,image_key,expires_at,used_at) VALUES (?,?,?,?,?,?)", [value.uploadToken,value.parentAccountId,value.draftId,value.imageKey,value.expiresAt,value.usedAt]); }
  async findUploadCredential(token: string): Promise<PhotoUploadCredential | undefined> { const row = await this.one<RowDataPacket & Record<string, unknown>>("SELECT * FROM upload_credentials WHERE upload_token=?", [token]); return row && { uploadToken: String(row.upload_token), parentAccountId: String(row.parent_account_id), draftId: String(row.draft_id), imageKey: String(row.image_key), expiresAt: Number(row.expires_at), usedAt: row.used_at == null ? null : Number(row.used_at) }; }
  async saveUploadCredential(value: PhotoUploadCredential): Promise<void> { await this.pool.execute("UPDATE upload_credentials SET used_at=? WHERE upload_token=? AND parent_account_id=?", [value.usedAt,value.uploadToken,value.parentAccountId]); }

  async createQuestion(value: ConfirmedQuestion): Promise<void> { await this.pool.execute("INSERT INTO questions (id,parent_account_id,child_profile_id,source,stem,formulas_json,image_key,crop_json,rotation_degrees,region_json,student_answer,answer_analysis_skipped,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [value.id,value.parentAccountId,value.childProfileId,value.source,value.stem,JSON.stringify(value.formulas),value.imageKey,JSON.stringify(value.crop),value.rotationDegrees,JSON.stringify(value.region),value.studentAnswer,value.answerAnalysisSkipped,value.status,value.createdAt]); }
  async findQuestion(parentAccountId: string, id: string): Promise<ConfirmedQuestion | undefined> { const row = await this.one<RowDataPacket & Record<string, unknown>>("SELECT * FROM questions WHERE id=? AND parent_account_id=?", [id,parentAccountId]); return row && this.question(row); }
  async saveQuestion(value: ConfirmedQuestion): Promise<void> { await this.pool.execute("UPDATE questions SET stem=?,formulas_json=?,image_key=?,crop_json=?,rotation_degrees=?,region_json=?,student_answer=?,answer_analysis_skipped=?,status=? WHERE id=? AND parent_account_id=?", [value.stem,JSON.stringify(value.formulas),value.imageKey,JSON.stringify(value.crop),value.rotationDegrees,JSON.stringify(value.region),value.studentAnswer,value.answerAnalysisSkipped,value.status,value.id,value.parentAccountId]); }
  async countQuestionsSince(parentAccountId: string, since: number): Promise<number> { const row = await this.one<RowDataPacket & { count: number }>("SELECT COUNT(*) count FROM questions WHERE parent_account_id=? AND created_at>=?", [parentAccountId,since]); return Number(row?.count ?? 0); }
  private question(row: RowDataPacket & Record<string, unknown>): ConfirmedQuestion { return { id:String(row.id),parentAccountId:String(row.parent_account_id),childProfileId:String(row.child_profile_id),source:row.source as ConfirmedQuestion["source"],stem:String(row.stem),formulas:this.json<string[]>(row.formulas_json),imageKey:row.image_key as string|null,crop:row.crop_json == null ? null : this.json<ConfirmedQuestion["crop"]>(row.crop_json),rotationDegrees:Number(row.rotation_degrees),region:row.region_json == null ? null : this.json<ConfirmedQuestion["region"]>(row.region_json),studentAnswer:row.student_answer as string|null,answerAnalysisSkipped:Boolean(row.answer_analysis_skipped),status:row.status as ConfirmedQuestion["status"],createdAt:Number(row.created_at) }; }

  async countVariantReviewsSince(parentAccountId: string, since: number): Promise<number> { const row = await this.one<RowDataPacket & { count: number }>("SELECT COUNT(*) count FROM reviews WHERE parent_account_id=? AND exercise_kind='variant' AND started_at>=?", [parentAccountId,since]); return Number(row?.count ?? 0); }
  async createMistake(value: MistakeRecord): Promise<void> { await this.pool.execute("INSERT INTO mistakes (id,parent_account_id,child_profile_id,question_id,primary_knowledge_point,secondary_knowledge_points_json,mistake_cause,mastery_status,created_at) VALUES (?,?,?,?,?,?,?,?,?)", [value.id,value.parentAccountId,value.childProfileId,value.questionId,value.primaryKnowledgePoint,JSON.stringify(value.secondaryKnowledgePoints),value.mistakeCause,value.masteryStatus,value.createdAt]); }
  async createMistakeWithSchedule(value: MistakeRecord, schedule: ReviewSchedule): Promise<void> {
    const c = await this.pool.getConnection();
    try {
      await c.beginTransaction();
      await c.execute("INSERT INTO mistakes (id,parent_account_id,child_profile_id,question_id,primary_knowledge_point,secondary_knowledge_points_json,mistake_cause,mastery_status,created_at) VALUES (?,?,?,?,?,?,?,?,?)", [value.id,value.parentAccountId,value.childProfileId,value.questionId,value.primaryKnowledgePoint,JSON.stringify(value.secondaryKnowledgePoints),value.mistakeCause,value.masteryStatus,value.createdAt]);
      await c.execute("INSERT INTO review_schedules (mistake_id,parent_account_id,child_profile_id,interval_index,next_review_at,mastery_score,review_count) VALUES (?,?,?,?,?,?,?)", [schedule.mistakeId,schedule.parentAccountId,schedule.childProfileId,schedule.intervalIndex,schedule.nextReviewAt,schedule.masteryScore,schedule.reviewCount]);
      await c.commit();
    } catch (error) { await c.rollback(); throw error; } finally { c.release(); }
  }
  async findMistake(parentAccountId: string, id: string): Promise<MistakeRecord | undefined> { const row = await this.one<RowDataPacket & Record<string, unknown>>("SELECT * FROM mistakes WHERE id=? AND parent_account_id=?", [id,parentAccountId]); return row && this.mistake(row); }
  async findMistakeByQuestion(parentAccountId: string, questionId: string): Promise<MistakeRecord | undefined> { const row = await this.one<RowDataPacket & Record<string, unknown>>("SELECT * FROM mistakes WHERE question_id=? AND parent_account_id=?", [questionId,parentAccountId]); return row && this.mistake(row); }
  async saveMistake(value: MistakeRecord): Promise<void> { await this.pool.execute("UPDATE mistakes SET primary_knowledge_point=?,secondary_knowledge_points_json=?,mistake_cause=?,mastery_status=? WHERE id=? AND parent_account_id=?", [value.primaryKnowledgePoint,JSON.stringify(value.secondaryKnowledgePoints),value.mistakeCause,value.masteryStatus,value.id,value.parentAccountId]); }
  async listMistakes(parentAccountId: string, childProfileId: string): Promise<MistakeRecord[]> { const [rows] = await this.pool.query<(RowDataPacket & Record<string, unknown>)[]>("SELECT * FROM mistakes WHERE parent_account_id=? AND child_profile_id=? ORDER BY created_at", [parentAccountId,childProfileId]); return rows.map((row) => this.mistake(row)); }
  private mistake(row: RowDataPacket & Record<string, unknown>): MistakeRecord { return { id:String(row.id),parentAccountId:String(row.parent_account_id),childProfileId:String(row.child_profile_id),questionId:String(row.question_id),primaryKnowledgePoint:String(row.primary_knowledge_point),secondaryKnowledgePoints:this.json<string[]>(row.secondary_knowledge_points_json),mistakeCause:row.mistake_cause as string|null,masteryStatus:row.mastery_status as MistakeRecord["masteryStatus"],createdAt:Number(row.created_at) }; }
  async deleteMistake(parentAccountId: string, id: string): Promise<void> { const c=await this.pool.getConnection(); try { await c.beginTransaction(); await c.execute("DELETE FROM reviews WHERE mistake_id=? AND parent_account_id=?",[id,parentAccountId]); await c.execute("DELETE FROM review_schedules WHERE mistake_id=? AND parent_account_id=?",[id,parentAccountId]); await c.execute("DELETE FROM mistakes WHERE id=? AND parent_account_id=?",[id,parentAccountId]); await c.commit(); } catch (e) { await c.rollback(); throw e; } finally { c.release(); } }
  async deleteQuestion(parentAccountId: string, id: string): Promise<void> { await this.pool.execute("DELETE FROM questions WHERE id=? AND parent_account_id=?", [id,parentAccountId]); }
  async deleteChildProfile(parentAccountId: string, childProfileId: string): Promise<void> {
    const c = await this.pool.getConnection();
    try {
      await c.beginTransaction();
      for (const table of [
        "correct_practice_evidence", "homework_reviews", "reminder_dispatches",
        "reminder_settings", "reviews", "review_schedules", "mistakes",
        "questions", "question_drafts",
      ]) {
        await c.execute(`DELETE FROM ${table} WHERE parent_account_id=? AND child_profile_id=?`, [parentAccountId, childProfileId]);
      }
      await c.execute("DELETE FROM upload_credentials WHERE parent_account_id=? AND draft_id NOT IN (SELECT id FROM question_drafts)", [parentAccountId]);
      await c.execute("UPDATE parent_accounts SET selected_child_profile_id=NULL WHERE id=? AND selected_child_profile_id=?", [parentAccountId, childProfileId]);
      await c.execute("DELETE FROM child_profiles WHERE id=? AND parent_account_id=?", [childProfileId, parentAccountId]);
      await c.commit();
    } catch (e) { await c.rollback(); throw e; } finally { c.release(); }
  }
  async createReviewSchedule(value: ReviewSchedule): Promise<void> { await this.pool.execute("INSERT INTO review_schedules (mistake_id,parent_account_id,child_profile_id,interval_index,next_review_at,mastery_score,review_count) VALUES (?,?,?,?,?,?,?)", [value.mistakeId,value.parentAccountId,value.childProfileId,value.intervalIndex,value.nextReviewAt,value.masteryScore,value.reviewCount]); }
  async findReviewSchedule(parentAccountId: string, mistakeId: string): Promise<ReviewSchedule | undefined> { const row=await this.one<RowDataPacket & Record<string, unknown>>("SELECT * FROM review_schedules WHERE mistake_id=? AND parent_account_id=?",[mistakeId,parentAccountId]); return row&&this.schedule(row); }
  async saveReviewSchedule(value: ReviewSchedule): Promise<void> { await this.pool.execute("UPDATE review_schedules SET interval_index=?,next_review_at=?,mastery_score=?,review_count=? WHERE mistake_id=? AND parent_account_id=?",[value.intervalIndex,value.nextReviewAt,value.masteryScore,value.reviewCount,value.mistakeId,value.parentAccountId]); }
  async listDueReviewSchedules(parentAccountId:string, childProfileId:string, asOf:number):Promise<ReviewSchedule[]> { const [rows]=await this.pool.query<(RowDataPacket & Record<string, unknown>)[]>("SELECT * FROM review_schedules WHERE parent_account_id=? AND child_profile_id=? AND next_review_at<=? ORDER BY next_review_at",[parentAccountId,childProfileId,asOf]); return rows.map((r)=>this.schedule(r)); }
  private schedule(r: RowDataPacket & Record<string, unknown>): ReviewSchedule { return { mistakeId:String(r.mistake_id),parentAccountId:String(r.parent_account_id),childProfileId:String(r.child_profile_id),intervalIndex:Number(r.interval_index),nextReviewAt:Number(r.next_review_at),masteryScore:Number(r.mastery_score),reviewCount:Number(r.review_count) }; }
  async createReview(value: Review):Promise<void>{await this.pool.execute("INSERT INTO reviews (id,parent_account_id,mistake_id,exercise_kind,started_at,completed_at,self_assessment,variant_correct,result_interval_index,result_next_review_at,result_mastery_score) VALUES (?,?,?,?,?,?,?,?,?,?,?)",[value.id,value.parentAccountId,value.mistakeId,value.exerciseKind,value.startedAt,value.completedAt,value.selfAssessment,value.variantCorrect,value.resultIntervalIndex,value.resultNextReviewAt,value.resultMasteryScore]);}
  async findReview(parentAccountId:string,id:string):Promise<Review|undefined>{const r=await this.one<RowDataPacket & Record<string,unknown>>("SELECT * FROM reviews WHERE id=? AND parent_account_id=?",[id,parentAccountId]);return r&&this.review(r);}
  async saveReview(v:Review):Promise<void>{await this.pool.execute("UPDATE reviews SET completed_at=?,self_assessment=?,variant_correct=?,result_interval_index=?,result_next_review_at=?,result_mastery_score=? WHERE id=? AND parent_account_id=? AND (completed_at IS NULL OR ? IS NULL)",[v.completedAt,v.selfAssessment,v.variantCorrect,v.resultIntervalIndex,v.resultNextReviewAt,v.resultMasteryScore,v.id,v.parentAccountId,v.completedAt]);}
  async completeReviewAtomic(schedule: ReviewSchedule, mistake: MistakeRecord, review: Review): Promise<void> {
    const c = await this.pool.getConnection();
    try {
      await c.beginTransaction();
      await c.execute("UPDATE review_schedules SET interval_index=?,next_review_at=?,mastery_score=?,review_count=? WHERE mistake_id=? AND parent_account_id=?", [schedule.intervalIndex,schedule.nextReviewAt,schedule.masteryScore,schedule.reviewCount,schedule.mistakeId,schedule.parentAccountId]);
      await c.execute("UPDATE mistakes SET mastery_status=? WHERE id=? AND parent_account_id=?", [mistake.masteryStatus,mistake.id,mistake.parentAccountId]);
      await c.execute("UPDATE reviews SET completed_at=?,self_assessment=?,variant_correct=?,result_interval_index=?,result_next_review_at=?,result_mastery_score=? WHERE id=? AND parent_account_id=?", [review.completedAt,review.selfAssessment,review.variantCorrect,review.resultIntervalIndex,review.resultNextReviewAt,review.resultMasteryScore,review.id,review.parentAccountId]);
      await c.commit();
    } catch (error) { await c.rollback(); throw error; } finally { c.release(); }
  }
  async listCompletedReviewsSince(parentAccountId:string,childProfileId:string,since:number):Promise<Review[]>{const [rows]=await this.pool.query<(RowDataPacket & Record<string,unknown>)[]>("SELECT r.* FROM reviews r JOIN mistakes m ON m.id=r.mistake_id WHERE r.parent_account_id=? AND m.child_profile_id=? AND r.completed_at IS NOT NULL AND r.completed_at>=? ORDER BY r.completed_at",[parentAccountId,childProfileId,since]);return rows.map((r)=>this.review(r));}
  private review(r:RowDataPacket & Record<string,unknown>):Review{return{id:String(r.id),parentAccountId:String(r.parent_account_id),mistakeId:String(r.mistake_id),exerciseKind:r.exercise_kind as Review["exerciseKind"],startedAt:Number(r.started_at),completedAt:r.completed_at==null?null:Number(r.completed_at),selfAssessment:r.self_assessment as Review["selfAssessment"],variantCorrect:r.variant_correct==null?null:Boolean(r.variant_correct),resultIntervalIndex:r.result_interval_index==null?null:Number(r.result_interval_index),resultNextReviewAt:r.result_next_review_at==null?null:Number(r.result_next_review_at),resultMasteryScore:r.result_mastery_score==null?null:Number(r.result_mastery_score)};}
  async saveReminderSettings(v:ReminderSettings):Promise<void>{await this.pool.execute("INSERT INTO reminder_settings (parent_account_id,child_profile_id,enabled,hour_of_day) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),hour_of_day=VALUES(hour_of_day)",[v.parentAccountId,v.childProfileId,v.enabled,v.hourOfDay]);}
  async findReminderSettings(parentAccountId:string,childProfileId:string):Promise<ReminderSettings|undefined>{const r=await this.one<RowDataPacket & Record<string,unknown>>("SELECT * FROM reminder_settings WHERE parent_account_id=? AND child_profile_id=?",[parentAccountId,childProfileId]);return r&&{parentAccountId:String(r.parent_account_id),childProfileId:String(r.child_profile_id),enabled:Boolean(r.enabled),hourOfDay:Number(r.hour_of_day)};}
  async listEnabledReminderSettings():Promise<ReminderSettings[]>{const [rows]=await this.pool.query<(RowDataPacket & Record<string,unknown>)[]>("SELECT * FROM reminder_settings WHERE enabled=1",[]);return rows.map((r)=>({parentAccountId:String(r.parent_account_id),childProfileId:String(r.child_profile_id),enabled:true,hourOfDay:Number(r.hour_of_day)}));}
  async createReminderDispatch(v:ReminderDispatch):Promise<void>{await this.pool.execute("INSERT INTO reminder_dispatches (id,parent_account_id,child_profile_id,date_key,sent_at,status) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=id",[v.id,v.parentAccountId,v.childProfileId,v.dateKey,v.sentAt,v.status]);}
  async findReminderDispatch(parentAccountId:string,childProfileId:string,dateKey:string):Promise<ReminderDispatch|undefined>{const r=await this.one<RowDataPacket & Record<string,unknown>>("SELECT * FROM reminder_dispatches WHERE parent_account_id=? AND child_profile_id=? AND date_key=?",[parentAccountId,childProfileId,dateKey]);return r&&{id:String(r.id),parentAccountId:String(r.parent_account_id),childProfileId:String(r.child_profile_id),dateKey:String(r.date_key),sentAt:Number(r.sent_at),status:r.status as ReminderDispatch["status"]};}
  async createHomeworkReview(v:HomeworkReview):Promise<void>{await this.pool.execute("INSERT INTO homework_reviews (id,parent_account_id,child_profile_id,image_key,created_at,candidates_json) VALUES (?,?,?,?,?,?)",[v.id,v.parentAccountId,v.childProfileId,v.imageKey,v.createdAt,JSON.stringify(v.candidates)]);}
  async findHomeworkReview(parentAccountId:string,id:string):Promise<HomeworkReview|undefined>{const r=await this.one<RowDataPacket & Record<string,unknown>>("SELECT * FROM homework_reviews WHERE id=? AND parent_account_id=?",[id,parentAccountId]);return r&&{id:String(r.id),parentAccountId:String(r.parent_account_id),childProfileId:String(r.child_profile_id),imageKey:r.image_key as string|null,createdAt:Number(r.created_at),candidates:r.candidates_json==null||String(r.candidates_json).trim()===""?[]:this.json<HomeworkReview["candidates"]>(r.candidates_json)};}
  async saveHomeworkReview(v:HomeworkReview):Promise<void>{await this.pool.execute("UPDATE homework_reviews SET image_key=?,candidates_json=? WHERE id=? AND parent_account_id=?",[v.imageKey,JSON.stringify(v.candidates),v.id,v.parentAccountId]);}
  async createCorrectPracticeEvidence(v:CorrectPracticeEvidence):Promise<void>{await this.pool.execute("INSERT INTO correct_practice_evidence (id,parent_account_id,child_profile_id,homework_review_id,knowledge_point,created_at) VALUES (?,?,?,?,?,?)",[v.id,v.parentAccountId,v.childProfileId,v.homeworkReviewId,v.knowledgePoint,v.createdAt]);}
  async listCorrectPracticeEvidence(parentAccountId:string,childProfileId:string):Promise<CorrectPracticeEvidence[]>{const [rows]=await this.pool.query<(RowDataPacket & Record<string,unknown>)[]>("SELECT * FROM correct_practice_evidence WHERE parent_account_id=? AND child_profile_id=? ORDER BY created_at",[parentAccountId,childProfileId]);return rows.map((r)=>({id:String(r.id),parentAccountId:String(r.parent_account_id),childProfileId:String(r.child_profile_id),homeworkReviewId:String(r.homework_review_id),knowledgePoint:r.knowledge_point as string|null,createdAt:Number(r.created_at)}));}
  async createFeedback(v: FeedbackRecord): Promise<void> { await this.pool.execute("INSERT INTO feedback (id,parent_account_id,child_profile_id,question_id,type,payload_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)", [v.id,v.parentAccountId,v.childProfileId,v.questionId,v.type,JSON.stringify(v),v.createdAt,v.updatedAt]); }
  async findFeedback(parentAccountId: string, id: string): Promise<FeedbackRecord | undefined> { const row = await this.one<RowDataPacket & { payload_json: string }>("SELECT payload_json FROM feedback WHERE id=? AND parent_account_id=?", [id,parentAccountId]); return row ? JSON.parse(row.payload_json) as FeedbackRecord : undefined; }
  async listFeedback(parentAccountId: string): Promise<FeedbackRecord[]> { const [rows] = await this.pool.query<(RowDataPacket & { payload_json: string })[]>("SELECT payload_json FROM feedback WHERE parent_account_id=? ORDER BY created_at", [parentAccountId]); return rows.map((row) => JSON.parse(row.payload_json) as FeedbackRecord); }
  async listAllFeedback(): Promise<FeedbackRecord[]> { const [rows] = await this.pool.query<(RowDataPacket & { payload_json: string })[]>("SELECT payload_json FROM feedback ORDER BY created_at", []); return rows.map((row) => JSON.parse(row.payload_json) as FeedbackRecord); }
  async findFeedbackById(id: string): Promise<FeedbackRecord | undefined> { const row = await this.one<RowDataPacket & { payload_json: string }>("SELECT payload_json FROM feedback WHERE id=?", [id]); return row ? JSON.parse(row.payload_json) as FeedbackRecord : undefined; }
  async saveFeedback(v: FeedbackRecord): Promise<void> { await this.pool.execute("UPDATE feedback SET payload_json=?,updated_at=? WHERE id=? AND parent_account_id=?", [JSON.stringify(v),v.updatedAt,v.id,v.parentAccountId]); }

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
