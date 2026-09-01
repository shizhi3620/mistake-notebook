# 02 — 通用功能反馈

**What to build:** 家长可以从设置/帮助或首页提交对拍题、错题本、复习、提醒等功能的使用反馈，而无需绑定某一道题。

**Blocked by:** None — can start immediately

**Status:** done

- [x] 家长可提交 `usability`、`operation_failure`、`feature_request` 或 `other` 功能反馈。
- [x] 反馈记录提交页面、客户端版本、家长账户、当前孩子档案（如有）和提交时间。
- [x] 功能反馈不要求题目或讲解关联；说明文字可选，长度限制为 1–500 字。
- [x] 不接受新增附件，并提供不要填写姓名、学号、电话等个人信息的提示。
- [x] 跨账户不可读取或管理其他家庭的功能反馈。
- [x] 重复请求按 `Idempotency-Key` 返回首次结果，不创建重复反馈。
- [x] `LearningLoop` 公共接口和 HTTP seam 覆盖四种分类、上下文记录、校验、越权和幂等场景。
