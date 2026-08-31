# 12 — 生产切换到 MySQL

**What to build:** 云托管服务启动时根据密钥配置连接 MySQL，初始化 schema，并拒绝使用临时容器文件保存生产数据。

**Blocked by:** 11 — MySQL 持久化存储实现

**Status:** superseded
**Superseded by:** ../../mysql-persistence/issues/05-production-mysql-startup.md

生产切换要求已并入 `mysql-persistence/issues/05-production-mysql-startup.md`，由单一 canonical ticket 管理 MySQL-only 启动、迁移、健康检查和优雅关闭。

- [ ] 生产环境使用 MySQL 存储，本地环境仍可显式使用 SQLite。
- [ ] 缺少或错误的 MySQL 配置、TLS 或 schema 时服务启动失败并输出可诊断错误。
- [ ] 重部署、重启和扩缩容后同一微信用户仍能读取原有档案和学习数据。
- [ ] 凭证不会出现在仓库、响应或日志中。
