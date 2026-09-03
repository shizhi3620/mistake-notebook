import { createHash, createHmac } from "node:crypto";

export function createTencentScfInvoker(options: { secretId: string; secretKey: string; region: string; functionName: string }) {
  return async (taskId: string): Promise<void> => {
    const host = "scf.tencentcloudapi.com";
    const service = "scf";
    const timestamp = Math.floor(Date.now() / 1000);
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    const payload = JSON.stringify({ FunctionName: options.functionName, InvocationType: "Event", ClientContext: JSON.stringify({ taskId }) });
    const hashedPayload = sha256(payload);
    const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\n`;
    const signedHeaders = "content-type;host";
    const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${hashedPayload}`;
    const credentialScope = `${date}/${service}/tc3_request`;
    const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${sha256(canonicalRequest)}`;
    const secretDate = hmac(`TC3${options.secretKey}`, date);
    const secretService = hmac(secretDate, service);
    const secretSigning = hmac(secretService, "tc3_request");
    const signature = hmac(secretSigning, stringToSign, "hex");
    const authorization = `TC3-HMAC-SHA256 Credential=${options.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    const response = await fetch(`https://${host}`, { method: "POST", headers: { Authorization: authorization, "Content-Type": "application/json; charset=utf-8", Host: host, "X-TC-Action": "Invoke", "X-TC-Version": "2018-04-16", "X-TC-Region": options.region, "X-TC-Timestamp": String(timestamp) }, body: payload });
    if (!response.ok) throw new Error(`SCF invocation failed with ${response.status}.`);
    const responseBody = await response.json() as { Response?: { Error?: { Message?: string } } };
    if (responseBody.Response?.Error) throw new Error(`SCF invocation failed: ${responseBody.Response.Error.Message ?? "unknown error"}`);
  };
}
function sha256(value: string) { return createHash("sha256").update(value).digest("hex"); }
function hmac(key: string | Buffer, value: string): Buffer;
function hmac(key: string | Buffer, value: string, encoding: "hex"): string;
function hmac(key: string | Buffer, value: string, encoding?: "hex"): Buffer | string { return encoding ? createHmac("sha256", key).update(value).digest(encoding) : createHmac("sha256", key).update(value).digest(); }
