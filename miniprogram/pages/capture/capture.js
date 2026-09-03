const api = require("../../services/api");
const config = require("../../config");

Page({
  data: {
    imagePath: "",
    rotationDegrees: 0,
    source: "camera",
    uploading: false,
    taskId: "",
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
    this.stopPolling();
    this.setData({ imagePath: "", rotationDegrees: 0, taskId: "" });
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
      const upload = await new Promise((resolve, reject) => {
        wx.cloud.uploadFile({
          cloudPath: credential.imageKey,
          filePath: recognitionImagePath,
          success: resolve,
          fail: reject,
        });
      });
      console.log("[photo_upload_ready]", {
        hasFileId: Boolean(upload.fileID),
        transport: config.transport,
      });
      const photoPayload = { childProfileId: overview.child.id, draftId: draft.id, kind: "single_question", fileId: upload.fileID, uploadToken: credential.uploadToken, idempotencyKey: `${draft.id}-${Date.now()}` };
      const task = await api.request("POST", "/recognition-tasks", photoPayload);
      this.setData({ taskId: task.taskId });
      wx.setStorageSync("captureRecognitionTask", { taskId: task.taskId, draftId: draft.id, expiresAt: Date.now() + 60_000 });
      const result = await this.waitForRecognition(task.taskId);
      await this.completeRecognition(draft.id, result);
    } catch (error) {
      wx.showModal({
        title: "上传或识别失败",
        content: `${errorMessage(error)}。可以重试，或改为手动录入。`,
        confirmText: "重试",
        cancelText: "手动录入",
        success: (res) => {
          if (res.confirm) {
            this.upload();
          } else {
            this.manualEntry();
          }
        },
      });
    } finally {
      this.setData({ uploading: false });
    }
  },
  onShow() {
    const saved = wx.getStorageSync("captureRecognitionTask");
    if (saved && saved.expiresAt > Date.now() && !this.data.uploading) this.waitForRecognition(saved.taskId).then((result) => this.completeRecognition(saved.draftId, result)).catch(() => {});
  },
  onUnload() { this.stopPolling(); },
  stopPolling() { this.polling = false; },
  async waitForRecognition(taskId) {
    this.stopPolling(); this.polling = true;
    try { return await waitForRecognition(taskId, () => this.polling); }
    finally { this.polling = false; }
  },
  async completeRecognition(draftId, result) {
    const recognized = await api.request("POST", `/drafts/${draftId}/recognition`, { recognition: result });
    if (wx.removeStorageSync) wx.removeStorageSync("captureRecognitionTask");
    wx.setStorageSync("currentDraft", recognized);
    wx.navigateTo({ url: `/pages/confirm/confirm?draftId=${draftId}` });
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

async function waitForRecognition(taskId, active = () => true) {
  const deadline = Date.now() + 60_000;
  while (active() && Date.now() < deadline) {
    const task = await api.request("GET", `/recognition-tasks/${taskId}`);
    if (task.status === "succeeded") return task.result;
    if (task.status === "failed") throw new Error(task.error === "recognition_busy" || task.error === "recognition_dispatch_failed" ? "识别服务繁忙，请重试" : "未识别到清晰的数学题，请重新拍摄或手动录入");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("识别服务繁忙，请重试");
}

function errorMessage(error) {
  if (error && error.message) return error.message;
  if (error && error.errMsg) return error.errMsg;
  return "识别服务暂不可用";
}
