# 微信小程序网络请求规则（部署核对）

来源：微信开放文档《网络》<https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html>（访问日期：2026-09-04）。以下结论针对 `wx.request`、`wx.uploadFile`、`wx.downloadFile` 及开发者工具联调。

## 合法域名

- 小程序只能与后台预先配置的通讯域名通信；规则覆盖普通 HTTPS 请求、上传、下载和 WebSocket。
- 配置位置：小程序后台「开发 → 开发管理 → 开发设置 → 服务器域名」。
- `wx.request`、`wx.uploadFile`、`wx.downloadFile` 只支持 `https`；WebSocket 使用 `wss`。
- 域名不能填写 IP 或 `localhost`（局域网 IP 仅用于局域网通信例外），不能配置父域名，必须使用实际子域名。
- HTTPS 域名可以配置端口；配置了端口后只能访问同端口。未配置端口时，请求 URL 也不能显式带 `:443`。
- 服务器域名必须完成 ICP 备案。
- 微信后台配置的是域名，不是路径，因此应填写 `https://ctb.bhbm.com.cn`，不能填写 `https://ctb.bhbm.com.cn/api`。
- 使用微信云托管的 `callContainer` 属于例外，可通过微信私有协议调用而无需配置通讯域名；当前 CVM 部署不适用此例外。

## HTTPS 与证书

小程序会校验服务器 HTTPS 证书，校验失败时请求不会发起。证书要求：

- 证书有效、在有效期内，并且由系统信任的根证书签发。
- 证书域名必须与请求域名一致（本项目为 `ctb.bhbm.com.cn`）。
- 服务器必须发送完整信任链，至少包含站点证书和对应中间证书；不能只部署 leaf 证书。
- TLS 必须支持 1.2 及以上；为兼容旧 Android，服务端可同时支持 1.2 和 1.3。
- iOS 不支持自签名证书，并需满足 Apple ATS 要求。

Nginx 应使用腾讯云下载的 Nginx 证书链文件，例如：

```nginx
ssl_certificate /etc/nginx/certs/fullchain.pem;
ssl_certificate_key /etc/nginx/certs/privkey.pem;
```

验证链路可使用：

```bash
openssl s_client -connect ctb.bhbm.com.cn:443 -servername ctb.bhbm.com.cn
```

## 开发者工具与配置刷新

- 开发者工具可临时勾选「开发环境不校验请求域名、TLS 版本及 HTTPS 证书」跳过校验；手机端对应的是开启调试模式。
- 该选项只适合临时开发排查。服务器域名配置完成后应关闭，并在各平台实测；否则可能出现“调试模式可用、正式模式不可用”。
- 在微信后台更新服务器域名后，开发者工具需要执行「详情 → 域名信息 → 刷新」，再重新编译项目，才能加载最新域名列表。

因此，出现 `url not in domain list` 时，请先确认后台已保存域名，再刷新「域名信息」并重新编译；这类错误发生在请求到达 CVM 之前，与 Nginx/API 无关。

## wx.request 运行限制

- 默认请求超时 60 秒；可在 `app.json` 的 `networktimeout` 或单次调用的 `timeout` 设置，单次调用优先。
- `wx.request`、`wx.uploadFile`、`wx.downloadFile` 最大并发数为 10；`wx.connectSocket` 最大并发数为 5。
- 小程序进入后台后，若 5 秒内请求未完成会失败并回调 `fail interrupted`；回到前台前不能继续调用网络接口。
- `referer` 不可由业务设置，微信会固定生成；服务端不应依赖自定义 referer 鉴权。
- 服务端建议使用 UTF-8 返回；无论 HTTP status 是多少，只要收到响应都会进入 `success`，客户端必须自行判断状态码和业务字段。

## 对当前 `ctb.bhbm.com.cn` 问题的判断

1. API 本机和公网 `curl -k` 已能完成 TLS 并返回 `/healthz` 的 200，说明 Nginx、CVM 监听和反向代理基本正常。
2. 微信开发者工具日志中的 `request:fail url not in domain list` 是小程序合法域名缓存/后台配置问题，不是后端接口问题。应在后台加入 `https://ctb.bhbm.com.cn`，然后「详情 → 域名信息 → 刷新」并重新编译。
3. 若关闭跳过校验后仍失败，优先检查微信后台域名是否保存成功、DNS 是否仍指向 `119.45.199.189`、证书是否覆盖该域名且 Nginx 发送完整中间链，以及 TLS 是否支持 1.2+。
4. `curl` 的 `-k` 会跳过证书校验，不能证明小程序一定可用；必须用不带 `-k` 的客户端和真实小程序（关闭调试绕过）验证。

