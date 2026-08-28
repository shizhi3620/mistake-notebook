const api = require("./services/api");
const config = require("./config");

App({
  globalData: {
    account: null,
  },

  onLaunch() {
    wx.cloud.init({
      env: config.cloudEnv,
      traceUser: true,
    });
    api
      .login()
      .then((login) => {
        this.globalData.account = login.account;
      })
      .catch(() => {
        wx.showToast({ title: "登录失败，请稍后重试", icon: "none" });
      });
  },

  async ensureAccount() {
    if (!this.globalData.account) {
      const login = await api.login();
      this.globalData.account = login.account;
    }
    return this.globalData.account;
  },
});
