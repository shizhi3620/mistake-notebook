# 腾讯云生产部署

## 前置条件

将 CVM、MySQL、COS、SCF 建在同一地域。MySQL 仅开放给 CVM 与 SCF 所在 VPC；SCF 配置 NAT 网关出网访问 DeepSeek。域名完成 ICP 备案后申请腾讯云免费 SSL 证书。

## 1. 最小权限身份

创建 API 子账号密钥：仅允许指定 COS Bucket 的 `PutObject`、`HeadObject`、`GetObject`、`DeleteObject`，以及指定 Worker 的 `scf:InvokeFunction`。创建 Worker 子账号密钥：仅允许该 Bucket 的 `GetObject`、`HeadObject`、`DeleteObject`。密钥只保存到 CVM `.env.production` 和 SCF 环境变量。

## 2. 部署 SCF

执行 `npm run build:worker`，压缩 `dist/recognition-worker/index.js` 为 ZIP 后上传至 Node.js 22 函数，处理函数 `index.main_handler`，超时 90 秒，内存 512 MB。函数配置私网 MySQL、NAT 出网；填写 `MYSQL_*`、`MYSQL_SSL=false`、`COS_*`、`DEEPSEEK_API_KEY`、模型变量。创建每日一次的定时触发器，事件为 `{ "cleanup": true }`。

## 3. 部署 CVM API

安装 Docker 与 Nginx。复制 `deploy/nginx/default.conf`，替换 `API_DOMAIN`，将证书置于 `/etc/nginx/certs/`。创建 `/opt/math-mistake-notebook/.env.production`，填写 `.env.example` 的微信、MySQL、COS、SCF、DeepSeek 环境变量，另设置 `PRODUCTION=true`、`MYSQL_SSL=false`。

从 TCR 拉取固定标签或 digest，设置 `API_IMAGE`，执行 `docker compose -f compose.production.yaml up -d`。验证 `curl -fsS https://API_DOMAIN/healthz` 返回 `{"status":"ok"}`；Nginx 只对外暴露 80/443，Node 3000 绑定 `127.0.0.1`。

## 4. 接入小程序

在小程序后台登记 `https://API_DOMAIN` 为 request 合法域名，重新生成 `miniprogram/config.private.js` 后上传体验版。依次验证登录、创建孩子、拍题、异步结果、家长确认、批改作业和删除账号。API 回滚到上一 TCR 固定标签；Worker 在 SCF 控制台回滚到上一版本。
