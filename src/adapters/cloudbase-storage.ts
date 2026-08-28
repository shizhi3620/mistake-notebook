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
