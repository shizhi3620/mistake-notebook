export function createCloudBaseStorageVerifier(options: {
  getTemporaryUrl: (fileId: string) => Promise<string>;
}) {
  return {
    async verifyUploadedFile(input: {
      fileId: string;
      expectedImageKey: string;
    }): Promise<{ imageUrl: string }> {
      if (!input.fileId.startsWith("cloud://")) {
        throw new Error("Uploaded photo has an invalid CloudBase file ID.");
      }
      const imageUrl = await options.getTemporaryUrl(input.fileId);
      if (!imageUrl.startsWith("https://")) {
        throw new Error("Uploaded photo could not be opened securely.");
      }
      return { imageUrl };
    },
  };
}

export function createCloudBaseNodeStorageVerifier(options: {
  env: string;
  region?: string;
}) {
  return createCloudBaseStorageVerifier({
    getTemporaryUrl: async (fileId) => {
      const moduleName = "@cloudbase/node-sdk";
      const cloudbaseModule = (await import(moduleName)) as {
        default: { init(config: { env: string; region?: string }): CloudBaseApp };
      };
      const cloudbase = cloudbaseModule.default;
      const app = cloudbase.init({ env: options.env, region: options.region });
      const result = await app.getTempFileURL({ fileList: [fileId] });
      const file = result.fileList[0];
      if (!file || file.code !== "SUCCESS") {
        throw new Error("Uploaded photo temporary URL could not be created.");
      }
      return file.tempFileURL;
    },
  });
}

type CloudBaseApp = {
  init(config: { env: string; region?: string }): CloudBaseApp;
  getTempFileURL(input: { fileList: string[] }): Promise<{
    fileList: Array<{ code: string; tempFileURL: string }>;
  }>;
};
