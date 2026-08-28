# WeChat CloudBase Launch Research

Research date: 2026-08-28. Sources below are Tencent CloudBase's official
documentation. This is an implementation decision record, not a substitute for
the environment console's region, quota, and price configuration.

## 1. Node service through WeChat Cloud Hosting

CloudBase Cloud Hosting ("云托管") is suitable for running the existing Node
HTTP service as a container. The official Node quick start has the application
listen on a service port, supplies a `Dockerfile`, and deploys with
`tcb cloudrun deploy`; the CLI packages the application image and deploys it.
[Node.js quick start](https://docs.cloudbase.net/run/quick-start/dockerize-node)

For console source deployment, the source directory **must contain a
Dockerfile**. The operator uploads the source folder, supplies the real service
port and Dockerfile location/name, deploys, then verifies through the generated
default domain.
[Deploy from source](https://docs.cloudbase.net/run/deploy/deploy/deploying-source-code)

For a WeChat mini-program, initialize `wx.cloud`, then invoke the service with
`wx.cloud.callContainer` and `X-WX-SERVICE: <service-name>`. By default, a
mini-program may call only Cloud Hosting services in the CloudBase environment
associated with that mini-program. The official guide recommends disabling
public access when only mini-program/official-account callers are needed;
`callContainer` then remains available and avoids configuring a mini-program
server domain. Cross-environment use requires environment sharing and is
limited to mini-programs under the same entity.
[Mini-program access to Cloud Hosting](https://docs.cloudbase.net/run/develop/access/mini)

Operational implication: configure the Node listener port as the Cloud Hosting
service port and keep credentials/configuration in environment variables. Do
not expose an unrestricted public HTTP endpoint merely to serve the
mini-program.

## 2. Direct mini-program upload to Cloud Storage

CloudBase traditional Cloud Storage is backed by Tencent COS. Its documented
upload path is: client SDK obtains a signature and uploads directly to COS.
Cloud Storage integrates with CloudBase identity authentication and security
rules; file IDs may be stored in the database.
[Cloud Storage overview](https://docs.cloudbase.net/storage/introduce)

The mini-program operation itself is `wx.cloud.uploadFile({ cloudPath,
filePath })`, which returns a CloudBase `fileID`; initialise the intended
environment first with `wx.cloud.init`. Treat that `fileID` as opaque rather
than constructing COS URLs from the selected path.
[WeChat Mini Program uploadFile API](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/reference-sdk-api/storage/uploadFile.html)

For the traditional mode, `_openid` determines file ownership. The managed
basic policies include private read/write (only creator and administrator) and
public read with creator/admin write. The official documentation cautions that
private-file URLs cannot simply be embedded in the front end, and public-read
files must not contain sensitive data.
[Basic storage permissions](https://docs.cloudbase.net/storage/data-permission)

Use custom security rules where the fixed policies are insufficient. They are
file-level `read`/`write` expressions and apply only to client requests:
console and server-side access always have full file access. Rule changes take
one to three minutes to take effect. The documentation explicitly warns to
assess rules before release because public rules can leak data.
[Storage security rules](https://docs.cloudbase.net/storage/security-rules)

Recommended launch posture for homework/photo uploads:

- Put client uploads under an opaque, user-scoped prefix such as
  `submissions/<openid>/<uuid>`, without treating the path as authorization.
- Set default storage policy/rules to authenticated owner-only read/write.
  Never let the mini-program write to a shared public prefix.
- Have the trusted Cloud Hosting service validate the resulting `fileID`,
  ownership, MIME type, size, and business record before recognition or
  grading. Server-side SDK access bypasses client storage rules, so it is the
  authorization boundary for privileged reads.
- Use a separate, intentionally public location only for assets designed to be
  public. Do not use a public file URL for submitted work.

## 3. Replacing SQLite with persistent relational storage

SQLite stored in a Cloud Hosting container is not a persistence option. The
official local-storage page says local storage is per-instance, lasts only for
the instance lifecycle, is isolated across instances, and is cleared when an
instance is reclaimed/destroyed. It recommends a database for structured
persistent data.
[Cloud Hosting temporary storage](https://docs.cloudbase.net/run/deploy/configuring/storage/local)

### Preferred option: CloudBase PostgreSQL environment

CloudBase PostgreSQL offers complete SQL features: tables, views, foreign keys,
indexes, transactions, triggers, stored procedures, CTEs, and more. It uses
table-level `GRANT` plus row-level RLS policies. In a PostgreSQL-version
CloudBase environment, the PostgreSQL database is enabled automatically.
[CloudBase PostgreSQL overview](https://docs.cloudbase.net/database/postgresql/initialization)

Cloud Hosting/other back ends can connect through the PostgreSQL protocol; this
path is specifically documented for complex SQL, transactions, batch work, and
connection pooling. Use an application-specific least-privileged DB account,
keep credentials in Cloud Hosting environment variables/secrets, prefer
same-region/internal networking, use SSL according to the console requirement,
and reuse a bounded global connection pool rather than creating one per
request.
[Connecting to PostgreSQL](https://docs.cloudbase.net/database/postgresql/connecting-to-postgresql)

This is the closest CloudBase-native migration target for a relational SQLite
schema. Translate SQLite DDL, types, and query dialect deliberately; do not
assume the SQLite database file can be mounted or used concurrently by scaled
instances. Add RLS only when exposing tables to client SDK/REST callers; for a
server-only data path, retain least-privilege service credentials and do not
publish those credentials to the mini-program.

### Alternative: CloudBase MySQL / TencentDB MySQL

Cloud Hosting documents a CloudBase MySQL integration, recommending the
environment-provided MySQL database for its automatic internal connection. It
also documents internal connectivity to other Tencent Cloud MySQL instances and
public connectivity as the flexible but less constrained option.
[Cloud Hosting MySQL integration](https://docs.cloudbase.net/run/develop/resource-integration/mysql)

Choose MySQL only when existing operational requirements or the application's
SQL/ORM make it materially less costly than PostgreSQL. It remains a database
migration, not an SQLite file deployment.

## Uncertainties and verification gates

- The current CloudBase docs label several Cloud Hosting pages "supported
  region: Shanghai". Confirm the intended production region, plan/quota,
  environment type (traditional vs PG), and pricing in the CloudBase console
  before committing the target environment.
- The docs describe the mechanisms but do not supply this application's
  expected upload size, retention period, or required data-residency policy.
  Define those before final storage rules and lifecycle cleanup.
- Validate the exact PostgreSQL connection host, SSL requirement, and maximum
  connection allowance from the created environment's console; the official
  connection guide says these values are console-specific.
- Test with two authenticated mini-program users that one cannot read, replace,
  or delete the other's upload; then test the Cloud Hosting service can read
  only the `fileID` it has authorized for the matching submission.
