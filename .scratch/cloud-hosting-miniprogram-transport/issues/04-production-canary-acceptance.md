# 04 — 生产灰度验收与发布结单

**What to build:** 在唯一生产环境中安全验证待发布云托管版本，使测试家长可完成真实登录与核心学习闭环，发布负责人据此完成灰度上线结单或回退记录。

**Blocked by:** 03 — 单生产环境灰度发布操作基线

**Status:** ready-for-agent

## Prerequisites

This ticket requires Cloud Hosting console access, a controlled test `openid`, and the
production MySQL and Cloud Storage resources. It is intentionally left open for the
release owner after the repository changes are deployed.

- [ ] 指定测试 `openid` 能通过体验版或正式版调用待发布云托管版本，并完成登录、拍题、讲解、错题沉淀、复习和反馈核心链路验证。
- [ ] 验证真实数据库、照片存储、服务日志、健康检查和业务错误处理符合上线预期，且没有跨家庭数据暴露。
- [ ] 按发布清单完成 5%、25%、100% 灰度观察；出现关键异常时执行并记录回退。
- [ ] 发布结束后记录最终服务版本、灰度结论、已知风险和回退定位信息。
