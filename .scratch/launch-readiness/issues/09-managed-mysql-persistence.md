# 09 — 腾讯云 MySQL 持久化迁移

**What to build:** 学习闭环在腾讯云 MySQL 中可靠保存家长账户、孩子档案、已确认批改结果、错题和复习数据，使云托管实例替换或扩容不会丢失数据。

**Blocked by:** 02 — 生产部署、持久化与运维基线

**Status:** superseded
**Superseded by:** ../../mysql-persistence/issues/03-mysql-auth-profile-slice.md; ../../mysql-persistence/issues/05-mysql-capture-slice.md; ../../mysql-persistence/issues/04-mysql-mistakes-reviews-and-reminders.md; ../../mysql-persistence/issues/05-production-mysql-startup.md; ../../mysql-persistence/issues/08-persistence-acceptance-recovery.md

该总括性 MySQL ticket 已拆分并合并到 `mysql-persistence` 下的认证/档案、拍题、错题复习、生产启动和验收 canonical tickets；保留本文件作为上线需求历史记录。

- [ ] 生产服务使用腾讯云 MySQL 8.0 作为唯一持久化数据源，SQLite 仅用于本地开发和测试；禁止生产回退 SQLite。
- [ ] 为现有 `LearningLoopStore` 提供 MySQL 实现，覆盖账户、会话、档案、题目、错题、复习、提醒和作业数据，并保持业务接口行为不变。
- [ ] 生产启动根据 `MYSQL_*` 配置创建 MySQL 存储；连接失败或 schema 未初始化时启动失败，不接受静默降级。
- [ ] 启动时执行幂等 schema 初始化和版本化增量迁移；使用 TLS 和连接池，凭证只存于云托管密钥配置。
- [ ] 若仍可取得旧 SQLite 文件，执行一次性迁移并核对行数、账户范围查询和学习闭环金路径；迁移不是上线阻塞项。
- [ ] 为目标数据库建立托管备份、恢复到隔离环境的演练及发布前加密 SQLite 备份。
- [ ] 迁移后云托管扩缩容或重新部署不会丢失数据，也不依赖容器本地文件系统。
