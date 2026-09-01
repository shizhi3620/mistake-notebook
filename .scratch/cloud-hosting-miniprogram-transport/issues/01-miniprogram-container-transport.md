# 01 — 小程序云托管传输切换

**What to build:** 让开发版继续通过本地 Docker 的 HTTPS API 工作，同时使体验版和正式版通过微信云托管调用生产环境的 `ctb` 服务；登录、学习请求、Bearer session 与幂等提交在用户侧保持原有行为。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] 开发版使用私有 HTTPS API 配置，体验版和正式版使用 `callContainer` 调用 `prod-d8giqy4sjc5925f68` 中的 `ctb`。
- [x] 体验版和正式版请求保留 `/api` 路径、HTTP 方法、JSON body、Bearer token 与 `Idempotency-Key` 语义，并发送正确服务标识。
- [x] 微信登录交换、session 保存、session 失效后的单次重新登录与现有用户体验一致。
- [x] 私有配置示例清楚区分开发 API 地址与云托管服务配置，不提交凭证或生产 API 域名。
