const api = require("../../services/api");

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
      const imageDataUrl = await this.readAsDataUrl(this.data.imagePath);
      const recognized = await api.request(
        "POST",
        `/drafts/${draft.id}/photo`,
        { imageDataUrl },
      );
      wx.setStorageSync("currentDraft", recognized);
      wx.navigateTo({ url: `/pages/confirm/confirm?draftId=${draft.id}` });
    } catch (error) {
      wx.showModal({
        title: "上传或识别失败",
        content: `${error.message}。可以重试，或改为手动录入。`,
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

  readAsDataUrl(path) {
    return new Promise((resolve, reject) => {
      wx.getFileSystemManager().readFile({
        filePath: path,
        success: (res) => {
          const base64 = wx.arrayBufferToBase64(res.data);
          resolve(`data:image/jpeg;base64,${base64}`);
        },
        fail: () => reject(new Error("读取图片失败")),
      });
    });
  },
});
