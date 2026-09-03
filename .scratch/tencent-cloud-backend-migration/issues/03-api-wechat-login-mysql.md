# 03 — 迁移 API 与微信登录至新 MySQL

**What to build:** 让小程序通过新 HTTPS API 使用原有微信登录、会话、孩子档案与学习闭环，并将所有业务数据写入新的私网 MySQL。

**Blocked by:** 01 — 建立普通腾讯云生产基础设施基线; 02 — 部署 CVM HTTPS API 入口.

**Status:** ready-for-human

- [ ] API 可在新 MySQL 初始化所需 schema，并在 CVM 私网连接失败时给出脱敏、可诊断的启动或健康状态。
- [ ] 微信 `code2Session`、会话签发、家长账户和孩子档案保持既有业务语义，AppSecret 仅在 API 运行环境中存在。
- [ ] 现有错题确认、复习、报告和反馈闭环在新 MySQL 上通过回归验证。
- [ ] 未携带会话、无效微信 code、越权孩子档案与数据库不可用场景遵守既有 API 合同且不泄漏敏感数据。
