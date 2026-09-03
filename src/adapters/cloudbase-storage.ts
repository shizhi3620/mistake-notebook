import cloudbase from "@cloudbase/node-sdk";

export function createCloudBaseStorageVerifier(options: {
  getTemporaryUrl: (fileId: string) => Promise<string>;
  deleteFile?: (fileId: string) => Promise<void>;
}) {
  return {
    getTemporaryUrl: options.getTemporaryUrl,
    async verifyUploadedFile(input: {
      fileId: string;
      expectedImageKey: string;
    }): Promise<{ imageUrl: string }> {
      assertCloudBaseFileOwnership(input.fileId, input.expectedImageKey);
      const imageUrl = await options.getTemporaryUrl(input.fileId);
      if (!imageUrl.startsWith("https://")) {
        throw new Error("Uploaded photo could not be opened securely.");
      }
      return { imageUrl };
    },
    async deleteUploadedFile(fileId: string): Promise<void> {
      if (!fileId.startsWith("cloud://")) {
        throw new Error("Uploaded photo has an invalid CloudBase file ID.");
      }
      if (!options.deleteFile) throw new Error("CloudBase deletion is not configured.");
      await options.deleteFile(fileId);
    },
  };
}

export function assertCloudBaseFileOwnership(
  fileId: string,
  expectedImageKey: string,
): void {
  if (!fileId.startsWith("cloud://")) {
    throw new Error("Uploaded photo has an invalid CloudBase file ID.");
  }
  const withoutScheme = fileId.slice("cloud://".length);
  const separator = withoutScheme.indexOf("/");
  if (separator < 0 || withoutScheme.slice(separator + 1) !== expectedImageKey) {
    throw new Error("Uploaded photo does not belong to this upload credential.");
  }
}

export function createCloudBaseNodeStorageVerifier(options: {
  env: string;
  region?: string;
  secretId?: string;
  secretKey?: string;
}) {
  const config = {
    env: options.env,
    region: options.region,
    ...(options.secretId && options.secretKey
      ? { secretId: options.secretId, secretKey: options.secretKey }
      : {}),
  };
  return createCloudBaseStorageVerifier({
    getTemporaryUrl: async (fileId) => {
      const app = cloudbase.init(config);
      const result = await app.getTempFileURL({ fileList: [fileId] });
      const file = result.fileList[0];
      if (!file || file.code !== "SUCCESS") {
        throw new Error("Uploaded photo temporary URL could not be created.");
      }
      return file.tempFileURL;
    },
    deleteFile: async (fileId) => {
      const app = cloudbase.init(config);
      const result = await app.deleteFile({ fileList: [fileId] });
      const file = result.fileList[0];
      if (!file || file.code !== "SUCCESS") throw new Error("Uploaded photo could not be deleted.");
    },
  });
}

type CloudBaseApp = {
  init(config: { env: string; region?: string }): CloudBaseApp;
  getTempFileURL(input: { fileList: string[] }): Promise<{
    fileList: Array<{ code: string; tempFileURL: string }>;
  }>;
  deleteFile(input: { fileList: string[] }): Promise<{ fileList: Array<{ code: string }> }>;
};
