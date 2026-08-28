# 02 Operations Runbook

## Deploy

1. Create a CloudBase environment and deploy the HTTP container to Cloud Hosting.
2. Configure `WECHAT_APP_ID`, `WECHAT_APP_SECRET`, `DEEPSEEK_API_KEY` (when AI is enabled), and database credentials as Cloud Hosting secrets.
3. Confirm `GET /healthz` through the registered Cloud Hosting HTTPS path.
4. Configure alerts from JSON request logs: any sustained HTTP 5xx rate or failed health probe pages the release owner.

## Backup And Restore Drill

1. Use TencentDB for MySQL managed backups after the database migration ticket is complete.
2. Restore only into an isolated database instance, start an isolated Cloud Hosting revision, and verify `/healthz` plus a fictional-account login flow.
4. Record backup time, restore time, build version, database integrity result, operator and outcome. Do not record tokens, WeChat identities, child data or backup keys.

## Rollback

1. Keep the previous container image available before deployment.
2. Complete and verify a managed database backup before schema changes.
3. If health checks or the release smoke test fail, route traffic to the previous Cloud Hosting revision and record the incident.
