# 03 — 私有图片存储与可恢复上传

**What to build:** 家长可在真机裁剪并上传单张题目图片到私有对象存储，失败时可恢复草稿或手动录入。

**Blocked by:** 01 — 真实微信登录与环境配置; 02 — 生产部署、持久化与运维基线; 09 — 腾讯云 MySQL 持久化迁移

**Status:** ready-for-human

- [x] 服务端为当前家长的草稿分配短时、单一对象的 CloudBase `cloudPath`，并通过存储适配器验证完成回调的 `fileID` 归属。
- [x] 客户端经 `wx.cloud.uploadFile` 直传；不持久保存 Base64，应用服务只处理已验证的 `fileID` 和必要元数据。
- [x] 上传完成后才允许识别和题目确认，失败、中断或取消不会创建空题目。
- [ ] 真机裁剪、重试和手动录入路径端到端可用。

## Implementation note

API 和小程序直传契约已实现并有 HTTP seam 测试。真实 CloudBase 存储 SDK、Bucket 规则和真机验证需在 `prod-d8giqy4sjc5925f68` 云托管环境接入后完成。

CloudBase 适配器现同时提供受控删除接口，为确认后原图清理和删除重试提供基础能力。

2026-08-31：修复真实 CloudBase fileID 契约：服务端先按家长、草稿、有效期校验 upload token，再要求 `cloud://` fileID 的对象路径与签发的单对象 `imageKey` 完全一致；验证成功后才消费凭证并把可删除的 fileID 写入题目。归属不匹配测试通过。
