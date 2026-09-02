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
      const photoPayload = {
        uploadToken: credential.uploadToken,
        fileId: upload.fileID,
        imageKey: credential.imageKey,
        ...(config.transport === "https" ? { imageDataUrl } : { imageUrl: temporaryUrl }),
      };
      console.log("[photo_recognition_submit]", {
        hasFileId: Boolean(photoPayload.fileId),
        hasUploadToken: Boolean(photoPayload.uploadToken),
        hasImageDataUrl: Boolean(photoPayload.imageDataUrl),
        hasImageUrl: Boolean(photoPayload.imageUrl),
        imageDataUrlLength: photoPayload.imageDataUrl ? photoPayload.imageDataUrl.length : 0,
      });
      const recognized = await api.request("POST", `/drafts/${draft.id}/photo`, photoPayload);
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
