const config = require("../config");

let token = wx.getStorageSync("sessionToken") || "";

function login() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: ({ code }) => {
        request("POST", "/session", { code }, { skipAuth: true })
          .then((data) => {
            token = data.session.token;
            wx.setStorageSync("sessionToken", token);
            resolve(data);
          })
          .catch(reject);
      },
      fail: () => reject(new Error("微信登录失败")),
    });
  });
}

function request(method, path, body, options = {}) {
  const mutating = method !== "GET";
  const idempotencyKey = options.idempotencyKey || (mutating
    ? `${Date.now()}-${Math.random().toString(36).slice(2)}`
    : "");
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    sendRequest({
      method,
      path,
      data: body,
      header: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      success: (res) => {
        console.log("[api_response]", {
          method,
          path,
          statusCode: res.statusCode,
          durationMs: Date.now() - startedAt,
          requestId: (res.header && (res.header["x-request-id"] || res.header["X-Request-Id"])) || "",
        });
        if (res.statusCode === 401 && !options.skipAuth && !options.retried) {
          login()
            .then(() =>
              resolve(request(method, path, body, {
                retried: true,
                idempotencyKey,
              })),
            )
            .catch(reject);
          return;
        }
        if (res.statusCode >= 400) {
          reject(new Error((res.data && res.data.error) || "请求失败，请稍后重试"));
          return;
        }
        resolve(res.data);
      },
      fail: (error) => {
        console.error("[api_failure]", {
          method,
          path,
          durationMs: Date.now() - startedAt,
          errCode: error && (error.errCode || error.errno || ""),
          errMsg: error && error.errMsg ? String(error.errMsg).slice(0, 300) : "",
        });
        reject(new Error("网络连接失败，请检查服务是否已启动"));
      },
    });
  });
}

function sendRequest(options) {
  wx.request({
    url: config.apiBase + options.path,
    method: options.method,
    data: options.data,
    header: options.header,
    success: options.success,
    fail: options.fail,
  });
}

function clearSession() {
  token = "";
  wx.removeStorageSync("sessionToken");
}

module.exports = {
  clearSession,
  login,
  request,
};
