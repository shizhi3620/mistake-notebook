# 受控内测发布与验收 Runbook

本清单用于真实微信、微信云托管、CloudBase、目标 MySQL 和真机环境。所有测试数据必须为虚构资料；日志和截图不得包含令牌、题图、题干或作答内容。

## 发布前自动化门槛

- 在 `math-mistake-notebook/` 执行 `npm run preflight`，统一运行以下检查。
- 在 `math-mistake-notebook/` 执行 `npm run check`。
- 执行 `npm test`，当前基线为 82 项测试全部通过。
- 使用目标 MySQL 配置执行幂等 schema migration、连接验证和服务优雅关闭验证。
- 执行 `npm run accept:mysql` 输出连接、TLS、schema 和关键表检查结果。
- 执行 `npm run accept:mysql-loop` 跑完整异步学习闭环、连接池重建恢复和测试数据清理。
- 确认 `CLOUD_HOSTING=true` 且缺少任一 `MYSQL_*` 配置时启动失败；不得回退 SQLite。
- 确认 `/healthz` 在数据库检查失败时返回 `503` 和 `storage_unavailable`。

## 微信与云托管

1. 在开发、内测、生产分别配置独立 AppID、密钥、API 域名和 CloudBase 环境；密钥只写入云托管密钥配置。
2. 使用真实微信临时登录凭证完成登录、会话恢复和过期重新登录。
3. 确认小程序只请求登记的 HTTPS API 域名，服务端日志不出现 `code`、openid、session token 或 AppSecret。
4. 发布一个可回滚版本，记录版本号、流量比例、回滚操作和责任人。
5. 按 `privacy-review-pack.md` 核对隐私指引、权限用途、客服渠道和内部签字记录。
6. 配置 `WECHAT_REMINDER_TEMPLATE_ID`、模板昵称/数量字段名和 `REMINDER_SCHEDULER_SECRET`；云定时任务使用 `POST /internal/reminders/dispatch` 与 `x-scheduler-secret`，不得把密钥写入 URL 或日志。

## 真机学习闭环

使用虚构孩子资料验证：登录、监护人确认、建档、拍照/相册、裁剪旋转、CloudBase 直传、识别修改、讲解、保存错题、复习、周报、提醒和手动录入降级。另测权限拒绝、弱网、图片过大、模型超时、失效会话、跨孩子隔离和删除后的旧入口。

## 数据与恢复

- MySQL 自动备份保留至少 7 天，并记录策略截图或配置导出。
- 在隔离环境恢复一份备份，核对账户、档案、题目、错题、复习和提醒记录数量及账户隔离。
- 记录 RPO 不超过 24 小时、RTO 不超过 4 小时的实际结果。
- 重新部署和扩缩容后重复读取同一虚构账户，确认不依赖容器本地文件系统。

## 放量判定

记录登录成功率、闭环成功率、识别可用率、错误率、单用户模型成本、删除完成率和 P0 事件数。未达到阈值时保持受控名单并执行回滚，不扩大流量。
