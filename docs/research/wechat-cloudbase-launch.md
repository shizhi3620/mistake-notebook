# WeChat CloudBase launch research

Research date: 2026-08-28. This note is a deployment decision aid, not an implementation change.

## Decision summary

- **Run the existing Node HTTP service in CloudBase Cloud Hosting (CloudRun).** It is the appropriate CloudBase compute product for a long-running/containerized Node service. Package the service with a Dockerfile, make it listen on `PORT`, expose a health endpoint, and use Cloud Hosting's deployment/traffic/rollout controls. Do not depend on the container filesystem for the database or uploaded images.
- **Upload photographs directly from the mini program to Cloud Storage using `wx.cloud.uploadFile`,** then submit the returned `fileID` to the service. The service must still authorize the parent, create and validate the allowed object name/prefix, and verify ownership before associating an object with a draft. Treat `fileID` as an opaque identifier; use temporary URLs only when a display/download URL is actually required.
- **Migrate SQLite to a managed relational database, initially TencentDB for MySQL.** CloudBase Database is a document database, not a relational SQLite replacement. A SQL migration keeps the current schema and SQL-shaped repository relatively close; connect Cloud Hosting to the database on a private network and keep credentials in CloudBase/hosting configuration rather than the mini program.

## Cloud Hosting: Node service

CloudBase Cloud Hosting is container-based and supports deploying a service from source configuration or an image; its service model supplies a domain and supports revisions, scaling and traffic management. The official CloudBase Cloud Hosting overview and deployment documentation are the governing references. A Node service should therefore be deployed as an HTTP container, rather than as a Cloud Function, because this repository already has an HTTP server and `/healthz` operational contract.

Recommended launch shape:

1. Build a Docker image for `src/server/start.ts` (or the produced JavaScript), bind to `0.0.0.0:$PORT`, and retain `/healthz` as the platform health check.
2. Configure Cloud Hosting environment variables/secrets for `WECHAT_APP_ID`, `WECHAT_APP_SECRET`, the LLM credential, and database connection. Never put these in `miniprogram/` or the image.
3. Point the mini program either at the Cloud Hosting service's supported call path or its registered HTTPS domain. If retaining `wx.request`, complete the required WeChat "request legal domain" registration; Cloud Hosting does not by itself waive mini-program domain controls.
4. Start with a single writable deployment only during migration validation. After moving state to managed services, enable normal Cloud Hosting scaling and use revision/traffic rollout for rollback.

Sources:

- [CloudBase Cloud Hosting introduction](https://docs.cloudbase.net/run/intro)
- [CloudBase Cloud Hosting deployment overview](https://docs.cloudbase.net/run/deploy/overview)
- [WeChat Mini Program Cloud Hosting guide](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/guide/container/)
- [Mini Program request legal-domain requirements](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html)

## Direct Cloud Storage upload and authorization

The Mini Program Cloud SDK provides `wx.cloud.uploadFile({ cloudPath, filePath })`; it uploads a local temporary file to Cloud Storage and resolves to a CloudBase `fileID`. Initialization requires `wx.cloud.init`, including the intended environment when an app has more than one. File metadata/URLs should be obtained with the supported Cloud Storage APIs rather than reconstructed from the object path.

For this app, use a server-issued, authenticated allocation endpoint before upload. It should create a draft and return an allowed prefix/name such as `private/{parentAccountId}/{draftId}/{nonce}.jpg`; upload the chosen image with that `cloudPath`; then call a completion endpoint containing the `fileID`. On completion, the service must verify the current parent owns the draft and that the reported object is inside the allocated prefix. This replaces the current base64 body transfer while preserving the domain-level upload credential semantics.

Security rules and access controls are part of the Cloud Storage environment configuration. Do not make the bucket or a general photos prefix public just to make the direct SDK upload work. Apply least-privilege rules to the photo prefix, prevent user-chosen cross-account paths, and have Cloud Hosting issue temporary download URLs or proxy authorized reads. The server-side/cloud-hosting credential can bypass the client-facing boundary, so authorization checks remain mandatory there. Log and regularly clean up uncompleted draft uploads.

Sources:

- [WeChat `wx.cloud.uploadFile` API](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/reference-sdk-api/storage/uploadFile.html)
- [WeChat Cloud Storage guide](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/guide/storage/)
- [CloudBase Storage overview](https://docs.cloudbase.net/storage/intro)
- [CloudBase Storage security rules](https://docs.cloudbase.net/storage/security)

## Persistent relational data

CloudBase's built-in Database is a document/NoSQL database. Its SDK and security-rule model are useful for applications designed around documents, but it is not a relational engine and is not a drop-in target for this application's joins, unique constraints, upserts and transaction-sensitive review scheduling. Reworking `SqliteLearningLoopStore` for it would be a data-model rewrite, not a SQLite migration.

For the current schema, provision a managed TencentDB relational instance, with **TencentDB for MySQL** as the conservative first option. MySQL preserves the current SQL approach and can use managed backup, monitoring and recovery rather than a Cloud Hosting local volume. Use a private/VPC connection from Cloud Hosting, restrict its security group/network access to the service, encrypt connections when supported by the selected configuration, and store its account/password as service secrets. PostgreSQL is also a valid managed TencentDB relational option only if the team chooses a deliberate SQL-dialect migration; it is not necessary merely to leave SQLite.

Migration constraints:

- SQLite's embedded single-file storage and locking model cannot safely be treated as shared durable storage across scaled/replaced containers. Exporting its file into a container image or attaching it to only one revision defeats Cloud Hosting availability and rollback expectations.
- Convert SQLite-specific DDL/behavior deliberately: numeric booleans, `INTEGER` millisecond timestamps, JSON stored as `TEXT`, `ON CONFLICT` statements, and all foreign-key/index choices need an explicit target schema and migration tool.
- The current DDL declares few foreign-key constraints and indexes; add the query-critical composite indexes and database-enforced referential constraints as part of the relational migration, after reconciling any existing data that violates them.
- Run a tested export/import, compare row counts and account-scoped queries, then perform a brief write freeze or dual-write/cutover. Keep an encrypted SQLite backup until the managed-database restore test has passed.

Sources:

- [CloudBase Database introduction](https://docs.cloudbase.net/database/intro)
- [TencentDB for MySQL product documentation](https://cloud.tencent.com/document/product/236)
- [TencentDB for PostgreSQL product documentation](https://cloud.tencent.com/document/product/409)

## Material uncertainties to resolve before implementation

1. CloudBase product availability, networking choices, and quotas vary by region, account type and current plan. Confirm that the selected Cloud Hosting environment and a TencentDB instance can be attached to the same VPC/region before committing the production environment.
2. The exact Cloud Storage rule syntax and whether a requested client operation is covered by the desired rule must be tested in a non-production environment with two distinct WeChat accounts. The authorization design above deliberately does not depend on an assumed rule syntax.
3. Confirm the current WeChat base-library/API availability for `wx.cloud.uploadFile` and whether the chosen Cloud Hosting invocation route changes the existing `wx.request` domain-registration requirement. The linked official API/guide are the source of truth at implementation time.
4. Check current object size/type quotas against camera originals and define client-side compression, MIME validation, retention and deletion requirements for children’s homework images before launch.
