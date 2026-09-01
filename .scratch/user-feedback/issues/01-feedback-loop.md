# 01 — 首版用户反馈最小闭环

**What to build:** 实现单题讲解质量反馈、通用功能反馈和内容安全反馈的统一提交与内部处理闭环。

**Blocked by:** None — can start immediately

**Status:** superseded

**Superseded by:** 01-quality-feedback.md, 02-feature-feedback.md, 03-safety-feedback-and-processing.md

## Historical Acceptance Criteria

- [ ] 家长可对具体单题讲解提交“有帮助”或“有问题”反馈。
- [ ] “有问题”可选择题干、答案、讲解、难度，并支持 1–500 字说明。
- [ ] 家长可提交功能不好用、操作失败、功能建议或其他功能反馈，并记录页面与客户端版本。
- [ ] 家长可对具体讲解提交内容安全反馈；说明必填并进入独立高优先级状态视图。
- [ ] 反馈记录关联正确的家长账户、孩子档案、题目及讲解/模型/请求版本；跨账户不可访问。
- [ ] 反馈支持 `new`、`reviewing`、`resolved`、`rejected` 内部状态和备注审计；用户端只显示提交成功。
- [ ] 不接受新增反馈附件；反馈文本经过敏感信息与未成年人内容安全检测。
- [ ] 重复请求幂等，不创建重复反馈；HTTP 错误结构与现有接口一致。
- [ ] 领域公共接口和 HTTP seam 测试覆盖正常、校验失败、越权、幂等和安全检测失败场景。

## Notes

实现依据：`.scratch/user-feedback/spec.md`。首版不提供用户侧处理进度、通知或完整客服工单能力。
