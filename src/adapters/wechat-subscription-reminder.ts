import type { ReminderNotification } from "../learning-loop.ts";

export function createWeChatSubscriptionReminderSender(options: {
  appId: string;
  appSecret: string;
  templateId: string;
  resolveOpenId(parentAccountId: string): Promise<string | undefined>;
  nicknameField: string;
  dueCountField: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  let cachedToken: { value: string; expiresAt: number } | undefined;

  return async (
    notification: ReminderNotification,
    parentAccountId: string,
  ): Promise<void> => {
    const openId = await options.resolveOpenId(parentAccountId);
    if (!openId) throw new Error("Reminder recipient is not available.");
    const accessToken = await getAccessToken();
    const response = await fetchImpl(
      `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          touser: openId,
          template_id: options.templateId,
          page: notification.entryPath.replace(/^\//, ""),
          data: {
            [options.nicknameField]: { value: (notification.childNickname ?? "孩子").slice(0, 20) },
            [options.dueCountField]: { value: notification.dueCount },
          },
        }),
      },
    );
    const result = await response.json() as { errcode?: number; errmsg?: string };
    if (!response.ok || result.errcode !== 0) {
      throw new Error(`WeChat reminder send failed (${result.errcode ?? response.status}).`);
    }
  };

  async function getAccessToken(): Promise<string> {
    if (cachedToken && cachedToken.expiresAt > now()) return cachedToken.value;
    const url = new URL("https://api.weixin.qq.com/cgi-bin/token");
    url.searchParams.set("grant_type", "client_credential");
    url.searchParams.set("appid", options.appId);
    url.searchParams.set("secret", options.appSecret);
    const response = await fetchImpl(url);
    const result = await response.json() as {
      access_token?: string;
      expires_in?: number;
      errcode?: number;
    };
    if (!response.ok || !result.access_token || !result.expires_in) {
      throw new Error(`WeChat access token failed (${result.errcode ?? response.status}).`);
    }
    cachedToken = {
      value: result.access_token,
      expiresAt: now() + Math.max(60, result.expires_in - 300) * 1000,
    };
    return cachedToken.value;
  }
}
