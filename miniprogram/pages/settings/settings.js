const api = require("../../services/api");

Page({
  data: {
    loading: true,
    children: [],
    selectedChildId: "",
    entitlements: null,
    account: null,
    reminderEnabled: false,
    reminderHour: 20,
    hours: Array.from({ length: 24 }, (_, index) => `${index}:00`),
    hourIndex: 20,
    showChildForm: false,
    form: {
      nickname: "",
      grade: 3,
      location: null,
      region: "",
      regionLabel: "请选择省、市",
      textbookVersion: "",
    },
    grades: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    gradeIndex: 2,
  },

  onShow() {
    this.load();
  },

  async load() {
    const app = getApp();
    try {
      const account = await app.ensureAccount();
      const children = await api.request("GET", "/children");
      const entitlements = await api.request("GET", "/entitlements");
      const overview = await api.request("GET", "/home");
      this.setData({
        loading: false,
        account,
        children,
        entitlements,
        selectedChildId: overview.stage === "ready" ? overview.child.id : "",
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: error.message, icon: "none" });
    }
  },

  async selectChild(event) {
    const id = event.currentTarget.dataset.id;
    try {
      await api.request("POST", `/children/${id}/select`);
      this.setData({ selectedChildId: id });
      wx.showToast({ title: "已切换", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    }
  },

  removeChild(event) {
    const id = event.currentTarget.dataset.id;
    wx.showModal({
      title: "删除该孩子档案？",
      content: "错题、复习记录与学习数据将一并删除，无法恢复。",
      confirmColor: "#d83931",
      success: async (res) => {
        if (!res.confirm) {
          return;
        }
        try {
          await api.request("DELETE", `/children/${id}`);
          this.load();
        } catch (error) {
          wx.showToast({ title: error.message, icon: "none" });
        }
      },
    });
  },

  toggleChildForm() {
    this.setData({ showChildForm: !this.data.showChildForm });
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: event.detail.value });
  },

  onGradeChange(event) {
    this.setData({
      gradeIndex: Number(event.detail.value),
      "form.grade": this.data.grades[Number(event.detail.value)],
    });
  },

  onLocationChange(event) {
    const names = event.detail.value || [];
    const codes = event.detail.code || [];
    this.setData({
      "form.location": codes.length >= 2 && names.length >= 2 ? {
        provinceCode: codes[0], provinceName: names[0],
        cityCode: codes[1], cityName: names[1],
      } : null,
      "form.regionLabel": names.slice(0, 2).join(" · "),
      "form.region": names.slice(0, 2).join(" "),
    });
  },

  async createChild() {
    const { nickname, grade, location, textbookVersion } = this.data.form;
    if (!nickname.trim() || (!location && !this.data.form.region.trim())) {
      wx.showToast({ title: "请选择昵称、省和市", icon: "none" });
      return;
    }
    try {
      await api.request("POST", "/children", {
        nickname: nickname.trim(),
        grade,
        ...(location ? { location } : { region: this.data.form.region.trim() }),
        textbookVersion: textbookVersion.trim() || undefined,
      });
      this.setData({ showChildForm: false });
      this.load();
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    }
  },

  async toggleAnswerReveal(event) {
    try {
      const account = await api.request("PUT", "/settings/answer-reveal", {
        allow: event.detail.value,
      });
      getApp().globalData.account = account;
      this.setData({ account });
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    }
  },

  async toggleReminder(event) {
    this.setData({ reminderEnabled: event.detail.value });
    await this.saveReminder();
  },

  onHourChange(event) {
    this.setData({
      hourIndex: Number(event.detail.value),
      reminderHour: Number(event.detail.value),
    });
    this.saveReminder();
  },

  async saveReminder() {
    if (!this.data.selectedChildId) {
      return;
    }
    try {
      await api.request(
        "PUT",
        `/children/${this.data.selectedChildId}/reminders`,
        {
          enabled: this.data.reminderEnabled,
          hourOfDay: this.data.reminderHour,
        },
      );
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    }
  },

  async subscribe() {
    // 开发调试入口：真实支付在后续独立规格中实现。
    try {
      await api.request("POST", "/subscription", { plan: "subscriber" });
      wx.showToast({ title: "已升级为订阅（调试）", icon: "success" });
      this.load();
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    }
  },
});
