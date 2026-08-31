# 07: HTTP 异步边界迁移

**What to build:** HTTP API 的所有学习闭环路由显式等待异步 `LearningLoop` 结果，并保持客户端响应和错误语义稳定。

**Blocked by:** 01 — 扩展可等待的学习存储 seam; 02 — 迁移认证与档案调用方; 04 — 迁移拍题与作业调用方; 04 — MySQL 错题、复习与提醒原子化

**Status:** completed

- [x] 所有 HTTP handler 对异步领域调用显式使用 `await`，不把 Promise 写入响应或学习状态。
- [x] 登录、档案、拍题、作业、错题、复习、提醒、周报和删除路由全部覆盖。
- [x] 成功响应结构保持兼容；存储故障统一返回 HTTP `503` 和 `storage_unavailable`。
- [x] 未认证、校验失败、竞争更新和重复请求保持稳定的状态码与错误结构。
- [x] HTTP 金路径、异步存储故障和账户隔离测试通过。

## Comments

- 2026-08-30：所有 HTTP 学习闭环 handler 已显式使用 `await`，成功响应结构保持兼容；领域层 Promise 化完成后还需补充真实异步存储端到端验证。
