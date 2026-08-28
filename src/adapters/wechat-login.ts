export type WeChatIdentity = {
  subject: string;
};

type WeChatSessionResponse = {
  openid?: unknown;
  errcode?: unknown;
  errmsg?: unknown;
};

const LOGIN_VERIFICATION_ERROR =
  "WeChat login could not be verified. Please try again.";

export function createWeChatIdentityResolver(options: {
  appId: string;
  appSecret: string;
  fetchImpl?: typeof fetch;
  onVerificationFailure?: (details: {
    status?: number;
    errcode?: unknown;
    errmsg?: unknown;
    errorName?: string;
    errorMessage?: string;
  }) => void;
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
    } catch (error: unknown) {
      options.onVerificationFailure?.({
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw new Error(LOGIN_VERIFICATION_ERROR);
    }
    const payload = (await response.json()) as WeChatSessionResponse;
    if (!response.ok) {
      options.onVerificationFailure?.({
        status: response.status,
        errcode: payload.errcode,
        errmsg: payload.errmsg,
      });
      throw new Error(LOGIN_VERIFICATION_ERROR);
    }
    if (typeof payload.openid !== "string" || !payload.openid) {
      options.onVerificationFailure?.({
        status: response.status,
        errcode: payload.errcode,
        errmsg: payload.errmsg,
      });
      throw new Error(LOGIN_VERIFICATION_ERROR);
    }

    return { subject: payload.openid };
  };
}
