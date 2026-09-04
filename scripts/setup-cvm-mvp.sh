#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/math-mistake-notebook}"
DATA_DIR="${DATA_DIR:-/mnt/math-mistake-data}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "请使用 root 或 sudo 运行此脚本。" >&2
  exit 1
fi

mkdir -p "$APP_DIR" "$DATA_DIR/mysql" "$DATA_DIR/backups"
chmod 700 "$DATA_DIR" "$DATA_DIR/mysql" "$DATA_DIR/backups"

if ! command -v docker >/dev/null 2>&1; then
  echo "未检测到 Docker，请先安装 Docker Engine 和 Compose 插件。" >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "未检测到 Docker Compose 插件。" >&2
  exit 1
fi

echo "目录已准备："
echo "  应用：$APP_DIR"
echo "  MySQL：$DATA_DIR/mysql"
echo "  备份：$DATA_DIR/backups"
echo "下一步：将仓库放入 $APP_DIR，并创建 $APP_DIR/.env.mvp。"
