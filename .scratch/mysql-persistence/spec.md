# MySQL 持久化与异步学习闭环规格

**Status:** ready-for-agent

## Problem Statement

当前学习闭环依赖同步的 SQLite/内存存储接口，云托管服务尚未真正使用 MySQL 作为唯一持久化数据源。若直接接入异步 MySQL 驱动，可能出现未等待写入、事务失败后返回成功、重启丢失数据或生产静默回退 SQLite 的问题。

## Solution

将 `LearningLoopStore`、`LearningLoop` 公开方法、HTTP 路由和领域测试统一迁移为 `async`/`await`。使用 `mysql2/promise` 连接池实现覆盖全部学习实体的 MySQL 适配器，事务、幂等、账户隔离、迁移和错误映射均封装在存储适配器与生产启动模块中。SQLite 和内存存储仅作为异步接口的本地适配器。先完成微信登录、家长账户和孩子档案的完整 MySQL 纵向样板，再扩展题目、错题、复习和提醒路径。

## User Stories

1. As an invited guardian, I want login and my guardian account to survive service restarts, so that I do not lose access to the family.
2. As a guardian, I want child profiles to be restored after a deployment or scale-out, so that learning can continue on any instance.
3. As a guardian, I want my child data isolated from other guardians, so that no account can read or modify another family's records.
4. As a guardian, I want drafts and confirmed questions to survive transient service failures, so that an interrupted capture can be resumed safely.
5. As a guardian, I want confirmed homework results, mistakes, review schedules, and reminders to remain consistent after restart, so that the learning plan does not change unexpectedly.
6. As a guardian, I want a failed multi-record operation to leave no partial learning state, so that retries are safe.
7. As a guardian, I want repeated requests to return the original successful result, so that network retries do not create duplicate mistakes, reviews, or reminders.
8. As a guardian, I want a concurrent conflicting update to be reported clearly, so that I can refresh instead of overwriting newer data.
9. As an operator, I want production to use TLS MySQL only, so that container-local files cannot become an accidental data store.
10. As an operator, I want startup to fail when MySQL, TLS, schema, or migrations are unavailable, so that an unhealthy deployment cannot accept writes.
11. As an operator, I want schema migrations to be ordered and recorded, so that rolling deployments remain compatible and auditable.
12. As an operator, I want storage failures to map to a stable `503 storage_unavailable` response, so that clients can safely retry without seeing misleading success.
13. As an operator, I want only safe uncommitted or idempotent operations retried once, so that transient connection failures do not duplicate writes.
14. As an operator, I want health checks to include MySQL availability, so that traffic is not sent to an instance that cannot persist data.
15. As an operator, I want graceful shutdown to wait for in-flight database operations, so that deployments do not interrupt committed learning changes.
16. As a release owner, I want isolated recovery drills with fictional data, so that backup and restore procedures can be verified without exposing children’s information.
17. As a release owner, I want the full learning loop and account isolation tested through the highest seam, so that storage implementation changes do not require page-level tests.

## Implementation Decisions

- Use one asynchronous `LearningLoopStore` interface. All `LearningLoop` public methods, HTTP handlers, and domain tests explicitly await results; no synchronous compatibility API remains.
- Track the HTTP portion as the dedicated `07-async-http-boundary-migration.md` ticket so no route can bypass the asynchronous storage contract.
- Wrap SQLite and in-memory adapters behind the asynchronous interface for local development and tests.
- Implement production persistence with `mysql2/promise`, a bounded connection pool, TLS enabled by default, parameterized SQL, and explicit connection release.
- Cover accounts, WeChat identities, sessions, child profiles, drafts, upload credentials, questions, homework reviews, mistakes, review schedules, reviews, reminder settings, reminder dispatches, and correct-practice evidence.
- Keep transaction policy inside the storage adapter. Composite operations are atomic and never return partial results.
- Use unique business constraints and `Idempotency-Key` for new clients. Existing clients use resource IDs, review IDs, and date keys as compatibility idempotency keys.
- Return the first successful result for duplicate requests; return `409` for competing updates with changed content.
- Map final storage failures to HTTP `503` with `storage_unavailable`; retry at most once for uncommitted or idempotent operations and never fall back to SQLite.
- Store absolute timestamps as UTC milliseconds. Compute review dates and reminder hours using `Asia/Shanghai` in the domain layer.
- Maintain a versioned `schema_migrations` table. Use expand-contract migrations and defer destructive changes by at least one release.
- In production, require MySQL configuration and initialize the schema before accepting traffic. Local SQLite remains an explicit development option.
- `/healthz` checks database availability in production. Shutdown stops new work, waits for in-flight operations, and then closes the pool.
- Account deletion removes all relational learning data in one database transaction. CloudBase object deletion is handled by a separate retryable cleanup task.
- Start with an empty MySQL database for controlled beta. Import existing SQLite only through a separate, repeatable, count-checked tool when explicitly requested.

## Testing Decisions

- Use the asynchronous `LearningLoop` and HTTP API as the single highest test seam.
- Assert user-visible results, persistence across a new store instance, account isolation, stable errors, idempotency, and transaction outcomes; do not test SQL statement text or third-party SDK internals.
- Add a vertical integration slice for login, guardian account, and child profile before migrating the remaining learning entities.
- Add MySQL integration tests for parameterized reads/writes, concurrent pool usage, rollback, duplicate requests, conflicting updates, and restart recovery.
- Keep existing domain scenarios as prior art, converting them to explicit `async` tests while preserving their observable assertions.
- Test startup failure for incomplete credentials, failed TLS/connection, unknown migration versions, and migration rollback.
- Test health-check failure and graceful pool shutdown with in-flight operations.
- Run recovery and scale-out checks only against an isolated database populated with fictional guardian and child data.
- Completion requires type checking, the full test suite, MySQL integration and recovery tests, account-isolation tests, transaction rollback tests, health-check failure tests, and code review with no high-severity findings.

## Out of Scope

- WeChat Pay, subscriptions, public commercialization, or payment data.
- Replacing the LearningLoop domain rules or changing the user-visible learning workflow.
- Automatic migration of the existing SQLite database during normal production startup.
- Using real children’s data or production credentials in automated tests or recovery drills.
- Asynchronous write-behind queues that allow HTTP success before durable MySQL commit.

## Further Notes

- The parent-confirmed grading rule in ADR 0001 remains authoritative: AI output is never a final learning record.
- The controlled beta must keep API response shapes stable except for the new stable storage error code and status.
- Backups retain at least seven days; recovery targets are RPO 24 hours and RTO 4 hours.
