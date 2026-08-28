# 02 Operations Runbook

## Deploy

1. Provision a host with Docker and a reverse proxy that terminates TLS for the registered API domain.
2. Set `WECHAT_APP_ID`, `WECHAT_APP_SECRET`, `DEEPSEEK_API_KEY` (when AI is enabled), and a persistent Docker volume in the deployment environment.
3. Start `docker compose up -d --build` and confirm `GET /healthz` returns `{"status":"ok"}` through the HTTPS domain.
4. Configure alerts from JSON request logs: any sustained HTTP 5xx rate, failed health probe, or unavailable persistent volume pages the release owner.

## Backup And Restore Drill

1. Stop writes or scale the application down before copying the SQLite database from the persistent volume.
2. Encrypt the copied backup with the environment-managed backup key before moving it off-host; never store the key beside the backup.
3. Restore only into an isolated volume, start an isolated application instance, and verify `/healthz` plus a fictional-account login flow.
4. Record backup time, restore time, build version, database integrity result, operator and outcome. Do not record tokens, WeChat identities, child data or backup keys.

## Rollback

1. Keep the previous container image available before deployment.
2. Back up the persistent volume before schema changes.
3. If health checks or the release smoke test fail, redeploy the previous image against the preserved volume and record the incident.
