# 数学错题本

微信小程序后端采用普通腾讯云部署：小程序 HTTPS API、CVM 上 Docker Node.js、私网 MySQL、私有 COS 与异步 SCF 图像识别 Worker。产品规格见 `requirements/`，生产迁移基线为 `PRD-004`。

## 本地运行

```bash
npm install
cp .env.example .env
npm start
```

本地仅需配置微信登录与 DeepSeek；若验证 COS 异步识别，还需配置 `.env.example` 中的 MySQL、COS、SCF 环境变量。密钥不得提交到 Git。

## 小程序配置

小程序仅使用 HTTPS API。运行以下命令生成被忽略的 `miniprogram/config.private.js`：

```bash
MINIPROGRAM_DEVELOP_API_BASE=https://api.example.com/api \
MINIPROGRAM_TRIAL_API_BASE=https://api.example.com/api \
MINIPROGRAM_RELEASE_API_BASE=https://api.example.com/api \
npm run configure:miniprogram
```

在小程序后台把备案并启用 TLS 的 API 域名配置为合法 request 域名；COS 不需要配置为小程序业务域名，因为上传使用 API 签发的短期签名 URL。

## 验证与发布

```bash
npm run preflight
npm run build:worker
```

`dist/recognition-worker/index.js` 是 SCF Node.js 22 入口，处理函数配置为 `index.main_handler`。CVM、COS、SCF、MySQL 与域名的完整部署顺序见 `docs/launch-readiness/05-tencent-cloud-production-deployment.md`。
