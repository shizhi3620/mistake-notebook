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
        return { uploadToken: "upload-1", objectKey: "questions/draft-1/photo-1", method: "PUT", uploadUrl: "https://cos.example/photo", headers: { "content-type": "image/jpeg" } };
      }
      if (path === "/recognition-tasks") return { taskId: "task-1", status: "pending" };
      if (path === "/recognition-tasks/task-1") return { status: "succeeded", result: { stem: "1 + 1", formulas: [], confidence: 1, region: null } };
      if (path.endsWith("/recognition")) return { recognition: { stem: "1 + 1" } };
      throw new Error(`Unexpected API path: ${path}`);
    },
  };
  const wx = {
    compressImage: ({ quality, compressedWidth, success }: any) => {
      assert.equal(quality, 55);
      assert.equal(compressedWidth, 1024);
      success({ tempFilePath: "/tmp/compressed.jpg" });
    },
    getFileSystemManager: () => ({
      readFile: ({ success }: any) => success({ data: "QUJD" }),
    }),
    request: ({ method, url, data, success }: any) => { assert.equal(method, "PUT"); assert.equal(url, "https://cos.example/photo"); assert.equal(data, "QUJD"); uploaded = true; success({ statusCode: 200, data: "" }); },
    setStorageSync: () => {},
    removeStorageSync: () => {},
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
      require: (path: string) => {
        if (path === "../../services/api") return api;
        if (path === "../../config") return { transport: "https" };
        if (path === "../../services/cos-upload") return {
          uploadToCos: (credential: any, filePath: string) => new Promise((resolve, reject) => wx.getFileSystemManager().readFile({ filePath, success: ({ data }: any) => wx.request({ url: credential.uploadUrl, method: credential.method, data, success: (response: any) => response.statusCode === 200 ? resolve({ objectKey: credential.objectKey }) : reject(new Error("upload failed")) }), fail: reject })),
        };
        throw new Error(`Unexpected require: ${path}`);
      },
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
