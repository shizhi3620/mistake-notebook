const {
  apiBaseByEnvironment = {},
  containerServiceByEnvironment = {},
  cloudEnvByEnvironment = {},
  reminderTemplateIdByEnvironment = {},
} = require("./config.private");

const environment = wx.getAccountInfoSync().miniProgram.envVersion || "develop";
const apiBase = apiBaseByEnvironment[environment];
const transport = environment === "develop" ? "https" : "container";
const containerService = containerServiceByEnvironment[environment];

if (transport === "https" && (typeof apiBase !== "string" || !apiBase.startsWith("https://"))) {
  throw new Error(`缺少 ${environment} 环境的 HTTPS API 配置`);
}
if (transport === "container" && (typeof containerService !== "string" || !containerService)) {
  throw new Error(`缺少 ${environment} 环境的云托管服务配置`);
}

module.exports = {
  cloudEnv: cloudEnvByEnvironment[environment] || "",
  apiBase,
  containerService,
  transport,
  reminderTemplateId: reminderTemplateIdByEnvironment[environment] || "",
};
