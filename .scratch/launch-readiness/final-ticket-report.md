# Tickets 最终执行报告

日期：2026-08-31

## 总体状态

| 状态 | 数量 | 说明 |
| --- | ---: | --- |
| `completed` / `resolved` | 19 | 仓库内实现和自动验证完成 |
| `superseded` | 12 | 重复票已保留历史并指向 canonical replacement |
| `ready-for-human` | 10 | 仓库工作完成，必须在真实微信/云/生产环境执行 |
| `ready-for-agent` / `in-progress` | 0 | 无剩余 agent 可执行票 |

## 已完成主线

- 产品学习闭环 9 张：登录与档案、拍题确认、讲解与错题、错题本、复习、首页、周报、提醒、权益。
- 孩子省份兼容 3 张：省份选择、旧地区兼容、隐藏教材版本。
- MySQL/异步 7 张：全领域异步迁移、认证调用方、认证档案切片、拍题调用方、错题/复习/提醒原子化、拍题切片、HTTP 异步边界。
- 公共 `LearningLoop` 只暴露 Promise 入口；生产、HTTP、脚本和领域测试无同步调用。
- MySQL schema v15 加入跨实例 `Idempotency-Key` registry；重复成功返回首次响应，pending 竞争返回 409，失败释放 key。
- CloudBase fileID 与单对象 upload credential 绑定；真实 fileID 被持久化并用于单题、孩子和账户对象删除。
- 微信订阅提醒具备客户端主动授权、openid 反查、access-token 缓存、隐私安全模板 sender 和受共享密钥保护的调度端点。
- 设置页具备单题/孩子/账户删除；账户注销清除本地 token，旧 session 返回 401。
- AI 具备超时、有限重试、结构校验、租户限流和月度预算；虚构 `3+5` 真实讲解请求通过。

## 验证证据

- `npm run preflight`：通过。
- TypeScript 类型检查、小程序关键脚本语法、`git diff --check`：通过。
- 自动测试：82/82 通过。
- 本地真实 MySQL 8.4：reachable，schema 15，关键表 10。
- MySQL 完整闭环：监护确认、题目确认、复习完成、连接池重建恢复、微信身份恢复、幂等回放均为 true。
- 真实 AI 文本讲解：提示、思路、步骤、答案、变式题和知识点建议结构完整。

## 人工外部验收顺序

1. `launch-readiness/01`：配置真实 AppID/AppSecret 和登记 HTTPS 域名，真机登录、恢复、过期重登。
2. `mysql-persistence/05`：云托管连接生产 TLS/私网 MySQL，验证启动失败不回退 SQLite。
3. `launch-readiness/02`：部署云托管版本，配置健康检查、日志、告警、流量和回滚。
4. `launch-readiness/03`：配置真实 CloudBase 私有存储规则，真机上传、弱网重试和手动录入。
5. `launch-readiness/04`：配置 retention scheduler，验证原图、草稿、裁剪图和删除重试审计。
6. `launch-readiness/05`：用匿名题图验收集运行识别/讲解/变式，核对模型账单与日志脱敏。
7. `launch-readiness/06`：配置真实订阅模板、字段名和云定时任务，真机授权/拒绝/收信。
8. `mysql-persistence/08`：启用至少 7 天托管备份，在隔离环境恢复并记录 RPO/RTO。
9. `launch-readiness/07`：填写主体、客服、供应商和政策信息，完成合规签字及平台审核。
10. `launch-readiness/08`：按 runbook 完成真机 E2E、异常矩阵、指标阈值、受控放量和回滚。

## 外部所需输入

- 微信小程序主体、AppID/AppSecret、登记域名、订阅模板及字段名。
- 云托管环境、发布权限、scheduler secret、告警和流量配置权限。
- CloudBase 环境、私有 Bucket/文件权限和临时云凭据。
- 生产 MySQL TLS/私网连接、备份与隔离恢复权限。
- 匿名题图验收集、AI 供应商账单/条款和合规负责人。
- 至少一台真机、受控内测名单、发布/回滚负责人。

执行细节见 `acceptance-runbook.md`，隐私审核材料见 `privacy-review-pack.md`。
