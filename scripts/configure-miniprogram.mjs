import { writeFileSync } from "node:fs";

const environments = ["develop", "trial", "release"];
const apiBaseByEnvironment = Object.fromEntries(
  environments.map((environment) => {
    const key = `MINIPROGRAM_${environment.toUpperCase()}_API_BASE`;
    const value = process.env[key]?.trim();
    if (!value?.startsWith("https://")) {
      throw new Error(`${key} must be an HTTPS API base URL.`);
    }
    return [environment, value.replace(/\/$/, "")];
  }),
);
const reminderTemplateIdByEnvironment = Object.fromEntries(
  environments.map((environment) => {
    const key = `MINIPROGRAM_${environment.toUpperCase()}_REMINDER_TEMPLATE_ID`;
    const value = process.env[key]?.trim();
    if (!value) {
      throw new Error(`${key} is required.`);
    }
    return [environment, value];
  }),
);

writeFileSync(
  new URL("../miniprogram/config.private.js", import.meta.url),
  `module.exports = ${JSON.stringify({ apiBaseByEnvironment, reminderTemplateIdByEnvironment }, null, 2)};\n`,
  "utf8",
);
