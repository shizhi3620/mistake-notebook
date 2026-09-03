# 08 — 建立 CLS 可观测性与密钥边界

**What to build:** 让运维人员通过 CLS 关联 API、识别任务与 Worker 运行结果，同时确保生产密钥和未成年人学习数据不进入日志、镜像或小程序。

**Blocked by:** 02 — 部署 CVM HTTPS API 入口; 05 — 迁移异步识别 Worker 至普通腾讯云 COS.

**Status:** ready-for-human

- [ ] CLS 可检索 API 请求 ID、任务 ID、状态码、耗时、重试、COS 结果、Worker 错误类别和发布版本。
- [ ] 日志过滤或测试证明微信 code、openid、AppSecret、DeepSeek Key、COS 临时密钥、临时 URL、图片与完整模型响应不会被输出。
- [ ] API 与 Worker 在配置缺失、权限拒绝、网络超时和服务异常时产生脱敏且可关联的诊断事件。
- [ ] 生产配置仅由受限 CVM/SCF 运行身份读取，不写入 Docker 镜像、TCR 层、GitHub 日志、仓库或小程序。
