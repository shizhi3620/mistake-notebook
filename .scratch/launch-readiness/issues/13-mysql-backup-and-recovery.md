# 13 — MySQL 备份与恢复验收

**What to build:** 生产 MySQL 具备可验证的备份、恢复和发布后数据完整性流程。

**Blocked by:** 12 — 生产切换到 MySQL

**Status:** superseded
**Superseded by:** ../../mysql-persistence/issues/08-persistence-acceptance-recovery.md

备份、恢复和发布后完整性验收已并入 `mysql-persistence/issues/08-persistence-acceptance-recovery.md`，避免重复维护。

- [ ] 启用至少 7 天自动备份并记录保留策略。
- [ ] 在隔离环境完成一次恢复演练，核对账户、档案和学习闭环关键数据。
- [ ] 发布清单包含重部署持久化验证和失败回滚步骤。
