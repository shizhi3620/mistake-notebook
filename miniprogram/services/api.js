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
    wx.request({
      url: config.apiBase + path,
      method,
      data: body,
      header: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      success: (res) => {
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
      fail: () => reject(new Error("网络连接失败，请检查服务是否已启动")),
    });
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
