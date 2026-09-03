const {
  apiBaseByEnvironment = {},
  reminderTemplateIdByEnvironment = {},
} = require("./config.private");

const environment = wx.getAccountInfoSync().miniProgram.envVersion || "develop";
const apiBase = apiBaseByEnvironment[environment];
const transport = "https";

if (transport === "https" && (typeof apiBase !== "string" || !apiBase.startsWith("https://"))) {
  throw new Error(`缺少 ${environment} 环境的 HTTPS API 配置`);
}
module.exports = {
  apiBase,
  transport,
  reminderTemplateId: reminderTemplateIdByEnvironment[environment] || "",
};
