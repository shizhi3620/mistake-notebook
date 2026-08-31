# 10 — 孩子档案省份字段兼容

**What to build:** 保留孩子档案省份信息作为未来教材/课程体系差异的预留维度，同时降低首版建档负担并兼容旧版本数据。

**Blocked by:** None — can start immediately

**Status:** superseded
**Superseded by:** ../../child-profile-region/issues/01-province-picker-and-textbook-visibility.md; ../../child-profile-region/issues/02-legacy-region-compatibility.md; ../../child-profile-region/issues/03-hide-textbook-version-v1.md

省份字段兼容工作已在 `child-profile-region` 主线完成；本文件保留为上线需求历史记录。

- [ ] 省份为可选字段，不选择省份也可以创建或更新孩子档案。
- [ ] 新版首页和设置页只提供省级选择器，不显示城市或区县。
- [ ] 新版请求只提交 `provinceCode` 和 `provinceName`（未选择时省份字段为空或省略）。
- [ ] 服务端继续接受旧客户端提交的省市字段；已有省市数据不删除。
- [ ] 读取旧省市档案时，页面只展示省份，不要求用户重新选择城市。
- [ ] 当前版本不根据省份改变识别、讲解、复习或额度逻辑。
- [ ] 增加 API、存储映射和端到端兼容测试。
