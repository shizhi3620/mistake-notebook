import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

test("capture page compresses, uploads, and submits the selected image", async () => {
  let page: any;
  let uploaded = false;
  let navigatedTo = "";
  let modalContent = "";
  const api = {
    request: async (_method: string, path: string) => {
      if (path === "/home") return { stage: "ready", child: { id: "child-1" } };
      if (path === "/drafts") return { id: "draft-1" };
      if (path.endsWith("/photo-credential")) {
        return { uploadToken: "upload-1", imageKey: "questions/draft-1/photo-1" };
      }
      if (path.endsWith("/photo")) return { recognition: { stem: "1 + 1" } };
      throw new Error(`Unexpected API path: ${path}`);
    },
  };
  const wx = {
    compressImage: ({ success }: any) => success({ tempFilePath: "/tmp/compressed.jpg" }),
    getFileSystemManager: () => ({
      readFile: ({ success }: any) => success({ data: "QUJD" }),
    }),
    cloud: {
      uploadFile: ({ success }: any) => {
        uploaded = true;
        success({ fileID: "cloud://env/questions/draft-1/photo-1" });
      },
    },
    setStorageSync: () => {},
    navigateTo: ({ url }: any) => {
      navigatedTo = url;
    },
    showModal: ({ content }: any) => {
      modalContent = content;
    },
  };

  vm.runInNewContext(
    readFileSync("miniprogram/pages/capture/capture.js", "utf8"),
    {
      require: () => api,
      wx,
      Page: (definition: any) => {
        page = definition;
      },
      Promise,
      Error,
    },
  );
  const instance = {
    ...page,
    data: { ...page.data, imagePath: "/tmp/original.jpg" },
    setData(update: object) {
      Object.assign(this.data, update);
    },
  };

  await instance.upload();

  assert.equal(uploaded, true, modalContent);
  assert.equal(navigatedTo, "/pages/confirm/confirm?draftId=draft-1");
});
