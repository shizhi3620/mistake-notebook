# 09 — 执行生产验收与小程序切换准备

**What to build:** 在备案域名启用前完成全链路生产验收、回滚验证和小程序切换清单，使新环境可以安全替代已销毁的微信云托管环境。

**Blocked by:** 06 — 接通新环境的异步识别任务 API 和小程序流程; 07 — 建立版本化发布与回滚链路; 08 — 建立 CLS 可观测性与密钥边界.

**Status:** ready-for-human

- [ ] 完成 API、学习闭环、小程序、Worker、COS、MySQL、NAT 与安全边界的全量自动化和受控端到端验收。
- [ ] 验证 CVM/SCF 私网 MySQL 访问、Worker COS 授权、DeepSeek NAT 出网、CLS 检索及 API/Worker 回滚。
- [ ] 形成备案完成后绑定域名、签发证书、配置小程序合法域名、发布体验版、验证登录与识别、再提交正式版本的切换清单。
- [ ] 验收确认不再依赖微信云托管、CloudBase Storage、临时隧道或公网 MySQL。
