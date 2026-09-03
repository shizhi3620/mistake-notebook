# 01 — 建立普通腾讯云生产基础设施基线

**What to build:** 建立可承载家长作业讲解与错题本的全新腾讯云生产资源，使 API、异步识别和图片存储拥有明确、受限且可验证的网络与权限边界。

**Blocked by:** None — can start immediately.

**Status:** ready-for-human

- [ ] CVM、VPC、私网 TencentDB/CynosDB、私有 COS Bucket、SCF 与 NAT 在同一地域创建完成，且不依赖已销毁的微信云托管资源。
- [ ] MySQL 不提供公网入口；CVM 与 SCF 仅通过私网访问 MySQL；SCF 可经 NAT 访问 DeepSeek。
- [ ] COS 与 SCF/CVM 所需 CAM 角色遵循最小权限，且临时授权、数据库和图片不依赖 CVM 本地磁盘。
- [ ] 安全组仅开放 HTTPS/证书校验、受控 SSH 和必要私网数据库流量，并形成可复核的资源与权限清单。
