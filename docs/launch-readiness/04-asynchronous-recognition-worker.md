# 异步识别 Worker 上线配置

云托管 `ctb` 仅创建任务和异步投递；DeepSeek 调用只能在独立的腾讯云函数中执行。函数入口为 `src/scf/recognition-worker.main`，异步事件内容为 `{ "taskId": "<uuid>" }`。

## 云托管环境变量

- `CLOUD_HOSTING=true`
- `RECOGNITION_WORKER_FUNCTION_NAME`：目标云函数名称。
- `SCF_REGION`：函数地域，例如 `ap-shanghai`。
- `TENCENTCLOUD_SECRETID`、`TENCENTCLOUD_SECRETKEY`：仅用于调用指定 SCF 函数的 CAM 子账号临时或轮换凭据。

调用身份最小权限只包含 `scf:InvokeFunction`，且资源限制为该 Worker 函数 ARN。不得将此凭据下发到小程序、提交仓库或写入日志。

## Worker 环境变量

Worker 需要与云托管使用同一生产 MySQL、对象存储环境和 DeepSeek 密钥：`MYSQL_HOST`、`MYSQL_PORT`、`MYSQL_DATABASE`、`MYSQL_USER`、`MYSQL_PASSWORD`、`MYSQL_SSL`、`CLOUDBASE_ENV`、`CLOUDBASE_REGION`、`DEEPSEEK_API_KEY`、`LLM_BASE_URL`、`RECOGNITION_MODEL`、`HOMEWORK_RECOGNITION_MODEL`。

Worker 的 CAM 角色仅授予读取本应用图片对象、访问应用 MySQL，以及异步重投递自身函数所需的 `scf:InvokeFunction` 权限。日志只记录任务 ID、状态、重试次数和耗时，不记录临时 URL、图片内容、openid、微信 code 或密钥。

## 发布与回滚

1. 先发布 Worker，并用一个测试任务确认它可读 MySQL 和对象存储、能写回 `succeeded` 或 `failed`。
2. 配置云托管投递变量后发布 `ctb`。`POST /api/recognition-tasks` 应在不等待模型的情况下返回 `202`。
3. 观察 `recognition_task_succeeded`、`recognition_task_retrying`、`recognition_task_failed` 事件及 MySQL `recognition_tasks` 状态。
4. 回滚时先把云托管回滚到上一稳定版，再停止或回滚 Worker；不要删除仍在运行任务的图片或任务记录。

图片和任务的到期清理由同一 Worker 的受控定时触发器执行。每天至少一次以事件 `{ "cleanup": true }` 调用 `src/scf/recognition-worker.main`：它先删除 `image_expires_at` 已到期的对象并记录 `image_deleted_at`，随后由运维清理任务在 7 天后调用 `RecognitionTaskStore.cleanup` 删除任务与审计数据。清理触发器使用独立最小权限身份，失败需告警并重试；不得删除已确认错题所沿用的对象。
