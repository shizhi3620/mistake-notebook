import type { Pool } from "mysql2/promise";

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS schema_migrations (
    version INT UNSIGNED PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS parent_accounts (
    id CHAR(36) PRIMARY KEY,
    guardianship_confirmed BOOLEAN NOT NULL,
    allow_direct_answer_reveal BOOLEAN NOT NULL DEFAULT FALSE,
    plan VARCHAR(32) NOT NULL DEFAULT 'free',
    selected_child_profile_id CHAR(36) NULL
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS wechat_identities (
    wechat_subject VARCHAR(191) PRIMARY KEY,
    parent_account_id CHAR(36) NOT NULL UNIQUE,
    CONSTRAINT wechat_identities_parent_account
      FOREIGN KEY (parent_account_id) REFERENCES parent_accounts(id)
      ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS child_profiles (
    id CHAR(36) PRIMARY KEY,
    parent_account_id CHAR(36) NOT NULL,
    nickname VARCHAR(191) NOT NULL,
    grade TINYINT UNSIGNED NOT NULL,
    region VARCHAR(191) NOT NULL,
    province_code VARCHAR(32) NULL,
    province_name VARCHAR(191) NULL,
    city_code VARCHAR(32) NULL,
    city_name VARCHAR(191) NULL,
    textbook_version VARCHAR(191) NULL,
    INDEX child_profiles_parent_account (parent_account_id),
    CONSTRAINT child_profiles_parent_account
      FOREIGN KEY (parent_account_id) REFERENCES parent_accounts(id)
      ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token CHAR(36) PRIMARY KEY,
    parent_account_id CHAR(36) NOT NULL,
    expires_at BIGINT NOT NULL,
    INDEX sessions_parent_account (parent_account_id),
    CONSTRAINT sessions_parent_account
      FOREIGN KEY (parent_account_id) REFERENCES parent_accounts(id)
      ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS question_drafts (
    id CHAR(36) PRIMARY KEY,
    parent_account_id CHAR(36) NOT NULL,
    child_profile_id CHAR(36) NOT NULL,
    source VARCHAR(32) NOT NULL,
    image_key TEXT NULL,
    crop_json JSON NULL,
    rotation_degrees SMALLINT NOT NULL,
    recognition_json JSON NULL,
    INDEX question_drafts_owner (parent_account_id, child_profile_id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS upload_credentials (
    upload_token CHAR(36) PRIMARY KEY,
    parent_account_id CHAR(36) NOT NULL,
    draft_id CHAR(36) NOT NULL,
    image_key TEXT NOT NULL,
    expires_at BIGINT NOT NULL,
    used_at BIGINT NULL,
    INDEX upload_credentials_draft (parent_account_id, draft_id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS questions (
    id CHAR(36) PRIMARY KEY,
    parent_account_id CHAR(36) NOT NULL,
    child_profile_id CHAR(36) NOT NULL,
    source VARCHAR(32) NOT NULL,
    stem TEXT NOT NULL,
    formulas_json JSON NOT NULL,
    image_key TEXT NULL,
    crop_json JSON NULL,
    rotation_degrees SMALLINT NOT NULL,
    region_json JSON NULL,
    student_answer TEXT NULL,
    answer_analysis_skipped BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(32) NOT NULL,
    created_at BIGINT NOT NULL,
    INDEX questions_owner_created (parent_account_id, created_at),
    INDEX questions_child_created (parent_account_id, child_profile_id, created_at)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS mistakes (
    id CHAR(36) PRIMARY KEY,
    parent_account_id CHAR(36) NOT NULL,
    child_profile_id CHAR(36) NOT NULL,
    question_id CHAR(36) NOT NULL,
    primary_knowledge_point VARCHAR(191) NOT NULL,
    secondary_knowledge_points_json JSON NOT NULL,
    mistake_cause VARCHAR(191) NULL,
    mastery_status VARCHAR(32) NOT NULL DEFAULT 'not-started',
    created_at BIGINT NOT NULL,
    UNIQUE KEY mistakes_question_owner (question_id, parent_account_id),
    INDEX mistakes_child_created (parent_account_id, child_profile_id, created_at)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS review_schedules (
    mistake_id CHAR(36) PRIMARY KEY,
    parent_account_id CHAR(36) NOT NULL,
    child_profile_id CHAR(36) NOT NULL,
    interval_index SMALLINT NOT NULL,
    next_review_at BIGINT NOT NULL,
    mastery_score DOUBLE NOT NULL,
    review_count SMALLINT NOT NULL,
    INDEX review_schedules_due (parent_account_id, child_profile_id, next_review_at)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS reviews (
    id CHAR(36) PRIMARY KEY,
    parent_account_id CHAR(36) NOT NULL,
    mistake_id CHAR(36) NOT NULL,
    exercise_kind VARCHAR(32) NOT NULL,
    started_at BIGINT NOT NULL,
    completed_at BIGINT NULL,
    self_assessment VARCHAR(32) NULL,
    variant_correct BOOLEAN NULL,
    result_interval_index SMALLINT NULL,
    result_next_review_at BIGINT NULL,
    result_mastery_score DOUBLE NULL,
    INDEX reviews_owner_started (parent_account_id, started_at)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS reminder_settings (
    parent_account_id CHAR(36) NOT NULL,
    child_profile_id CHAR(36) NOT NULL,
    enabled BOOLEAN NOT NULL,
    hour_of_day TINYINT UNSIGNED NOT NULL,
    PRIMARY KEY (parent_account_id, child_profile_id),
    INDEX reminder_settings_enabled (enabled)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS reminder_dispatches (
    id CHAR(36) PRIMARY KEY,
    parent_account_id CHAR(36) NOT NULL,
    child_profile_id CHAR(36) NOT NULL,
    date_key CHAR(10) NOT NULL,
    sent_at BIGINT NOT NULL,
    status VARCHAR(32) NOT NULL,
    UNIQUE KEY reminder_dispatches_daily_limit
      (parent_account_id, child_profile_id, date_key)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS homework_reviews (
    id CHAR(36) PRIMARY KEY,
    parent_account_id CHAR(36) NOT NULL,
    child_profile_id CHAR(36) NOT NULL,
    image_key TEXT NULL,
    created_at BIGINT NOT NULL,
    candidates_json JSON NOT NULL,
    INDEX homework_reviews_owner (parent_account_id, child_profile_id, created_at)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS correct_practice_evidence (
    id CHAR(36) PRIMARY KEY,
    parent_account_id CHAR(36) NOT NULL,
    child_profile_id CHAR(36) NOT NULL,
    homework_review_id CHAR(36) NOT NULL,
    knowledge_point VARCHAR(191) NULL,
    created_at BIGINT NOT NULL,
    INDEX correct_practice_evidence_owner
      (parent_account_id, child_profile_id, created_at)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS idempotency_records (
    parent_account_id CHAR(36) NOT NULL,
    operation_name VARCHAR(64) NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL,
    state VARCHAR(16) NOT NULL,
    response_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (parent_account_id, operation_name, idempotency_key),
    CONSTRAINT idempotency_records_parent_account
      FOREIGN KEY (parent_account_id) REFERENCES parent_accounts(id)
      ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS feedback (
    id CHAR(36) PRIMARY KEY,
    parent_account_id CHAR(36) NOT NULL,
    child_profile_id CHAR(36) NULL,
    question_id CHAR(36) NULL,
    type VARCHAR(32) NOT NULL,
    payload_json JSON NOT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    INDEX feedback_owner_created (parent_account_id, created_at),
    INDEX feedback_priority (parent_account_id, type, created_at),
    CONSTRAINT feedback_parent_account FOREIGN KEY (parent_account_id) REFERENCES parent_accounts(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS recognition_tasks (
    id CHAR(36) PRIMARY KEY, parent_account_id CHAR(36) NOT NULL, child_profile_id CHAR(36) NOT NULL, draft_id CHAR(36) NULL, kind VARCHAR(32) NOT NULL, image_key TEXT NOT NULL, image_url TEXT NULL, status VARCHAR(32) NOT NULL, attempts SMALLINT NOT NULL DEFAULT 0, result_json JSON NULL, error_code VARCHAR(64) NULL, idempotency_key VARCHAR(128) NOT NULL, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, expires_at BIGINT NOT NULL,
    UNIQUE KEY recognition_tasks_idempotency (parent_account_id, idempotency_key), INDEX recognition_tasks_status (status, expires_at), INDEX recognition_tasks_owner (parent_account_id, created_at)
  ) ENGINE=InnoDB`,
  `ALTER TABLE recognition_tasks DROP INDEX recognition_tasks_idempotency`,
  `ALTER TABLE recognition_tasks ADD COLUMN image_expires_at BIGINT NOT NULL DEFAULT 0, ADD COLUMN image_deleted_at BIGINT NULL, ADD INDEX recognition_tasks_image_retention (image_deleted_at, image_expires_at)`,
  `UPDATE recognition_tasks SET image_expires_at = created_at + 86400000 WHERE image_expires_at = 0`,
  `CREATE TABLE IF NOT EXISTS homework_upload_credentials (
    upload_token CHAR(36) PRIMARY KEY,
    parent_account_id CHAR(36) NOT NULL,
    child_profile_id CHAR(36) NOT NULL,
    image_key TEXT NOT NULL,
    expires_at BIGINT NOT NULL,
    used_at BIGINT NULL,
    INDEX homework_upload_credentials_owner (parent_account_id, child_profile_id)
  ) ENGINE=InnoDB`,
] as const;

export async function migrateMysqlSchema(pool: Pool): Promise<void> {
  const connection = await pool.getConnection();
  try {
    await connection.query(schemaStatements[0]);
    await connection.beginTransaction();
    for (const [index, statement] of schemaStatements.slice(1).entries()) {
      const version = index + 1;
      const [rows] = await connection.query(
        "SELECT version FROM schema_migrations WHERE version = ?",
        [version],
      );
      if ((rows as unknown[]).length > 0) continue;
      await connection.query(statement);
      await connection.query(
        "INSERT INTO schema_migrations (version) VALUES (?)",
        [version],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
