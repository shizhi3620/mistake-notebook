# 05: MySQL 拍题与确认纵向切片

**What to build:** 草稿、上传凭证、已确认题目、作业候选和正确练习证据在 MySQL 中持久化，失败时不留下可用的半成品。

**Blocked by:** 03 — MySQL 认证与档案纵向切片; 04 — 迁移拍题与作业调用方

**Status:** completed

## Comments

- 2026-08-30：异步领域入口和 HTTP 拍题/作业路径已存在并通过回归测试；MySQL 拍题实体真实集成、幂等和跨实例恢复仍待执行。
- 2026-08-31：真实 MySQL 验收发现并修复空 `candidates_json` 读取缺陷；作业记录读取和账户删除级联验证通过。
- 2026-08-31：通过异步 `LearningLoop` 完成手动拍题、确认题目和保存错题的真实 MySQL 链路验收。
- 2026-08-31：题目确认和作业候选确认已接入持久化 `Idempotency-Key`；相同 key 重试返回首次结果，上传凭证归属和单次消费继续受控。真实 MySQL schema v15、连接池重建恢复和跨账户测试通过，本 ticket 完成。

- [x] 拍题和作业实体覆盖 MySQL 存储契约。
- [x] 组合写入使用事务，重复请求可幂等处理。
- [x] 新实例恢复和跨账户不可访问测试通过。

## Scope consolidation

吸收原 `03-mysql-capture-and-confirmation.md` 的草稿、上传凭证、作业候选和恢复验收要求。

## Comments

- 2026-08-31：MySQL 适配器已覆盖草稿、上传凭证、题目、作业和确认数据写入；异步领域/HTTP 路径已有回归测试。真实 MySQL round-trip、幂等和跨实例恢复仍待目标环境验收。
