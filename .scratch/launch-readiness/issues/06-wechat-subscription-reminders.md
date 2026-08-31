# 06 — 微信订阅提醒生产闭环

**What to build:** 家长主动授权后收到隐私安全、低频的待复习提醒，提醒故障不影响学习状态。

**Blocked by:** 01 — 真实微信登录与环境配置; 02 — 生产部署、持久化与运维基线

**Status:** ready-for-human

- [x] 小程序可请求并记录订阅消息授权，家长可关闭或撤回。
- [x] 定时任务只为开启提醒的孩子评估待复习事项，每个自然日最多发送一条。
- [x] 模板只包含昵称、待复习数和安全跳转路径，不含题目或作答内容。
- [x] 发送失败、未授权或调度异常不改变复习状态，失败不会无限重试。

## Implementation note

异步 `reminderSender` 已被正确等待；发送 Promise 失败会记录 `failed`，当天不重复发送且不改变复习计划。真实微信订阅授权、模板配置和生产调度仍待外部环境验收。

2026-08-31：设置页开启提醒时调用 `wx.requestSubscribeMessage`；仅平台返回 `accept` 才保存启用状态，拒绝、异常或模板未配置均保持关闭。模板 ID 按 develop/trial/release 写入私有配置，不提交真实 ID。生产定时任务和真实模板发送仍待云环境执行。

2026-08-31：新增微信订阅消息 sender（access token 缓存、openid 反向解析、模板字段最小化）和受 `x-scheduler-secret` 保护的 `/internal/reminders/dispatch`。生产启用模板时强制配置 scheduler secret 与模板字段名。79 项全量测试通过；真实模板 ID、云托管定时触发和真机授权/收信转人工验收。
