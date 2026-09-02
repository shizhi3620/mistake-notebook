const config = require("../config");

let token = wx.getStorageSync("sessionToken") || "";
const MIN_CONTAINER_SDK_VERSION = "2.13.1";

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
    sendRequest({
      method,
      path,
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

function sendRequest(options) {
  if (config.transport === "container") {
    assertContainerSupported();
    wx.cloud.callContainer({
      config: { env: config.cloudEnv },
      path: `/api${options.path}`,
      method: options.method,
      data: options.data,
      header: {
        "content-type": "application/json",
        "X-WX-SERVICE": config.containerService,
        ...options.header,
      },
      success: options.success,
      fail: options.fail,
    });
    return;
  }
  wx.request({
    url: config.apiBase + options.path,
    method: options.method,
    data: options.data,
    header: options.header,
    success: options.success,
    fail: options.fail,
  });
}

function assertContainerSupported() {
  const sdkVersion = wx.getSystemInfoSync().SDKVersion || "0.0.0";
  if (compareVersions(sdkVersion, MIN_CONTAINER_SDK_VERSION) < 0) {
    throw new Error(`当前微信版本不支持云托管调用，请升级微信后重试（需基础库 ${MIN_CONTAINER_SDK_VERSION} 及以上）`);
  }
}

function compareVersions(left, right) {
  const leftParts = left.split(".").map((part) => Number(part) || 0);
  const rightParts = right.split(".").map((part) => Number(part) || 0);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference) return difference;
  }
  return 0;
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
