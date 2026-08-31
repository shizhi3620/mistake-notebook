# 05: 生产 MySQL 启动与迁移切换

**What to build:** 云托管服务以 TLS MySQL 作为唯一学习数据源启动，安全地应用顺序 schema 迁移，并在数据库不可用时明确停止而非写入容器本地文件。

**Blocked by:** 03 — MySQL 认证与档案纵向切片; 04 — MySQL 错题、复习与提醒原子化; 05 — MySQL 拍题与确认纵向切片; 07 — HTTP 异步边界迁移

**Status:** ready-for-human

- [x] 生产环境只构造 MySQL 学习存储；本地开发可显式选择 SQLite。
- [x] schema 迁移被版本记录，失败或版本异常时启动失败。
- [x] 配置、TLS 或连接故障不会泄露凭证，也不会回退 SQLite。
- [x] 云托管配置拒绝显式关闭 MySQL TLS；本地开发仍可使用 `MYSQL_SSL=false`。
- [x] 迁移使用 expand-contract，生产关闭时等待在途操作后释放连接池。
- [x] `/healthz` 支持注入 MySQL 可用性检查，数据库不可用时返回 `503 storage_unavailable`。

2026-08-30 验证：隔离 MySQL 完成 schema migration/ping，并重启 `math-mistake-mysql` 后再次连接验证成功。

2026-08-31 再次重启容器后连接和 14 版 schema 验证成功。

生产配置新增 TLS 强制校验，并有回归测试覆盖云托管拒绝非 TLS 配置。

## Comments

- 2026-08-30：已补充 MySQL 连接池的显式关闭函数，并在服务收到 `SIGTERM`/`SIGINT` 时先停止接收请求、等待 HTTP server 关闭后释放连接池。云托管缺少完整 MySQL 配置时仍会在启动阶段失败，不回退 SQLite。
- 2026-08-30：启动入口已在检测到 MySQL 配置时注入 `MysqlLearningLoopStore`；无配置时保留本地 SQLite，云托管缺配置仍启动失败。领域层其余 API 异步迁移仍在进行。
- 2026-08-31：全链路异步迁移完成，`npm run preflight` 79/79 通过；真实本地 MySQL 验收输出 schema 14/关键表 9/闭环恢复成功。仓库实现完成，目标云托管 TLS、私网连接和发布切换转人工验收。

## Scope consolidation

吸收原 `07-mysql-learning-production-switch.md` 的 MySQL-only 学习实体覆盖、健康检查、迁移失败和优雅关闭要求。
