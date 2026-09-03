# 05 — 迁移异步识别 Worker 至普通腾讯云 COS

**What to build:** 让 SCF Worker 以任务 ID 为输入，安全读取 COS 图片、调用 DeepSeek、写回新 MySQL，并在可恢复故障时完成受控重试和过期清理。

**Blocked by:** 01 — 建立普通腾讯云生产基础设施基线; 04 — 实现 COS 受限直传图片闭环.

**Status:** ready-for-human

- [ ] Worker 使用独立最小 CAM 角色读取仅任务所需的 COS 对象、私网连接 MySQL，并通过 NAT 调用 DeepSeek。
- [ ] Worker 只接收任务 ID，原子领取 `pending` 任务，写回成功、失败、尝试次数、耗时与脱敏错误代码。
- [ ] 超时、网络、429 和 5xx 最多自动重试两次；不可恢复输入或授权错误直接失败且不泄漏底层凭据。
- [ ] 临时任务图片与过期任务记录能按保留策略清理，且不删除既有规则中需长期保留的确认错题图片。
