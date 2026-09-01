# 数学错题本（math-mistake-notebook）

面向家长的微信小程序：拍数学错题 → 年级适配的引导式讲解 → 错题本 → 艾宾浩斯复习闭环 → 周报与薄弱点。规格见 `../.scratch/wechat-math-mistake-notebook/`。

## 目录结构

- `src/learning-loop.ts` — 领域层（`LearningLoop`），覆盖工单 01–09 的全部产品规则；存储经 `LearningLoopStore` 接口注入。
- `src/sqlite-learning-loop-store.ts` — SQLite 存储实现（`better-sqlite3`）。
- `src/adapters/openai-compatible-explanation.ts` — 真实讲解适配器（OpenAI 兼容端点；默认 DeepSeek `deepseek-chat`）。
- `src/adapters/openai-compatible-recognition.ts` — 真实图片识别适配器（视觉模型；默认 `deepseek-v4-flash-vision-exp`）。
- `src/server/http-server.ts` — 会话鉴权的 JSON API（`createLearningLoopServer`）。
- `src/server/start.ts` — 生产入口：SQLite + DeepSeek 适配器 + HTTP 服务。
- `miniprogram/` — 微信小程序客户端（首页/拍题/确认/讲解/复习/错题本/周报/我的）。
- `scripts/try-explanation.ts`、`scripts/try-recognition.ts` — 适配器实连调试脚本。

## 运行

```bash
npm install
export DEEPSEEK_API_KEY="sk-..."   # 讲解与识别（可选，不设置则禁用）
npm start                          # http://127.0.0.1:3000
```

环境变量：`WECHAT_APP_ID`、`WECHAT_APP_SECRET`（启动服务必需），以及 `PORT`（默认 3000）、`DATABASE_PATH`、`APP_VERSION`（首版为 `0.1.0`）、`EXPLANATION_VERSION`（首版为 `explanation-v1`）、`EXPLANATION_REQUEST_VERSION`（首版为 `explanation-request-v1`）、`LLM_BASE_URL`、`EXPLANATION_MODEL`、`RECOGNITION_MODEL`。云托管照片识别还需配置 `CLOUDBASE_ENV=prod-d8giqy4sjc5925f68` 和 `CLOUDBASE_REGION=ap-shanghai`。`DEEPSEEK_API_KEY` 仍可选；未设置时题目识别与讲解不可用。

小程序端：用微信开发者工具打开 `miniprogram/`，在本地 `project.private.config.json` 填入已获授权的小程序 AppID。为开发、体验和正式环境配置已登记的 HTTPS API 域名后，执行：

```bash
MINIPROGRAM_DEVELOP_API_BASE=https://dev-api.example.com/api \\
MINIPROGRAM_TRIAL_API_BASE=https://trial-api.example.com/api \\
MINIPROGRAM_RELEASE_API_BASE=https://api.example.com/api \\
npm run configure:miniprogram
```

该命令生成 Git 忽略的 `miniprogram/config.private.js`；小程序会按环境读取对应域名并初始化 CloudBase 环境 `prod-d8giqy4sjc5925f68`，且已启用微信合法域名校验。真实 AppID、AppSecret、生产地址和本地调试地址均不得提交到仓库。真机登录验收步骤见 `docs/launch-readiness/01-wechat-login-smoke.md`。

## 测试

```bash
npm run check   # tsc --noEmit
npm test        # 53 个测试：领域层、适配器（注入 fetch）、HTTP 全路径
```

## 受控内测部署

`compose.yaml` 仅用于本地开发。受控内测部署目标是微信云托管，学习数据迁移至腾讯云 MySQL，照片使用 CloudBase 云存储；健康检查路径为 `/healthz`。运行、备份恢复和回滚步骤见 `docs/launch-readiness/02-operations-runbook.md`，平台决策依据见 `docs/research/wechat-cloudbase-launch.md`。
