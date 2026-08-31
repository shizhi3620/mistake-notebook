# 01 — 真实微信登录与环境配置

**What to build:** 受控内测小程序可使用真实微信登录，并在不同环境中安全连接对应的 API 服务。

**Blocked by:** None — can start immediately

**Status:** ready-for-human

## Comments

- 2026-08-31：微信 code2session adapter、会话过期/恢复、日志脱敏和按 develop/trial/release 隔离的 HTTPS 配置均已实现并通过测试。下一步必须提供真实 AppID/AppSecret、登记域名并在真机完成登录冒烟。

- [ ] 服务端通过微信临时登录凭证完成身份交换，平台凭证和身份标识不返回客户端、不写入日志。
- [ ] 会话令牌可过期、可恢复，失效会话提供重新登录路径。
- [ ] 开发、内测和生产配置隔离；真实 AppID、密钥和生产地址不提交仓库。
- [ ] 小程序仅访问登记的 HTTPS API 域名，真机登录冒烟测试通过。
