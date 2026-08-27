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

环境变量：`PORT`（默认 3000）、`DATABASE_PATH`、`LLM_BASE_URL`、`EXPLANATION_MODEL`、`RECOGNITION_MODEL`。

小程序端：用微信开发者工具打开 `miniprogram/`（已关闭 urlCheck 便于本地调试），在本地 `project.config.json` 填入已获授权的小程序 AppID，`config.js` 中的 `apiBase` 指向上述服务。正式环境需替换为 HTTPS 域名并配置小程序合法域名。真实 AppID 不得提交到仓库。

## 测试

```bash
npm run check   # tsc --noEmit
npm test        # 43 个测试：领域层、适配器（注入 fetch）、HTTP 金路径
```
