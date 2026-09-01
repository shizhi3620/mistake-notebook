# 02 Operations Runbook

## Deploy

The repository release gate is intentionally two-stage: GitHub Actions runs CI on pull
requests and pushes to `main`; production deployment is performed manually in the Cloud
Hosting console. Keep the console's production environment variables and secrets there;
do not copy them into GitHub Actions or the repository.

This deployment uses one Cloud Hosting pipeline only. Keep its source branch fixed to
`main`. Feature and test branches are validated by GitHub Actions and local Docker; do
not switch the production pipeline between branches during normal development. A
temporary branch switch is allowed only for an explicitly approved cloud build test and
must be followed by switching the pipeline back to `main` before any production release.

Create a version tag after review (for example `v1.0.0`). Wait for CI and the console's
image build to complete, then select the image built from that exact commit/tag in the
Cloud Hosting deployment image dropdown. Do not enable source-push auto-deploy for the
production service.

Before clicking release, the approver verifies the image commit/digest, migration plan,
backup status and rollback revision. The console release must create a new revision while
retaining the previous revision for rollback.

1. Create a CloudBase environment and deploy the HTTP container to Cloud Hosting.
2. Configure `WECHAT_APP_ID`, `WECHAT_APP_SECRET`, `DEEPSEEK_API_KEY` (when AI is enabled), and `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_SSL=true` as Cloud Hosting secrets.
3. Confirm `GET /healthz` through the registered Cloud Hosting HTTPS path.
4. Configure alerts from JSON request logs: any sustained HTTP 5xx rate or failed health probe pages the release owner.

After deployment, run `GET /healthz` and the fictional-account smoke test before routing
all traffic to the new revision. Keep the previous revision available and record the
release version, selected image, operator, approval and final traffic decision.

### Single-Environment Gray Release

The experience and release mini-program builds call Cloud Hosting through
`wx.cloud.callContainer`. Production routing is therefore controlled in the Cloud Hosting
console, not by a public/default domain or client-side version parameter.

1. Complete local Docker startup, database migration, type check and full automated test
   suite before creating a Cloud Hosting revision.
2. Bind the new revision to named acceptance users through the console's `openid`
   whitelist. Verify real-device login, photo upload, question confirmation, explanation,
   mistake creation, review, feedback, MySQL, Cloud Storage, health checks and JSON logs.
3. If verification passes, route 5% of traffic to the revision and observe health checks,
   HTTP 5xx rate, login failures, storage failures and cross-family access reports.
4. Repeat the same observation at 25%, then 100%, recording the time, revision, operator
   and decision at each stage. Close the release only after the 100% observation passes.
5. On any critical health, authorization, data-isolation, login, storage or sustained 5xx
   failure, immediately route traffic back to the previous revision, preserve relevant
   sanitized logs and record the rollback.

The release owner must re-confirm the service's public-access setting before each launch.
The app retains business authentication on every API route; public access is not a
substitute for session or operator authorization.

The Cloud Hosting process must set `CLOUD_HOSTING=true`. It refuses to start without a complete MySQL configuration; SQLite is for local development and migration only.

## Backup And Restore Drill

1. Use TencentDB for MySQL managed backups after the database migration ticket is complete.
2. Restore only into an isolated database instance, start an isolated Cloud Hosting revision, and verify `/healthz` plus a fictional-account login flow.
4. Record backup time, restore time, build version, database integrity result, operator and outcome. Do not record tokens, WeChat identities, child data or backup keys.

## Rollback

1. Keep the previous container image available before deployment.
2. Complete and verify a managed database backup before schema changes.
3. If health checks or the release smoke test fail, route traffic to the previous Cloud Hosting revision and record the incident.
