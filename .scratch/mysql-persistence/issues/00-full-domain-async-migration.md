# 00: LearningLoop 全链路异步迁移

**What to build:** 将 `LearningLoop`、HTTP 路由和全部领域测试统一迁移到 Promise/`async`/`await` 契约，使 MySQL 异步存储可以安全接入生产领域流程。

**Blocked by:** None

**Status:** completed

## Comments

- 2026-08-30：开始执行。该聚合 ticket 明确承接既有 `01/02/04/07`，避免继续重复确认范围。
- 2026-08-30：HTTP handler 已统一显式等待 `LearningLoop` 调用，类型检查和 65 项测试通过；领域 API 本身仍待迁移。

- 2026-08-30：继续执行。当前入口为 `src/learning-loop.ts` 的 `LearningLoop` 类；迁移门槛为 `npm run check` 和全量测试同时通过，未通过前不推进后续 ticket 状态。
- 2026-08-30：认证异步入口 `startWeChatLoginAsync`、`resumeSessionAsync` 已改为直接调用 Promise-based store；生产启动已切换到 MySQL store。全领域 API 尚未全部 Promise 化，本聚合保持 `claimed`。
- 2026-08-30：已确认认证、档案、拍题、作业、错题、复习、提醒、周报和删除均已有显式 Promise 入口，HTTP 路由全部使用异步入口；同步 API 仍作为本地测试兼容层保留，最终需补齐全量异步领域测试后再关闭该 ticket。
- 2026-08-31：吸收原 `01-async-learning-store-seam.md` 的 seam 验收范围，作为唯一全链路异步迁移执行 ticket；当前 70+ 项领域/HTTP 回归测试通过，但同步兼容 API 仍保留。
- 2026-08-31：`review-loop`、`mistake-book`、`explanation-and-mistakes` 测试已迁移到显式异步入口；同时补齐 `startReviewAsync` 变式题生成、`getExplanation` 异步存储读取，以及查重/合并异步 API。全量 74 项测试、类型检查和 diff 检查通过；首页、周报、提醒、权益测试仍含同步兼容调用。
- 2026-08-31：首页、周报、提醒和权益测试已完成迁移；全库搜索确认 `LearningLoop` 同步方法无生产或测试调用方，直接 store 契约测试除外。当前仅剩类内同步兼容实现待物理删除。
- 2026-08-31：遗留同步方法已改为类私有实现，不再属于 `LearningLoop` 公共 API；生产、HTTP、脚本和领域测试只可调用 Promise 入口。类型检查、76 项全量测试和同步调用搜索通过，本 ticket 完成。

## Acceptance criteria

- [x] `LearningLoop` 持有 `AsyncLearningLoopStore`，所有异步生产入口的持久化调用显式 `await`。
- [x] 认证、档案、拍题、作业、错题、复习、提醒、周报和删除 API 均提供 Promise 入口。
- [x] 异步领域调用链显式等待，不把 Promise 当作实体值使用。
- [x] HTTP 全部学习闭环路由显式等待领域结果，成功响应结构保持兼容。
- [x] 存储故障统一映射为 `503 storage_unavailable`。
- [x] 全部测试迁移为显式 `async/await`，并移除同步兼容 API。
- [x] SQLite 和 MySQL 适配器均可注入并通过同一领域契约。

## Scope consolidation

执行顺序：本 ticket 作为 `01`、`02`、`04`（拍题）、`04`（错题/复习/提醒）和 `07` 的聚合执行入口；完成后继续 `03`、`05`、`08` 的 MySQL 纵向接入与验收。
