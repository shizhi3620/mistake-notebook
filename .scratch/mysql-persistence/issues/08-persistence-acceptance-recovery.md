# 08: 持久化验收与恢复演练

**What to build:** 发布负责人使用虚构数据完成全量持久化验收、重启/扩缩容恢复、备份恢复演练和失败回滚记录。

**Blocked by:** 05 — 生产 MySQL 启动与迁移切换

**Status:** ready-for-human

## Comments

- 2026-08-30：本地类型检查与 64 项自动化测试均通过。已启动隔离 MySQL 8.4 容器，真实 schema migration、连接 ping、连接池关闭和容器重启后的 ping 均通过。备份恢复及 RPO/RTO 演练仍需补充自动化脚本或生产级存储环境。
- 2026-08-30：新增 MySQL 事务回滚与复习原子提交回归测试，自动化总测试数增至 67 项并全部通过；备份恢复和 RPO/RTO 仍为人工验收项。
- 2026-08-30：发布验收 runbook 已补充自动化门槛、目标 MySQL 恢复核对、RPO/RTO 和重部署验证步骤；真实备份恢复仍待目标环境执行。
- 2026-08-31：使用本地 MySQL 8.4 完成 14 版 schema migration 和账户/档案真实 round-trip；跨账户隔离通过。备份恢复、扩缩容和 RPO/RTO 仍待执行。
- 2026-08-31：重启 `math-mistake-mysql` 容器后连接验证和 14 版 schema 读取通过，证明 schema 状态不依赖进程内存；完整业务数据重启恢复及备份演练仍待执行。
- 2026-08-31：异步 `LearningLoop` 完整学习闭环在真实 MySQL 上通过，测试账户已清理；重启后业务数据恢复、备份和 RPO/RTO 仍待执行。
- 2026-08-31：关闭并重建 MySQL 连接池后账户/孩子档案仍可读取；并行提交两次复习更新后保留首次完成结果，测试数据已清理。
- 2026-08-31：新增 `scripts/check-mysql-acceptance.ts`，可在目标环境输出脱敏的连接、TLS、schema 版本和关键表检查 JSON。
- 2026-08-31：新增 `scripts/mysql-learning-loop-acceptance.ts`，可重复执行异步登录至复习闭环、连接池重建读取和测试账户清理。

- [ ] 全量领域、HTTP、MySQL 集成、账户隔离、事务回滚和幂等测试通过。
- [ ] 隔离环境完成重启/扩缩容恢复、健康检查故障和至少 7 天备份验证。
- [ ] 达到 RPO 24 小时、RTO 4 小时，代码审查无高严重度问题后以单一聚焦 commit 提交。

## Scope consolidation

吸收原 `06-mysql-persistence-acceptance.md` 的完整学习闭环、账户隔离、健康检查故障和发布验收要求。
