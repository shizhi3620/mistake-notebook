const api = require("../../services/api");

const app = getApp();

Page({
  data: {
    loading: true,
    needsGuardianship: false,
    stage: "",
    child: null,
    dueReviewCount: 0,
    dueReviews: [],
    recentMistakes: [],
    sevenDaySummary: { newMistakes: 0, completedReviews: 0 },
    streakDays: 0,
    form: {
      nickname: "",
      grade: 3,
      location: null,
      regionLabel: "请选择省、市",
      textbookVersion: "",
    },
    grades: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    gradeIndex: 2,
    saving: false,
  },

  onShow() {
    this.load();
  },

  async load() {
    try {
      const account = await app.ensureAccount();
      if (!account.guardianshipConfirmed) {
        this.setData({ loading: false, needsGuardianship: true, stage: "" });
        return;
      }
      const overview = await api.request("GET", "/home");
      this.setData({
        loading: false,
        needsGuardianship: false,
        stage: overview.stage,
        child: overview.stage === "ready" ? overview.child : null,
        dueReviewCount: overview.dueReviewCount || 0,
        dueReviews: overview.dueReviews || [],
        recentMistakes: overview.recentMistakes || [],
        sevenDaySummary: overview.sevenDaySummary || {
          newMistakes: 0,
          completedReviews: 0,
        },
        streakDays: overview.streakDays || 0,
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: error.message, icon: "none" });
    }
  },

  async confirmGuardianship() {
    try {
      const account = await api.request("POST", "/guardianship/confirm");
      app.globalData.account = account;
      this.load();
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    }
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
      "form.location": {
        provinceCode: codes[0] || "",
        provinceName: names[0] || "",
        cityCode: codes[1] || "",
        cityName: names[1] || "",
      },
      "form.regionLabel": names.slice(0, 2).join(" · "),
    });
  },

  async createChild() {
    const { nickname, grade, location, textbookVersion } = this.data.form;
    if (!nickname.trim() || !location) {
      wx.showToast({ title: "请选择昵称、省和市", icon: "none" });
      return;
    }
    this.setData({ saving: true });
    try {
      await api.request("POST", "/children", {
        nickname: nickname.trim(),
        grade,
        location,
        textbookVersion: textbookVersion.trim() || undefined,
      });
      wx.showToast({ title: "档案已创建", icon: "success" });
      this.load();
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    } finally {
      this.setData({ saving: false });
    }
  },

  goCapture() {
    wx.navigateTo({ url: "/pages/capture/capture" });
  },

  goHomework() {
    wx.navigateTo({ url: "/pages/homework/homework" });
  },

  goReview() {
    wx.navigateTo({ url: "/pages/review/review" });
  },

  goReport() {
    wx.navigateTo({ url: "/pages/report/report" });
  },

  goMistakes() {
    wx.switchTab({ url: "/pages/mistakes/mistakes" });
  },
});
