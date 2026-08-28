export type WeChatIdentity = {
  subject: string;
};

type WeChatSessionResponse = {
  openid?: unknown;
};

const LOGIN_VERIFICATION_ERROR =
  "WeChat login could not be verified. Please try again.";

export function createWeChatIdentityResolver(options: {
  appId: string;
  appSecret: string;
  fetchImpl?: typeof fetch;
}): (temporaryCode: string) => Promise<WeChatIdentity> {
  const fetchImpl = options.fetchImpl ?? fetch;

  return async (temporaryCode) => {
    if (!temporaryCode.trim()) {
      throw new Error("WeChat login code is required.");
    }

    const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
    url.searchParams.set("appid", options.appId);
    url.searchParams.set("secret", options.appSecret);
    url.searchParams.set("js_code", temporaryCode);
    url.searchParams.set("grant_type", "authorization_code");

    let response: Response;
    try {
      response = await fetchImpl(url);
    } catch {
      throw new Error(LOGIN_VERIFICATION_ERROR);
    }
    if (!response.ok) {
      throw new Error(LOGIN_VERIFICATION_ERROR);
    }

    const payload = (await response.json()) as WeChatSessionResponse;
    if (typeof payload.openid !== "string" || !payload.openid) {
      throw new Error(LOGIN_VERIFICATION_ERROR);
    }

    return { subject: payload.openid };
  };
}
