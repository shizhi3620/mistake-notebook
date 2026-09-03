# WeChat Cloud Hosting Storage Authentication Research

Research date: 2026-09-03. This note evaluates the official WeChat Cloud
Hosting object-storage API guidance against the current asynchronous
recognition Worker deployment.

## Decision-relevant finding

The current standalone Tencent SCF Worker is **not** a substitute for a WeChat
Cloud Hosting service when it needs to read this environment's Cloud Hosting
object storage without separately configured Tencent Cloud credentials.

The official Cloud Hosting path is not `@cloudbase/node-sdk` with implicit
credentials. A Cloud Hosting **container** calls its injected Open API Service
at `http://api.weixin.qq.com/_/cos/getauth`, receives an environment-scoped
temporary COS credential, and passes that credential to the Tencent COS SDK.
This avoids application-managed long-term `SecretId` and `SecretKey`, but it
depends on the workload running in a deployed Cloud Hosting version with Open
API Service enabled.

The supplied documentation does not describe that endpoint as available to a
standalone SCF function, nor does it document an SCF runtime identity that can
access Cloud Hosting object storage solely because both services share a VPC.
The observed SCF error, `missing secretId or secretKey of tencent cloud`, is
therefore consistent with using the wrong runtime/API combination rather than
with a DNS or image-size issue.

## What the official API requires

1. Cloud Hosting object storage is backed by Tencent COS. The documented
   server-side pattern is: obtain a temporary credential through the container
   Open API Service, initialize the COS SDK with it, then use the SDK for
   listing, reading, deleting, and uploading objects. For uploads, server code
   must also write the documented file metadata or a mini-program cannot access
   the uploaded file.
   [Cloud Hosting storage API overview](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloudrun/src/guide/storage/api.html)

2. The credential endpoint is exactly
   `http://api.weixin.qq.com/_/cos/getauth`. Its response contains
   `TmpSecretId`, `TmpSecretKey`, `Token`, and `ExpiredTime`. The official Node
   example configures `cos-nodejs-sdk-v5` with an asynchronous
   `getAuthorization` callback that calls this endpoint whenever the SDK needs
   credentials.
   [COS SDK server-side guide](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloudrun/src/development/storage/service/cos-sdk.html)

3. The Open API Service must be enabled **when the Cloud Hosting version is
   created**. Instances of versions produced while it is disabled do not have
   the service; changing the switch later does not retrofit existing versions.
   The official guide recommends HTTP for container-internal Open API calls and
   states that this facility bundles object-storage APIs to remove the
   application's normal authentication step.
   [Open API Service guide](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloudrun/src/guide/weixin/open.html)

4. The mini-program client path remains `wx.cloud.uploadFile`, with
   `config.env` set to the Cloud Hosting environment ID. It returns a
   `cloud://...` CloudID. The same guide describes `wx.cloud.getTempFileURL`
   for clients, but the server-side guide recommends COS SDK plus the container
   temporary credential for trusted service-side processing.
   [Cloud Hosting storage API overview](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloudrun/src/guide/storage/api.html)

## Implication for this project

The existing `ctb` Cloud Hosting service should own object-storage resolution
through the documented COS-SDK/Open-API-Service mechanism. A generic SCF
Worker cannot currently resolve images either through its direct CloudBase SDK
call (no credentials) or through the `ctb` internal domain (SCF DNS cannot
resolve that name).

To retain all current constraints (no ICP-bound public domain and no
user-managed CloudBase/CAM credential), move the recognition Worker into a
second Cloud Hosting service/version in the same environment, or redesign the
asynchronous execution so it is invoked by a Cloud Hosting-native trigger.
That runtime can call `/_/cos/getauth` directly and does not need the failing
SCF-to-`ctb` private-DNS hop. Its access should be limited in application code
to task-owned image IDs and task-owned database rows.

Do not expose the temporary credential to the mini-program, log it, or store it
as an environment variable. It is a runtime-issued, expiring credential for
the Cloud Hosting container only.

## Verification checklist before changing code

- In the Cloud Hosting environment, enable **Open API Service** and include
  the necessary object-storage interface permission for the next Worker
  service deployment.
- Deploy a new Cloud Hosting Worker version after the switch is enabled.
- In the Worker container, call `GET http://api.weixin.qq.com/_/cos/getauth`.
  A successful response must include the four temporary-credential fields; do
  not copy their values into tickets, logs, or chat.
- Use that response only through the COS SDK's `getAuthorization` callback and
  read one known task `fileID` from the environment storage bucket.
- Confirm a task can complete and the Worker removes the source image according
  to the existing retention policy.

## Boundaries and open questions

- This research establishes the Cloud Hosting server-side storage mechanism.
  It does not establish an equivalent no-credential SCF mechanism because the
  official supplied documents do not provide one.
- The console's exact Open API Service permission labels and the bucket/region
  values are environment-specific. Obtain bucket and region from the Cloud
  Hosting object-storage console instead of constructing them from a CloudID.
- Moving the Worker to Cloud Hosting solves its storage identity. It does not
  itself create durable queue delivery. The task table/claim/retry workflow
  remains necessary and must be triggered by a supported Cloud Hosting-native
  execution mechanism.
