# 11 — MySQL 持久化存储实现

**What to build:** 学习闭环的全部账户和学习数据写入云托管 MySQL，并在服务重启或扩缩容后保持一致可读。

**Blocked by:** None — can start immediately

**Status:** superseded
**Superseded by:** ../../mysql-persistence/issues/03-mysql-auth-profile-slice.md; ../../mysql-persistence/issues/05-mysql-capture-slice.md; ../../mysql-persistence/issues/04-mysql-mistakes-reviews-and-reminders.md; ../../mysql-persistence/issues/05-production-mysql-startup.md; ../../mysql-persistence/issues/08-persistence-acceptance-recovery.md

MySQL 存储实现已按领域切片、生产启动和最终验收拆分到 `mysql-persistence` canonical tickets；本文件保留已确认的架构决策作为历史记录。

- [ ] MySQL 存储覆盖现有学习闭环存储契约的全部实体和查询。
- [ ] 关键组合写入使用事务，失败时不会留下半成品数据。
- [ ] 连接池支持并发请求，连接异常会返回明确错误而不是回退 SQLite。
- [ ] 单元和 HTTP 测试覆盖持久化读写、账户隔离、事务回滚和重启恢复。

## Confirmed Decisions

- 云托管生产环境只使用 TLS MySQL；缺少连接、schema 或迁移条件时启动失败，绝不回退到容器 SQLite。
- 同一业务组合写入必须在事务中完成。重复错题、重复复习完成和每日提醒使用唯一约束及幂等结果；竞争性更新返回可诊断的刷新重试错误。
- 首发受控内测从空 MySQL 开始。仅在明确要求保留旧 SQLite 数据时，才运行一次性、可校验、可重复执行的导入工具。
- MySQL 自动备份的恢复点目标为 24 小时、恢复时间目标为 4 小时。恢复演练、重部署和扩缩容验收只能在隔离环境使用虚构数据。
- 孩子或账户删除立即清除关系数据库记录。关联对象存储删除可由可重试清理任务最终完成，但删除后学习记录不得继续可访问。
- 会话按过期时间清理；脱敏运营审计记录应有明确保留期，且不含题干、作答、图片或任何凭证。
- schema 使用 `schema_migrations` 版本记录和顺序迁移；生产服务不得在未知或半完成版本上启动。
