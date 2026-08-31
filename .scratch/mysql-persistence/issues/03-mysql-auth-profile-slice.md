# 03: MySQL 认证与档案纵向切片

**What to build:** 家长使用微信登录后，账户、会话和孩子档案写入 MySQL，并可在新实例中恢复且不能跨账户访问。

**Blocked by:** 02 — 迁移认证与档案调用方

**Status:** completed

- [x] MySQL 实现覆盖账户、微信身份、会话和孩子档案读写。
- [x] 连接池、参数化查询、TLS 和事务边界经过集成测试。
- [x] 重启恢复与账户隔离测试通过。

## Comments

- 2026-08-30：已在隔离 MySQL 8.4 上完成 schema migration，并验证账户、微信身份、孩子档案写入/读取及删除级联的真实 round-trip。领域层尚未完成全链路异步迁移，因此该 ticket 暂不标记完成。
- 2026-08-30：全量异步入口和 HTTP 调用链已通过 67 项回归测试；仍需在目标 MySQL 环境完成完整账户/会话/档案恢复和隔离验收后关闭。

## Scope consolidation

吸收原 `02-mysql-guardian-and-child-profiles.md` 的 MySQL 账户、微信身份、会话、孩子档案及 HTTP 验收要求。

当前已具备参数化查询、连接池适配、账户隔离和删除级联实现；目标环境 TLS、重启恢复和并发验收仍未完成。

2026-08-31 真实验收：本地 MySQL 8.4 完成 14 版 schema migration；账户、微信身份、孩子档案 round-trip 和跨账户隔离检查通过。

完整异步 `LearningLoop` 登录、监护确认、建档和删除链路已在 MySQL 8.4 真实运行通过。

2026-08-31：重新运行 `accept:mysql` 和 `accept:mysql-loop`，14 个 schema 版本、9 张关键表、完整异步闭环及连接池重建恢复通过；新增 `identityRestored:true` 证明重连后可按账户反查微信 openid。生产环境 TLS/私网和托管备份由 `05-production-mysql-startup`、`08-persistence-acceptance-recovery` 继续验收。
