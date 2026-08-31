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

### Gray Release Limitation

The mini program currently calls the public HTTPS API through `wx.request` (see
`miniprogram/services/api.js`). Cloud Hosting gray percentages and gray users apply only
to `wx.callContainer`; public-domain requests always reach the current running revision.
Therefore a gray setting is not a public-user canary. Validate the new revision first,
then switch the current revision manually, run the smoke test again through the public
domain, and monitor production metrics with the previous revision ready for rollback.

Do not describe this as user-level gray release until the client is migrated to
`wx.callContainer` and the login, upload, timeout, and real-device flows are revalidated.

The Cloud Hosting process must set `CLOUD_HOSTING=true`. It refuses to start without a complete MySQL configuration; SQLite is for local development and migration only.

## Backup And Restore Drill

1. Use TencentDB for MySQL managed backups after the database migration ticket is complete.
2. Restore only into an isolated database instance, start an isolated Cloud Hosting revision, and verify `/healthz` plus a fictional-account login flow.
4. Record backup time, restore time, build version, database integrity result, operator and outcome. Do not record tokens, WeChat identities, child data or backup keys.

## Rollback

1. Keep the previous container image available before deployment.
2. Complete and verify a managed database backup before schema changes.
3. If health checks or the release smoke test fail, route traffic to the previous Cloud Hosting revision and record the incident.
