# 单台 CVM Docker MVP 部署教材

适用范围：尚无真实用户、低流量验证阶段。所有服务运行在一台 CVM；MySQL 数据放在独立云硬盘；图片仍放腾讯云 COS。该方案没有高可用，正式上线前应迁移到托管 MySQL 或拆分服务。

## 1. 购买与初始化

建议 CVM 至少 2 核 4 GB、Ubuntu 22.04/24.04 LTS。购买一块 SSD 云硬盘，挂载到 `/mnt/math-mistake-data`。不要在未确认设备名时执行 `mkfs`，格式化会删除盘上数据。

确认挂载持久化：

```bash
lsblk -f
df -h /mnt/math-mistake-data
cat /etc/fstab
```

安全组只开放 `22`（你的固定管理 IP）、`80` 和 `443`。不要开放 `3306`、`3000`。

## 2. 安装 Docker

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin git nginx
sudo systemctl enable --now docker
docker compose version
```

## 3. 准备代码和数据目录

```bash
sudo mkdir -p /opt/math-mistake-notebook
sudo chown "$USER":"$USER" /opt/math-mistake-notebook
cd /opt/math-mistake-notebook
git clone https://github.com/shizhi3620/mistake-notebook.git .
sudo APP_DIR=/opt/math-mistake-notebook DATA_DIR=/mnt/math-mistake-data \
  ./scripts/setup-cvm-mvp.sh
```

## 4. 创建 MVP 环境变量

```bash
sudo cp .env.example /opt/math-mistake-notebook/.env.mvp
sudo chmod 600 /opt/math-mistake-notebook/.env.mvp
sudoedit /opt/math-mistake-notebook/.env.mvp
```

至少填写：`WECHAT_APP_ID`、`WECHAT_APP_SECRET`、`DEEPSEEK_API_KEY`、`MYSQL_DATABASE`、`MYSQL_USER`、`MYSQL_PASSWORD`、`MYSQL_ROOT_PASSWORD`、`COS_SECRET_ID`、`COS_SECRET_KEY`、`COS_BUCKET`、`COS_REGION`。将 `MYSQL_HOST` 写成 `mysql`，`MYSQL_SSL=false`，`PRODUCTION=true`。同时配置 SCF 调用所需的 `TENCENTCLOUD_SECRETID`、`TENCENTCLOUD_SECRETKEY`、`SCF_REGION` 和 `RECOGNITION_WORKER_FUNCTION_NAME`。

## 5. 启动和验证

```bash
cd /opt/math-mistake-notebook
sudo MYSQL_DATABASE=math_mistake_notebook MYSQL_USER=mistake_app \
  docker compose -f compose.mvp.yaml up -d --build
docker compose -f compose.mvp.yaml ps
curl -fsS http://127.0.0.1:3000/healthz
docker compose -f compose.mvp.yaml logs --tail=100 api
```

预期健康检查返回 `{"status":"ok"}`。API 启动日志应包含 `service_started`、版本、分支和 commit。

## 6. Nginx 和 HTTPS

备案及证书完成后，复制 `deploy/nginx/default.conf`，把 `API_DOMAIN` 替换为真实域名，证书放入 `/etc/nginx/certs/`，然后：

```bash
sudo nginx -t
sudo systemctl reload nginx
curl -fsS https://你的域名/healthz
```

备案前仅做受控联调，不把临时隧道配置为小程序生产合法域名。

## 7. 备份与恢复

每天执行逻辑备份，并上传到 COS（命令中的 COS 上传工具和凭据按你的安全规范配置）：

```bash
mkdir -p /mnt/math-mistake-data/backups
docker exec math-mistake-notebook-mysql-1 sh -c \
  'exec mysqldump -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
  | gzip > /mnt/math-mistake-data/backups/mysql-$(date +%F).sql.gz
find /mnt/math-mistake-data/backups -type f -mtime +14 -delete
```

至少每月在临时数据库验证一次恢复。云硬盘快照不能替代异地备份。

## 8. 更新与回滚

```bash
cd /opt/math-mistake-notebook
git fetch origin && git checkout main && git pull --ff-only
docker compose -f compose.mvp.yaml up -d --build
docker compose -f compose.mvp.yaml ps
```

出现问题时回到上一个 commit，再执行同一条 `up -d --build`。升级前先备份数据库。

## 9. 迁移触发条件

出现真实付费用户、需要高可用、磁盘使用率超过 70%、MySQL CPU/内存持续高位或备份恢复无法按时完成时，停止在单机上扩展，迁移到 TencentDB/CynosDB，并保留当前 MySQL 连接变量作为兼容层。
