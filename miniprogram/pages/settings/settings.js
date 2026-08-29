const api = require("../../services/api");
const provinceOptions = require("../../services/provinces");

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
    editingChildId: "",
    form: {
      nickname: "",
      grade: 3,
      location: null,
      region: "",
    },
    provinces: ["请选择省份（选填）"].concat(provinceOptions.map((item) => item.name)),
    provinceIndex: 0,
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
      const displayChildren = children.map((child) => ({
        ...child,
        provinceLabel: child.location && child.location.provinceName
          ? child.location.provinceName
          : String(child.region || "").split(/\s+/)[0],
      }));
      this.setData({
        loading: false,
        account,
        children: displayChildren,
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
    this.setData({
      showChildForm: !this.data.showChildForm,
      editingChildId: "",
      form: { nickname: "", grade: 3, location: null, region: "" },
      gradeIndex: 2,
      provinceIndex: 0,
    });
  },

  editChild(event) {
    const child = this.data.children.find((item) => item.id === event.currentTarget.dataset.id);
    if (!child) return;
    const grade = Number(child.grade || 3);
    const provinceCode = child.location && child.location.provinceCode;
    const provinceIndex = Math.max(0, provinceOptions.findIndex((item) => item.code === provinceCode) + 1);
    this.setData({
      showChildForm: true,
      editingChildId: child.id,
      form: {
        nickname: child.nickname,
        grade,
        location: child.location && child.location.provinceCode && child.location.provinceName
          ? { provinceCode: child.location.provinceCode, provinceName: child.location.provinceName }
          : null,
        region: provinceIndex ? provinceOptions[provinceIndex - 1].name : "",
      },
      gradeIndex: Math.max(0, this.data.grades.indexOf(grade)),
      provinceIndex,
    });
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

  onProvinceChange(event) {
    const index = Number(event.detail.value);
    const province = provinceOptions[index - 1];
    this.setData({
      provinceIndex: index,
      "form.location": province ? { provinceCode: province.code, provinceName: province.name } : null,
      "form.region": province ? province.name : "",
    });
  },

  async saveChild() {
    const form = this.data.form || {};
    const nickname = String(form.nickname || "").trim();
    const region = String(form.region || "").trim();
    const grade = Number(form.grade || 0);
    const location = form.location || null;
    if (!nickname) {
      wx.showToast({ title: "请输入孩子昵称", icon: "none" });
      return;
    }
    try {
      const payload = {
        nickname,
        grade,
        ...(location ? { location } : region ? { region } : {}),
      };
      if (this.data.editingChildId) {
        await api.request("PATCH", `/children/${this.data.editingChildId}`, payload);
      } else {
        await api.request("POST", "/children", payload);
      }
      this.setData({ showChildForm: false, editingChildId: "" });
      this.load();
    } catch (error) {
      wx.showToast({ title: error && error.message ? error.message : "创建失败，请稍后重试", icon: "none" });
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
