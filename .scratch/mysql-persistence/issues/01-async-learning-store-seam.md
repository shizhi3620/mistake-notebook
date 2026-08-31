# 01: 扩展可等待的学习存储 seam

**What to build:** 学习闭环可使用本地开发存储或异步生产存储，而不改变家长已验证的登录、建档、拍题、确认、错题和复习体验。

**Blocked by:** None (can start immediately)

**Status:** superseded
**Superseded by:** 00-full-domain-async-migration.md

异步存储 seam 已作为全链路迁移的一部分由 `00-full-domain-async-migration.md` 统一执行；本文件保留契约和历史验收要求，避免与聚合 ticket 重复维护。

## Comments

- 2026-08-30：Promise-based `AsyncLearningLoopStore` 与 MySQL 适配器已存在，但 `LearningLoop` 公共领域 API 及现有调用者仍为同步契约。全量迁移需要一次性更新领域内部调用、HTTP 路由和测试，当前未标记完成，避免把 Promise 当作实体值使用。
- 2026-08-30：`asAsyncLearningLoopStore` 现接受同步或已异步适配器，新增回归测试验证异步适配器不会被错误地当作同步值处理；类型检查和 65 项测试通过。领域公共 API 全量异步迁移仍是后续工作。
- 2026-08-30：确认完整领域层异步迁移已有现有 tickets 覆盖，无需新增重复 ticket：`02` 负责认证/档案，`04`（拍题）负责捕获/作业，`04`（错题/复习/提醒）负责学习闭环，`07` 负责 HTTP 边界；`03`、`05`、`08` 分别负责 MySQL 纵向接入、生产切换和最终验收。

- [x] `LearningLoop` 的存储 seam 支持本地和异步适配器，且业务规则仍由 `LearningLoop` 决定。
- [x] 现有学习闭环和 HTTP 金路径在迁移期间保持通过。
- [x] 调用者不会将未等待的持久化结果作为学习状态返回给家长。
- [x] 所有领域测试迁移为显式 `async`/`await`，不保留同步兼容层作为生产路径。
- [x] HTTP 成功响应结构保持不变；存储故障统一映射为 `503 storage_unavailable`。
- [x] 采用全链路异步迁移；不保留同步兼容 API，领域测试显式等待所有学习闭环调用。
- [x] 以微信登录、家长账户和孩子档案作为首个完整纵向样板并通过集成与重启恢复验证。

## Scope consolidation

吸收原 `01-async-store-expand.md` 的异步接口、内存/SQLite 适配器和既有回归测试要求。
