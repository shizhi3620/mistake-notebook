# 07 — 建立版本化发布与回滚链路

**What to build:** 让 API 镜像和 SCF Worker 按固定版本发布到新生产环境，并能识别当前运行版本和快速回滚到上一稳定版本。

**Blocked by:** 02 — 部署 CVM HTTPS API 入口; 05 — 迁移异步识别 Worker 至普通腾讯云 COS.

**Status:** ready-for-human

- [ ] GitHub Actions 构建 API 镜像并推送 TCR，生产部署只使用固定版本标签而非仅使用 `latest`。
- [ ] API 启动日志包含版本、分支、commit 与运行模式；Worker 发布包或版本可追溯到相同发布上下文。
- [ ] API 和 Worker 的上一稳定版本可被明确选择并完成回滚演练。
- [ ] 构建、部署和回滚流程不打印或持久化生产密钥。
