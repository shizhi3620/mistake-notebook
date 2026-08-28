const { apiBaseByEnvironment } = require("./config.private");

const environment = wx.getAccountInfoSync().miniProgram.envVersion || "develop";
const apiBase = apiBaseByEnvironment[environment];

if (typeof apiBase !== "string" || !apiBase.startsWith("https://")) {
  throw new Error(`缺少 ${environment} 环境的 HTTPS API 配置`);
}

module.exports = {
  cloudEnv: "prod-d8giqy4sjc5925f68",
  apiBase,
};
