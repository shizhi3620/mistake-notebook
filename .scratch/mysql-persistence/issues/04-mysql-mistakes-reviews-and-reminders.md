# 04: MySQL 错题、复习与提醒原子化

**What to build:** 家长保存错题、完成复习和开启提醒后，学习计划、掌握状态和每日提醒在重试、并发和重启后保持一致，不产生重复记录。

**Blocked by:** 01 — 扩展可等待的学习存储 seam; 03 — MySQL 认证与档案纵向切片; 05 — MySQL 拍题与确认纵向切片

**Status:** completed

## Comments

- 2026-08-30：MySQL 适配器已增加错题+首个复习计划原子创建，以及复习计划、掌握状态和复习结果原子更新；回滚和事务覆盖测试通过。完整真实 MySQL round-trip、幂等键和并发冲突验收仍待执行。
- 2026-08-31：复习结果 SQL 更新增加完成态保护，重复回放不会覆盖首次完成结果；唯一约束和提醒日幂等已在 schema/适配器层验证。
- 2026-08-31：通过异步 `LearningLoop` 完成错题保存、启动复习、完成复习和首页读取的真实 MySQL 链路验收；提醒调度和并发压力仍待执行。
- 2026-08-31：真实 MySQL 并行复习更新验收通过，完成态条件更新保留首次结果，避免重复请求覆盖。
- 2026-08-31：提醒生产 sender 所需的微信身份反向查询已加入 MySQL store；连接池重建后的真实验收输出 `identityRestored:true`。
- 2026-08-31：新增 schema v15 `idempotency_records`、跨实例 MySQL registry 和 HTTP 幂等包装。真实 MySQL 输出 `idempotencyReplay:true`；HTTP 测试覆盖首次响应回放与 pending 竞争返回 409，小程序写请求自动携带并在 401 重试时复用 key。82 项 preflight 通过，本 ticket 完成。

- [x] 错题与复习计划、复习完成结果和提醒发送记录在 MySQL 中持久化。
- [x] 组合写入使用事务；重复错题、重复复习完成和每日提醒以幂等结果处理。
- [x] 事务回滚、并发重试和重启恢复有验收测试。
- [x] 新客户端支持 `Idempotency-Key`，旧客户端按资源 ID、复习 ID 和日期键兼容幂等。
- [x] 重复请求返回首次成功结果，竞争性更新返回 `409`，不产生部分状态。

## Scope consolidation

同时负责错题、复习、周报、提醒和删除调用方的全链路异步迁移；吸收原 `06-migrate-learning-callers.md` 的错误语义和回归要求。
