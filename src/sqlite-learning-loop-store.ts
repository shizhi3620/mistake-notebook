import Database from "better-sqlite3";

import type {
  ChildProfile,
  ConfirmedQuestion,
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
} from "./learning-loop.ts";

type SessionRow = {
  token: string;
  parent_account_id: string;
  expires_at: number;
};

type ParentAccountRow = {
  id: string;
  guardianship_confirmed: number;
  allow_direct_answer_reveal: number;
  plan: string;
};

type ChildProfileRow = {
  id: string;
  parent_account_id: string;
  nickname: string;
  grade: number;
  region: string;
  textbook_version: string | null;
};

type QuestionDraftRow = {
  id: string;
  parent_account_id: string;
  child_profile_id: string;
  source: string;
  image_key: string | null;
  crop_json: string | null;
  rotation_degrees: number;
  recognition_json: string | null;
};

type UploadCredentialRow = {
  upload_token: string;
  parent_account_id: string;
  draft_id: string;
  image_key: string;
  expires_at: number;
  used_at: number | null;
};

type QuestionRow = {
  id: string;
  parent_account_id: string;
  child_profile_id: string;
  source: string;
  stem: string;
  formulas_json: string;
  image_key: string | null;
  crop_json: string | null;
  rotation_degrees: number;
  region_json: string | null;
  student_answer: string | null;
  answer_analysis_skipped: number;
  status: string;
  created_at: number;
};

type MistakeRow = {
  id: string;
  parent_account_id: string;
  child_profile_id: string;
  question_id: string;
  primary_knowledge_point: string;
  secondary_knowledge_points_json: string;
  mistake_cause: string | null;
  mastery_status: string;
  created_at: number;
};

type ReviewScheduleRow = {
  mistake_id: string;
  parent_account_id: string;
  child_profile_id: string;
  interval_index: number;
  next_review_at: number;
  mastery_score: number;
  review_count: number;
};

type ReviewRow = {
  id: string;
  parent_account_id: string;
  mistake_id: string;
  exercise_kind: string;
  started_at: number;
  completed_at: number | null;
  self_assessment: string | null;
  variant_correct: number | null;
  result_interval_index: number | null;
  result_next_review_at: number | null;
  result_mastery_score: number | null;
};

type ReminderSettingsRow = {
  parent_account_id: string;
  child_profile_id: string;
  enabled: number;
  hour_of_day: number;
};

type ReminderDispatchRow = {
  id: string;
  parent_account_id: string;
  child_profile_id: string;
  date_key: string;
  sent_at: number;
  status: string;
};

export class SqliteLearningLoopStore implements LearningLoopStore {
  private readonly database: any;

  constructor(databasePath: string) {
    this.database = new Database(databasePath);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS parent_accounts (
        id TEXT PRIMARY KEY,
        guardianship_confirmed INTEGER NOT NULL,
        allow_direct_answer_reveal INTEGER NOT NULL DEFAULT 0,
        plan TEXT NOT NULL DEFAULT 'free',
        selected_child_profile_id TEXT
      );
      CREATE TABLE IF NOT EXISTS child_profiles (
        id TEXT PRIMARY KEY,
        parent_account_id TEXT NOT NULL,
        nickname TEXT NOT NULL,
        grade INTEGER NOT NULL,
        region TEXT NOT NULL,
        textbook_version TEXT
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        parent_account_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS question_drafts (
        id TEXT PRIMARY KEY,
        parent_account_id TEXT NOT NULL,
        child_profile_id TEXT NOT NULL,
        source TEXT NOT NULL,
        image_key TEXT,
        crop_json TEXT,
        rotation_degrees INTEGER NOT NULL,
        recognition_json TEXT
      );
      CREATE TABLE IF NOT EXISTS upload_credentials (
        upload_token TEXT PRIMARY KEY,
        parent_account_id TEXT NOT NULL,
        draft_id TEXT NOT NULL,
        image_key TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        used_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS questions (
        id TEXT PRIMARY KEY,
        parent_account_id TEXT NOT NULL,
        child_profile_id TEXT NOT NULL,
        source TEXT NOT NULL,
        stem TEXT NOT NULL,
        formulas_json TEXT NOT NULL,
        image_key TEXT,
        crop_json TEXT,
        rotation_degrees INTEGER NOT NULL,
        region_json TEXT,
        student_answer TEXT,
        answer_analysis_skipped INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS mistakes (
        id TEXT PRIMARY KEY,
        parent_account_id TEXT NOT NULL,
        child_profile_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        primary_knowledge_point TEXT NOT NULL,
        secondary_knowledge_points_json TEXT NOT NULL,
        mistake_cause TEXT,
        mastery_status TEXT NOT NULL DEFAULT 'not-started',
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS review_schedules (
        mistake_id TEXT PRIMARY KEY,
        parent_account_id TEXT NOT NULL,
        child_profile_id TEXT NOT NULL,
        interval_index INTEGER NOT NULL,
        next_review_at INTEGER NOT NULL,
        mastery_score REAL NOT NULL,
        review_count INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS reviews (
        id TEXT PRIMARY KEY,
        parent_account_id TEXT NOT NULL,
        mistake_id TEXT NOT NULL,
        exercise_kind TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        self_assessment TEXT,
        variant_correct INTEGER,
        result_interval_index INTEGER,
        result_next_review_at INTEGER,
        result_mastery_score REAL
      );
      CREATE TABLE IF NOT EXISTS reminder_settings (
        parent_account_id TEXT NOT NULL,
        child_profile_id TEXT NOT NULL,
        enabled INTEGER NOT NULL,
        hour_of_day INTEGER NOT NULL,
        PRIMARY KEY (parent_account_id, child_profile_id)
      );
      CREATE TABLE IF NOT EXISTS reminder_dispatches (
        id TEXT PRIMARY KEY,
        parent_account_id TEXT NOT NULL,
        child_profile_id TEXT NOT NULL,
        date_key TEXT NOT NULL,
        sent_at INTEGER NOT NULL,
        status TEXT NOT NULL
      );
    `);
  }

  saveReminderSettings(settings: ReminderSettings): void {
    this.database
      .prepare(
        `INSERT INTO reminder_settings
          (parent_account_id, child_profile_id, enabled, hour_of_day)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (parent_account_id, child_profile_id)
         DO UPDATE SET enabled = excluded.enabled,
                       hour_of_day = excluded.hour_of_day`,
      )
      .run(
        settings.parentAccountId,
        settings.childProfileId,
        Number(settings.enabled),
        settings.hourOfDay,
      );
  }

  findReminderSettings(
    parentAccountId: string,
    childProfileId: string,
  ): ReminderSettings | undefined {
    const row = this.database
      .prepare(
        `SELECT parent_account_id, child_profile_id, enabled, hour_of_day
           FROM reminder_settings
          WHERE parent_account_id = ? AND child_profile_id = ?`,
      )
      .get(parentAccountId, childProfileId) as
      | ReminderSettingsRow
      | undefined;

    return row ? this.toReminderSettings(row) : undefined;
  }

  listEnabledReminderSettings(): ReminderSettings[] {
    const rows = this.database
      .prepare(
        `SELECT parent_account_id, child_profile_id, enabled, hour_of_day
           FROM reminder_settings
          WHERE enabled = 1`,
      )
      .all() as ReminderSettingsRow[];

    return rows.map((row) => this.toReminderSettings(row));
  }

  createReminderDispatch(dispatch: ReminderDispatch): void {
    this.database
      .prepare(
        `INSERT INTO reminder_dispatches
          (id, parent_account_id, child_profile_id, date_key, sent_at, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        dispatch.id,
        dispatch.parentAccountId,
        dispatch.childProfileId,
        dispatch.dateKey,
        dispatch.sentAt,
        dispatch.status,
      );
  }

  findReminderDispatch(
    parentAccountId: string,
    childProfileId: string,
    dateKey: string,
  ): ReminderDispatch | undefined {
    const row = this.database
      .prepare(
        `SELECT id, parent_account_id, child_profile_id, date_key, sent_at,
                status
           FROM reminder_dispatches
          WHERE parent_account_id = ? AND child_profile_id = ?
            AND date_key = ?`,
      )
      .get(parentAccountId, childProfileId, dateKey) as
      | ReminderDispatchRow
      | undefined;

    return row
      ? {
          id: row.id,
          parentAccountId: row.parent_account_id,
          childProfileId: row.child_profile_id,
          dateKey: row.date_key,
          sentAt: row.sent_at,
          status: row.status as ReminderDispatch["status"],
        }
      : undefined;
  }

  private toReminderSettings(row: ReminderSettingsRow): ReminderSettings {
    return {
      parentAccountId: row.parent_account_id,
      childProfileId: row.child_profile_id,
      enabled: Boolean(row.enabled),
      hourOfDay: row.hour_of_day,
    };
  }

  createReview(review: Review): void {
    this.database
      .prepare(
        `INSERT INTO reviews
          (id, parent_account_id, mistake_id, exercise_kind, started_at,
           completed_at, self_assessment, variant_correct,
           result_interval_index, result_next_review_at, result_mastery_score)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        review.id,
        review.parentAccountId,
        review.mistakeId,
        review.exerciseKind,
        review.startedAt,
        review.completedAt,
        review.selfAssessment,
        review.variantCorrect === null
          ? null
          : Number(review.variantCorrect),
        review.resultIntervalIndex,
        review.resultNextReviewAt,
        review.resultMasteryScore,
      );
  }

  findReview(parentAccountId: string, reviewId: string): Review | undefined {
    const row = this.database
      .prepare(
        `SELECT id, parent_account_id, mistake_id, exercise_kind, started_at,
                completed_at, self_assessment, variant_correct,
                result_interval_index, result_next_review_at,
                result_mastery_score
           FROM reviews
          WHERE id = ? AND parent_account_id = ?`,
      )
      .get(reviewId, parentAccountId) as ReviewRow | undefined;

    return row ? this.toReview(row) : undefined;
  }

  saveReview(review: Review): void {
    this.database
      .prepare(
        `UPDATE reviews
            SET completed_at = ?, self_assessment = ?, variant_correct = ?,
                result_interval_index = ?, result_next_review_at = ?,
                result_mastery_score = ?
          WHERE id = ? AND parent_account_id = ?`,
      )
      .run(
        review.completedAt,
        review.selfAssessment,
        review.variantCorrect === null
          ? null
          : Number(review.variantCorrect),
        review.resultIntervalIndex,
        review.resultNextReviewAt,
        review.resultMasteryScore,
        review.id,
        review.parentAccountId,
      );
  }

  listCompletedReviewsSince(
    parentAccountId: string,
    childProfileId: string,
    sinceMs: number,
  ): Review[] {
    const rows = this.database
      .prepare(
        `SELECT reviews.id, reviews.parent_account_id, reviews.mistake_id,
                reviews.exercise_kind, reviews.started_at,
                reviews.completed_at, reviews.self_assessment,
                reviews.variant_correct, reviews.result_interval_index,
                reviews.result_next_review_at, reviews.result_mastery_score
           FROM reviews
           JOIN mistakes ON mistakes.id = reviews.mistake_id
          WHERE reviews.parent_account_id = ?
            AND mistakes.child_profile_id = ?
            AND reviews.completed_at IS NOT NULL
            AND reviews.completed_at >= ?
          ORDER BY reviews.completed_at`,
      )
      .all(parentAccountId, childProfileId, sinceMs) as ReviewRow[];

    return rows.map((row) => this.toReview(row));
  }

  private toReview(row: ReviewRow): Review {
    return {
      id: row.id,
      parentAccountId: row.parent_account_id,
      mistakeId: row.mistake_id,
      exerciseKind: row.exercise_kind as Review["exerciseKind"],
      startedAt: row.started_at,
      completedAt: row.completed_at,
      selfAssessment: row.self_assessment as Review["selfAssessment"],
      variantCorrect:
        row.variant_correct === null ? null : Boolean(row.variant_correct),
      resultIntervalIndex: row.result_interval_index,
      resultNextReviewAt: row.result_next_review_at,
      resultMasteryScore: row.result_mastery_score,
    };
  }

  createReviewSchedule(schedule: ReviewSchedule): void {
    this.database
      .prepare(
        `INSERT INTO review_schedules
          (mistake_id, parent_account_id, child_profile_id, interval_index,
           next_review_at, mastery_score, review_count)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        schedule.mistakeId,
        schedule.parentAccountId,
        schedule.childProfileId,
        schedule.intervalIndex,
        schedule.nextReviewAt,
        schedule.masteryScore,
        schedule.reviewCount,
      );
  }

  findReviewSchedule(
    parentAccountId: string,
    mistakeId: string,
  ): ReviewSchedule | undefined {
    const row = this.database
      .prepare(
        `SELECT mistake_id, parent_account_id, child_profile_id,
                interval_index, next_review_at, mastery_score, review_count
           FROM review_schedules
          WHERE mistake_id = ? AND parent_account_id = ?`,
      )
      .get(mistakeId, parentAccountId) as ReviewScheduleRow | undefined;

    return row ? this.toReviewSchedule(row) : undefined;
  }

  saveReviewSchedule(schedule: ReviewSchedule): void {
    this.database
      .prepare(
        `UPDATE review_schedules
            SET interval_index = ?, next_review_at = ?, mastery_score = ?,
                review_count = ?
          WHERE mistake_id = ? AND parent_account_id = ?`,
      )
      .run(
        schedule.intervalIndex,
        schedule.nextReviewAt,
        schedule.masteryScore,
        schedule.reviewCount,
        schedule.mistakeId,
        schedule.parentAccountId,
      );
  }

  listDueReviewSchedules(
    parentAccountId: string,
    childProfileId: string,
    asOf: number,
  ): ReviewSchedule[] {
    const rows = this.database
      .prepare(
        `SELECT mistake_id, parent_account_id, child_profile_id,
                interval_index, next_review_at, mastery_score, review_count
           FROM review_schedules
          WHERE parent_account_id = ? AND child_profile_id = ?
            AND next_review_at <= ?
          ORDER BY next_review_at`,
      )
      .all(parentAccountId, childProfileId, asOf) as ReviewScheduleRow[];

    return rows.map((row) => this.toReviewSchedule(row));
  }

  private toReviewSchedule(row: ReviewScheduleRow): ReviewSchedule {
    return {
      mistakeId: row.mistake_id,
      parentAccountId: row.parent_account_id,
      childProfileId: row.child_profile_id,
      intervalIndex: row.interval_index,
      nextReviewAt: row.next_review_at,
      masteryScore: row.mastery_score,
      reviewCount: row.review_count,
    };
  }

  createMistake(mistake: MistakeRecord): void {
    this.database
      .prepare(
        `INSERT INTO mistakes
          (id, parent_account_id, child_profile_id, question_id,
           primary_knowledge_point, secondary_knowledge_points_json,
           mistake_cause, mastery_status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        mistake.id,
        mistake.parentAccountId,
        mistake.childProfileId,
        mistake.questionId,
        mistake.primaryKnowledgePoint,
        JSON.stringify(mistake.secondaryKnowledgePoints),
        mistake.mistakeCause,
        mistake.masteryStatus,
        mistake.createdAt,
      );
  }

  findMistake(
    parentAccountId: string,
    mistakeId: string,
  ): MistakeRecord | undefined {
    const row = this.database
      .prepare(
        `SELECT id, parent_account_id, child_profile_id, question_id,
                primary_knowledge_point, secondary_knowledge_points_json,
                mistake_cause, mastery_status, created_at
           FROM mistakes
          WHERE id = ? AND parent_account_id = ?`,
      )
      .get(mistakeId, parentAccountId) as MistakeRow | undefined;

    return row ? this.toMistake(row) : undefined;
  }

  findMistakeByQuestion(
    parentAccountId: string,
    questionId: string,
  ): MistakeRecord | undefined {
    const row = this.database
      .prepare(
        `SELECT id, parent_account_id, child_profile_id, question_id,
                primary_knowledge_point, secondary_knowledge_points_json,
                mistake_cause, mastery_status, created_at
           FROM mistakes
          WHERE question_id = ? AND parent_account_id = ?`,
      )
      .get(questionId, parentAccountId) as MistakeRow | undefined;

    return row ? this.toMistake(row) : undefined;
  }

  saveMistake(mistake: MistakeRecord): void {
    this.database
      .prepare(
        `UPDATE mistakes
            SET primary_knowledge_point = ?,
                secondary_knowledge_points_json = ?, mistake_cause = ?,
                mastery_status = ?
          WHERE id = ? AND parent_account_id = ?`,
      )
      .run(
        mistake.primaryKnowledgePoint,
        JSON.stringify(mistake.secondaryKnowledgePoints),
        mistake.mistakeCause,
        mistake.masteryStatus,
        mistake.id,
        mistake.parentAccountId,
      );
  }

  listMistakes(
    parentAccountId: string,
    childProfileId: string,
  ): MistakeRecord[] {
    const rows = this.database
      .prepare(
        `SELECT id, parent_account_id, child_profile_id, question_id,
                primary_knowledge_point, secondary_knowledge_points_json,
                mistake_cause, mastery_status, created_at
           FROM mistakes
          WHERE parent_account_id = ? AND child_profile_id = ?
          ORDER BY created_at`,
      )
      .all(parentAccountId, childProfileId) as MistakeRow[];

    return rows.map((row) => this.toMistake(row));
  }

  deleteMistake(parentAccountId: string, mistakeId: string): void {
    this.database
      .prepare(
        "DELETE FROM mistakes WHERE id = ? AND parent_account_id = ?",
      )
      .run(mistakeId, parentAccountId);
    this.database
      .prepare(
        `DELETE FROM review_schedules
          WHERE mistake_id = ? AND parent_account_id = ?`,
      )
      .run(mistakeId, parentAccountId);
    this.database
      .prepare(
        `DELETE FROM reviews
          WHERE mistake_id = ? AND parent_account_id = ?`,
      )
      .run(mistakeId, parentAccountId);
  }

  deleteQuestion(parentAccountId: string, questionId: string): void {
    this.database
      .prepare(
        "DELETE FROM questions WHERE id = ? AND parent_account_id = ?",
      )
      .run(questionId, parentAccountId);
  }

  deleteChildProfile(parentAccountId: string, childProfileId: string): void {
    const cascade = this.database.transaction(() => {
      this.database
        .prepare(
          `DELETE FROM upload_credentials
            WHERE parent_account_id = ?
              AND draft_id IN (
                SELECT id FROM question_drafts
                 WHERE parent_account_id = ? AND child_profile_id = ?
              )`,
        )
        .run(parentAccountId, parentAccountId, childProfileId);
      this.database
        .prepare(
          `DELETE FROM review_schedules
            WHERE parent_account_id = ? AND child_profile_id = ?`,
        )
        .run(parentAccountId, childProfileId);
      this.database
        .prepare(
          `DELETE FROM reviews
            WHERE parent_account_id = ?
              AND mistake_id IN (
                SELECT id FROM mistakes
                 WHERE parent_account_id = ? AND child_profile_id = ?
              )`,
        )
        .run(parentAccountId, parentAccountId, childProfileId);
      this.database
        .prepare(
          `DELETE FROM mistakes
            WHERE parent_account_id = ? AND child_profile_id = ?`,
        )
        .run(parentAccountId, childProfileId);
      this.database
        .prepare(
          `DELETE FROM questions
            WHERE parent_account_id = ? AND child_profile_id = ?`,
        )
        .run(parentAccountId, childProfileId);
      this.database
        .prepare(
          `DELETE FROM question_drafts
            WHERE parent_account_id = ? AND child_profile_id = ?`,
        )
        .run(parentAccountId, childProfileId);
      this.database
        .prepare(
          `DELETE FROM reminder_settings
            WHERE parent_account_id = ? AND child_profile_id = ?`,
        )
        .run(parentAccountId, childProfileId);
      this.database
        .prepare(
          `DELETE FROM reminder_dispatches
            WHERE parent_account_id = ? AND child_profile_id = ?`,
        )
        .run(parentAccountId, childProfileId);
      this.database
        .prepare(
          `UPDATE parent_accounts
              SET selected_child_profile_id = NULL
            WHERE id = ? AND selected_child_profile_id = ?`,
        )
        .run(parentAccountId, childProfileId);
      this.database
        .prepare(
          `DELETE FROM child_profiles
            WHERE id = ? AND parent_account_id = ?`,
        )
        .run(childProfileId, parentAccountId);
    });

    cascade();
  }

  deleteParentAccount(parentAccountId: string): void {
    const cascade = this.database.transaction(() => {
      const childProfileIds = (
        this.database
          .prepare(
            "SELECT id FROM child_profiles WHERE parent_account_id = ?",
          )
          .all(parentAccountId) as { id: string }[]
      ).map((row) => row.id);

      for (const childProfileId of childProfileIds) {
        this.deleteChildProfile(parentAccountId, childProfileId);
      }

      this.database
        .prepare("DELETE FROM sessions WHERE parent_account_id = ?")
        .run(parentAccountId);
      this.database
        .prepare("DELETE FROM reminder_settings WHERE parent_account_id = ?")
        .run(parentAccountId);
      this.database
        .prepare("DELETE FROM reminder_dispatches WHERE parent_account_id = ?")
        .run(parentAccountId);
      this.database
        .prepare("DELETE FROM parent_accounts WHERE id = ?")
        .run(parentAccountId);
    });

    cascade();
  }

  private toMistake(row: MistakeRow): MistakeRecord {
    return {
      id: row.id,
      parentAccountId: row.parent_account_id,
      childProfileId: row.child_profile_id,
      questionId: row.question_id,
      primaryKnowledgePoint: row.primary_knowledge_point,
      secondaryKnowledgePoints: JSON.parse(
        row.secondary_knowledge_points_json,
      ),
      mistakeCause: row.mistake_cause,
      masteryStatus: row.mastery_status as MistakeRecord["masteryStatus"],
      createdAt: row.created_at,
    };
  }

  createQuestion(question: ConfirmedQuestion): void {
    this.database
      .prepare(
        `INSERT INTO questions
          (id, parent_account_id, child_profile_id, source, stem, formulas_json,
           image_key, crop_json, rotation_degrees, region_json, student_answer,
           answer_analysis_skipped, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        question.id,
        question.parentAccountId,
        question.childProfileId,
        question.source,
        question.stem,
        JSON.stringify(question.formulas),
        question.imageKey,
        question.crop ? JSON.stringify(question.crop) : null,
        question.rotationDegrees,
        question.region ? JSON.stringify(question.region) : null,
        question.studentAnswer,
        Number(question.answerAnalysisSkipped),
        question.status,
        question.createdAt,
      );
  }

  findQuestion(
    parentAccountId: string,
    questionId: string,
  ): ConfirmedQuestion | undefined {
    const row = this.database
      .prepare(
        `SELECT id, parent_account_id, child_profile_id, source, stem,
                formulas_json, image_key, crop_json, rotation_degrees,
                region_json, student_answer, answer_analysis_skipped, status,
                created_at
           FROM questions
          WHERE id = ? AND parent_account_id = ?`,
      )
      .get(questionId, parentAccountId) as QuestionRow | undefined;

    return row ? this.toQuestion(row) : undefined;
  }

  saveQuestion(question: ConfirmedQuestion): void {
    this.database
      .prepare(
        `UPDATE questions
            SET student_answer = ?, answer_analysis_skipped = ?, status = ?
          WHERE id = ? AND parent_account_id = ?`,
      )
      .run(
        question.studentAnswer,
        Number(question.answerAnalysisSkipped),
        question.status,
        question.id,
        question.parentAccountId,
      );
  }

  private toQuestion(row: QuestionRow): ConfirmedQuestion {
    return {
      id: row.id,
      parentAccountId: row.parent_account_id,
      childProfileId: row.child_profile_id,
      source: row.source as ConfirmedQuestion["source"],
      stem: row.stem,
      formulas: JSON.parse(row.formulas_json),
      imageKey: row.image_key,
      crop: row.crop_json ? JSON.parse(row.crop_json) : null,
      rotationDegrees: row.rotation_degrees,
      region: row.region_json ? JSON.parse(row.region_json) : null,
      studentAnswer: row.student_answer,
      answerAnalysisSkipped: Boolean(row.answer_analysis_skipped),
      status: row.status as ConfirmedQuestion["status"],
      createdAt: row.created_at,
    };
  }

  createQuestionDraft(draft: QuestionDraft): void {
    this.database
      .prepare(
        `INSERT INTO question_drafts
          (id, parent_account_id, child_profile_id, source, image_key,
           crop_json, rotation_degrees, recognition_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        draft.id,
        draft.parentAccountId,
        draft.childProfileId,
        draft.source,
        draft.imageKey,
        draft.crop ? JSON.stringify(draft.crop) : null,
        draft.rotationDegrees,
        draft.recognition ? JSON.stringify(draft.recognition) : null,
      );
  }

  findQuestionDraft(
    parentAccountId: string,
    draftId: string,
  ): QuestionDraft | undefined {
    const row = this.database
      .prepare(
        `SELECT id, parent_account_id, child_profile_id, source, image_key,
                crop_json, rotation_degrees, recognition_json
           FROM question_drafts
          WHERE id = ? AND parent_account_id = ?`,
      )
      .get(draftId, parentAccountId) as QuestionDraftRow | undefined;

    return row ? this.toQuestionDraft(row) : undefined;
  }

  saveQuestionDraft(draft: QuestionDraft): void {
    this.database
      .prepare(
        `UPDATE question_drafts
            SET image_key = ?, crop_json = ?, rotation_degrees = ?,
                recognition_json = ?
          WHERE id = ? AND parent_account_id = ?`,
      )
      .run(
        draft.imageKey,
        draft.crop ? JSON.stringify(draft.crop) : null,
        draft.rotationDegrees,
        draft.recognition ? JSON.stringify(draft.recognition) : null,
        draft.id,
        draft.parentAccountId,
      );
  }

  deleteQuestionDraft(parentAccountId: string, draftId: string): void {
    this.database
      .prepare(
        "DELETE FROM question_drafts WHERE id = ? AND parent_account_id = ?",
      )
      .run(draftId, parentAccountId);
  }

  createUploadCredential(credential: PhotoUploadCredential): void {
    this.database
      .prepare(
        `INSERT INTO upload_credentials
          (upload_token, parent_account_id, draft_id, image_key, expires_at, used_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        credential.uploadToken,
        credential.parentAccountId,
        credential.draftId,
        credential.imageKey,
        credential.expiresAt,
        credential.usedAt,
      );
  }

  findUploadCredential(token: string): PhotoUploadCredential | undefined {
    const row = this.database
      .prepare(
        `SELECT upload_token, parent_account_id, draft_id, image_key,
                expires_at, used_at
           FROM upload_credentials
          WHERE upload_token = ?`,
      )
      .get(token) as UploadCredentialRow | undefined;

    return row
      ? {
          uploadToken: row.upload_token,
          parentAccountId: row.parent_account_id,
          draftId: row.draft_id,
          imageKey: row.image_key,
          expiresAt: row.expires_at,
          usedAt: row.used_at,
        }
      : undefined;
  }

  saveUploadCredential(credential: PhotoUploadCredential): void {
    this.database
      .prepare(
        "UPDATE upload_credentials SET used_at = ? WHERE upload_token = ?",
      )
      .run(credential.usedAt, credential.uploadToken);
  }

  private toQuestionDraft(row: QuestionDraftRow): QuestionDraft {
    return {
      id: row.id,
      parentAccountId: row.parent_account_id,
      childProfileId: row.child_profile_id,
      source: row.source as QuestionDraft["source"],
      imageKey: row.image_key,
      crop: row.crop_json ? JSON.parse(row.crop_json) : null,
      rotationDegrees: row.rotation_degrees,
      recognition: row.recognition_json
        ? JSON.parse(row.recognition_json)
        : null,
    };
  }

  createParentAccount(account: ParentAccount): void {
    this.database
      .prepare(
        `INSERT INTO parent_accounts
          (id, guardianship_confirmed, allow_direct_answer_reveal, plan)
         VALUES (?, ?, ?, ?)`,
      )
      .run(
        account.id,
        Number(account.guardianshipConfirmed),
        Number(account.allowDirectAnswerReveal),
        account.plan,
      );
  }

  findParentAccount(parentAccountId: string): ParentAccount | undefined {
    const row = this.database
      .prepare(
        `SELECT id, guardianship_confirmed, allow_direct_answer_reveal, plan
           FROM parent_accounts WHERE id = ?`,
      )
      .get(parentAccountId) as ParentAccountRow | undefined;

    return row
      ? {
          id: row.id,
          guardianshipConfirmed: Boolean(row.guardianship_confirmed),
          allowDirectAnswerReveal: Boolean(row.allow_direct_answer_reveal),
          plan: row.plan as ParentAccount["plan"],
        }
      : undefined;
  }

  saveParentAccount(account: ParentAccount): void {
    this.database
      .prepare(
        `UPDATE parent_accounts
            SET guardianship_confirmed = ?, allow_direct_answer_reveal = ?,
                plan = ?
          WHERE id = ?`,
      )
      .run(
        Number(account.guardianshipConfirmed),
        Number(account.allowDirectAnswerReveal),
        account.plan,
        account.id,
      );
  }

  countQuestionsSince(parentAccountId: string, sinceMs: number): number {
    const row = this.database
      .prepare(
        `SELECT COUNT(*) AS count FROM questions
          WHERE parent_account_id = ? AND created_at >= ?`,
      )
      .get(parentAccountId, sinceMs) as { count: number };

    return row.count;
  }

  countVariantReviewsSince(parentAccountId: string, sinceMs: number): number {
    const row = this.database
      .prepare(
        `SELECT COUNT(*) AS count FROM reviews
          WHERE parent_account_id = ? AND exercise_kind = 'variant'
            AND started_at >= ?`,
      )
      .get(parentAccountId, sinceMs) as { count: number };

    return row.count;
  }

  createSession(session: LoginSession): void {
    this.database
      .prepare(
        "INSERT INTO sessions (token, parent_account_id, expires_at) VALUES (?, ?, ?)",
      )
      .run(session.token, session.parentAccountId, session.expiresAt);
  }

  findSession(token: string): LoginSession | undefined {
    const row = this.database
      .prepare(
        "SELECT token, parent_account_id, expires_at FROM sessions WHERE token = ?",
      )
      .get(token) as SessionRow | undefined;

    return row
      ? {
          token: row.token,
          parentAccountId: row.parent_account_id,
          expiresAt: row.expires_at,
        }
      : undefined;
  }

  createChildProfile(profile: ChildProfile): void {
    this.database
      .prepare(
        `INSERT INTO child_profiles
          (id, parent_account_id, nickname, grade, region, textbook_version)
          VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        profile.id,
        profile.parentAccountId,
        profile.nickname,
        profile.grade,
        profile.region,
        profile.textbookVersion ?? null,
      );
  }

  listChildProfiles(parentAccountId: string): ChildProfile[] {
    const rows = this.database
      .prepare(
        `SELECT id, parent_account_id, nickname, grade, region,
                textbook_version
           FROM child_profiles
          WHERE parent_account_id = ?`,
      )
      .all(parentAccountId) as ChildProfileRow[];

    return rows.map((row) => this.toChildProfile(row));
  }

  findChildProfile(
    parentAccountId: string,
    childProfileId: string,
  ): ChildProfile | undefined {
    const row = this.database
      .prepare(
        `SELECT id, parent_account_id, nickname, grade, region, textbook_version
           FROM child_profiles
          WHERE id = ? AND parent_account_id = ?`,
      )
      .get(childProfileId, parentAccountId) as ChildProfileRow | undefined;

    return row ? this.toChildProfile(row) : undefined;
  }

  saveChildProfile(profile: ChildProfile): void {
    this.database
      .prepare(
        `UPDATE child_profiles
            SET nickname = ?, grade = ?, region = ?, textbook_version = ?
          WHERE id = ? AND parent_account_id = ?`,
      )
      .run(
        profile.nickname,
        profile.grade,
        profile.region,
        profile.textbookVersion ?? null,
        profile.id,
        profile.parentAccountId,
      );
  }

  findSelectedChildProfile(parentAccountId: string): ChildProfile | undefined {
    const row = this.database
      .prepare(
        `SELECT child_profiles.id, child_profiles.parent_account_id,
                child_profiles.nickname, child_profiles.grade,
                child_profiles.region, child_profiles.textbook_version
           FROM parent_accounts
           JOIN child_profiles
             ON child_profiles.id = parent_accounts.selected_child_profile_id
          WHERE parent_accounts.id = ?
            AND child_profiles.parent_account_id = parent_accounts.id`,
      )
      .get(parentAccountId) as ChildProfileRow | undefined;

    return row ? this.toChildProfile(row) : undefined;
  }

  selectChildProfile(parentAccountId: string, childProfileId: string): void {
    this.database
      .prepare(
        `UPDATE parent_accounts
            SET selected_child_profile_id = ?
          WHERE id = ?
            AND EXISTS (
              SELECT 1 FROM child_profiles
               WHERE id = ? AND parent_account_id = ?
            )`,
      )
      .run(childProfileId, parentAccountId, childProfileId, parentAccountId);
  }

  close(): void {
    this.database.close();
  }

  private toChildProfile(row: ChildProfileRow): ChildProfile {
    return {
      id: row.id,
      parentAccountId: row.parent_account_id,
      nickname: row.nickname,
      grade: row.grade,
      region: row.region,
      ...(row.textbook_version ? { textbookVersion: row.textbook_version } : {}),
    };
  }
}
