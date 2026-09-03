import COS from "cos-nodejs-sdk-v5";

export type CosPhotoStorage = {
  createUploadUrl(input: { objectKey: string; contentType: string }): Promise<{
    uploadUrl: string;
    method: "PUT";
    headers: Record<string, string>;
  }>;
  assertObjectExists(objectKey: string): Promise<void>;
  getTemporaryUrl(objectKey: string): Promise<string>;
  deleteUploadedFile(objectKey: string): Promise<void>;
};

export function createTencentCosPhotoStorage(options: {
  secretId: string;
  secretKey: string;
  bucket: string;
  region: string;
  uploadExpiresSeconds?: number;
  readExpiresSeconds?: number;
}): CosPhotoStorage {
  const cos = new COS({ SecretId: options.secretId, SecretKey: options.secretKey });
  const common = { Bucket: options.bucket, Region: options.region };
  const safeKey = (objectKey: string) => {
    if (!/^(questions|homework)\/[0-9a-z-]+\/[0-9a-z-]+$/.test(objectKey)) {
      throw new Error("Uploaded photo has an invalid object key.");
    }
    return objectKey;
  };

  return {
    async createUploadUrl({ objectKey, contentType }) {
      const key = safeKey(objectKey);
      if (!/^image\/(jpeg|png|webp)$/.test(contentType)) {
        throw new Error("Uploaded photo has an invalid content type.");
      }
      return {
        uploadUrl: cos.getObjectUrl({
          ...common,
          Key: key,
          Method: "PUT",
          Sign: true,
          Expires: options.uploadExpiresSeconds ?? 900,
          Headers: { "content-type": contentType },
          Protocol: "https:",
        }),
        method: "PUT",
        headers: { "content-type": contentType },
      };
    },
    async assertObjectExists(objectKey) {
      const object = await cos.headObject({ ...common, Key: safeKey(objectKey) });
      const size = Number(object.headers?.["content-length"] ?? 0);
      if (!Number.isFinite(size) || size <= 0 || size > 5 * 1024 * 1024) {
        throw new Error("Uploaded photo must be between 1 byte and 5 MB.");
      }
    },
    async getTemporaryUrl(objectKey) {
      return cos.getObjectUrl({
        ...common,
        Key: safeKey(objectKey),
        Method: "GET",
        Sign: true,
        Expires: options.readExpiresSeconds ?? 600,
        Protocol: "https:",
      });
    },
    async deleteUploadedFile(objectKey) {
      await cos.deleteObject({ ...common, Key: safeKey(objectKey) });
    },
  };
}
