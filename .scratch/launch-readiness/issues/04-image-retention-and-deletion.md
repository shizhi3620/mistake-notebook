# 04 — 图片保留、删除与清理任务

**What to build:** 照片和学习数据按明确期限保留，家长删除记录后关联对象最终清除且失败可恢复。

**Blocked by:** 03 — 私有图片存储与可恢复上传

**Status:** ready-for-human

## Implementation note

CloudBase 存储适配器已增加受控 `deleteUploadedFile` 接口，仅接受 `cloud://` file ID，并校验删除结果。

`src/image-retention.ts` 已提供原图（确认后立即）、裁剪图（365 天）、草稿（24 小时）的任务策略，以及最多 3 次失败重试和删除审计字段；接入生产任务调度仍待部署环境配置。

`LearningLoop` 异步删除错题时会在关系数据删除后调用注入的对象删除器；对象存储失败不阻塞数据删除，交由清理任务重试。

2026-08-31：孩子档案和家长账户异步删除会在关系删除前收集其错题图片 key，关系删除成功后逐个触发对象删除；单个对象失败不会恢复关系数据。领域测试覆盖孩子删除、账户删除和旧 session 失效。草稿图片继续由 24 小时 retention worker 清理。

2026-08-31：生产启动已把 CloudBase `deleteUploadedFile` 注入 `LearningLoop.imageDeleter`；真实上传保存 CloudBase fileID 而非仅保存 cloudPath，使单题、孩子和账户删除可调用实际对象删除 API。

- [x] 原图、裁剪图和临时草稿分别有冻结的保留期限和清理规则。
- [x] 默认原图在确认完成后删除，仅主动选择的已确认错误题裁剪图可长期保留。
- [x] 删除错题、孩子档案或家长账户会触发关联对象删除。
- [x] 清理失败可重试、可审计，重试不会恢复已删除的学习记录。
