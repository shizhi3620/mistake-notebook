# 腾讯云生产后端迁移

Status: ready-for-agent

PRD: `requirements/PRD-004-tencent-cloud-backend-migration-v1.0.0.md`

## Problem Statement

微信云托管环境已销毁，且其对象存储身份、独立 SCF Worker 和私网访问边界不适合稳定的异步图像识别。项目尚未上线、无需迁移历史数据，但需要在已购 CVM 和备案中的自有域名基础上建立普通腾讯云生产后端。

## Solution

以备案 HTTPS 域名、CVM Nginx、Docker Node.js API、私网 MySQL、COS、SCF Worker、NAT、TCR 与 CLS 组成全新生产环境。小程序通过 API 获得短期受限 COS 上传授权，图片直传 COS；API 创建持久化任务并异步触发 SCF，Worker 读取对象、调用 DeepSeek、写回 MySQL，小程序轮询任务后进入既有家长确认流程。

## User Stories

1. As a parent, I want to use the mini program through a filed HTTPS domain, so that my login and learning data are protected.
2. As a parent, I want direct, constrained image upload to COS, so that large photos do not overload the API server.
3. As a parent, I want asynchronous recognition to finish after the request returns, so that slow model responses do not time out the mini program.
4. As a parent, I want only my family to access its uploads and tasks, so that children’s learning data remains private.
5. As an operator, I want durable task state and retry information, so that failures are diagnosable and recoverable.
6. As an operator, I want central, redacted logs correlated by request and task ID, so that production incidents can be investigated safely.
7. As a release owner, I want versioned API images and Worker packages, so that releases can be rolled back.
8. As an infrastructure owner, I want MySQL private and outbound model access controlled, so that the network attack surface is limited.

## Implementation Decisions

- Replace all Cloud Hosting and CloudBase storage dependencies with COS, private MySQL, CVM API deployment and SCF Worker execution.
- Use the HTTPS API contract as the highest integration seam: issue upload authorization, upload the permitted object, create a task, observe its terminal state, and confirm the result.
- Keep the existing MySQL recognition state machine and SCF-based asynchronous execution without a message queue in the first release.
- Use short-lived object-key-scoped COS upload authorization; do not accept arbitrary object keys or client-provided public URLs.
- Run API and MySQL access over VPC private networking. Use NAT only for SCF outbound DeepSeek requests.
- Deploy versioned API images through TCR and record version, branch and commit at startup. Centralize redacted logs in CLS.

## Testing Decisions

- Test API authorization, upload scope, task state, result visibility and learning-loop confirmation as externally observable contracts.
- Add integration coverage for COS upload authorization and Worker COS access, MySQL task claiming/retry, SCF dispatch, Nginx HTTPS health checks and redacted CLS logs.
- Preserve the existing learning-loop regression suite as the safeguard that AI output never bypasses parental confirmation.

## Out of Scope

- Historical data migration, message queues, Kubernetes, multi-region HA, model-provider replacement, and production use before domain filing/HTTPS activation.

## Further Notes

The new production environment is greenfield because the prior Cloud Hosting environment has been destroyed and no live data exists. The initial CVM size is 2C2G; capacity must be monitored before broader rollout.
