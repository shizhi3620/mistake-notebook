const api = require("../../services/api");
const config = require("../../config");

Page({
  data: {
    imagePath: "",
    rotationDegrees: 0,
    source: "camera",
    uploading: false,
  },

  chooseImage(event) {
    const source = event.currentTarget.dataset.source;
    // 仅在用户主动点击后才触发系统权限请求。
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: source === "camera" ? ["camera"] : ["album"],
      success: (res) => {
        this.setData({
          imagePath: res.tempFiles[0].tempFilePath,
          rotationDegrees: 0,
          source,
        });
      },
      fail: () => {
        wx.showModal({
          title: "无法获取图片",
          content: "可以在系统设置中开启权限，或返回首页手动录入题目。",
          showCancel: false,
        });
      },
    });
  },

  rotate() {
    this.setData({
      rotationDegrees: (this.data.rotationDegrees + 90) % 360,
    });
  },

  reselect() {
    this.setData({ imagePath: "", rotationDegrees: 0 });
  },

  manualEntry() {
    wx.navigateTo({ url: "/pages/confirm/confirm?manual=1" });
  },

  async upload() {
    if (this.data.uploading) {
      return;
    }
    this.setData({ uploading: true });
    try {
      const overview = await api.request("GET", "/home");
      if (overview.stage !== "ready") {
        throw new Error("请先创建孩子档案");
      }
      const draft = await api.request("POST", "/drafts", {
        childProfileId: overview.child.id,
        source: this.data.source,
      });
      if (this.data.rotationDegrees !== 0) {
        await api.request("PATCH", `/drafts/${draft.id}`, {
          rotationDegrees: this.data.rotationDegrees,
        });
      }
      const credential = await api.request(
        "POST",
        `/drafts/${draft.id}/photo-credential`,
      );
      const recognitionImagePath = await compressForRecognition(this.data.imagePath);
      const imageDataUrl = await readImageDataUrl(recognitionImagePath);
      const upload = await new Promise((resolve, reject) => {
        wx.cloud.uploadFile({
          cloudPath: credential.imageKey,
          filePath: recognitionImagePath,
          success: resolve,
          fail: reject,
        });
      });
      const temporaryUrl = await new Promise((resolve, reject) => {
        wx.cloud.getTempFileURL({
          fileList: [upload.fileID],
          success: (result) => {
            const file = result.fileList && result.fileList[0];
            if (!file || file.status !== 0 || !file.tempFileURL) {
              reject(new Error("无法获取图片临时地址"));
              return;
            }
            resolve(file.tempFileURL);
          },
          fail: reject,
        });
      });
      console.log("[photo_upload_ready]", {
        hasFileId: Boolean(upload.fileID),
        hasTemporaryUrl: Boolean(temporaryUrl),
        temporaryUrlLength: temporaryUrl ? temporaryUrl.length : 0,
        transport: config.transport,
      });
      const photoPayload = { childProfileId: overview.child.id, draftId: draft.id, kind: "single_question", imageKey: credential.imageKey, imageUrl: temporaryUrl, idempotencyKey: `${draft.id}-${Date.now()}` };
      console.log("[photo_recognition_submit]", {
        hasImageUrl: Boolean(photoPayload.imageUrl),
      });
      const task = await api.request("POST", "/recognition-tasks", photoPayload);
      const result = await waitForRecognition(task.taskId);
      const recognized = await api.request("POST", `/drafts/${draft.id}/recognition`, { recognition: result });
      wx.setStorageSync("currentDraft", recognized);
      wx.navigateTo({ url: `/pages/confirm/confirm?draftId=${draft.id}` });
    } catch (error) {
      wx.showModal({
        title: "上传或识别失败",
        content: `${errorMessage(error)}。可以重试，或改为手动录入。`,
        confirmText: "重试",
        cancelText: "手动录入",
        success: (res) => {
          if (!res.confirm) {
            this.manualEntry();
          }
        },
      });
    } finally {
      this.setData({ uploading: false });
    }
  },
});

function compressForRecognition(src) {
  return new Promise((resolve) => {
    wx.compressImage({
      src,
      quality: 55,
      compressedWidth: 1024,
      success: (result) => resolve(result.tempFilePath),
      fail: () => resolve(src),
    });
  });
}

async function waitForRecognition(taskId) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const task = await api.request("GET", `/recognition-tasks/${taskId}`);
    if (task.status === "succeeded") return task.result;
    if (task.status === "failed") throw new Error(task.error === "recognition_busy" ? "识别服务繁忙，请重试" : "未识别到清晰的数学题，请重新拍摄或手动录入");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("识别服务繁忙，请重试");
}

function readImageDataUrl(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: "base64",
      success: (result) => resolve(`data:image/jpeg;base64,${result.data}`),
      fail: reject,
    });
  });
}

function errorMessage(error) {
  if (error && error.message) return error.message;
  if (error && error.errMsg) return error.errMsg;
  return "识别服务暂不可用";
}
