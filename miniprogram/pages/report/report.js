const api = require("../../services/api");

Page({
  data: {
    loading: true,
    report: null,
  },

  onShow() {
    this.load();
  },

  async load() {
    try {
      const overview = await api.request("GET", "/home");
      if (overview.stage !== "ready") {
        this.setData({ loading: false, report: null });
        return;
      }
      const report = await api.request(
        "GET",
        `/reports/weekly?childProfileId=${overview.child.id}`,
      );
      this.setData({ report, loading: false });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: error.message, icon: "none" });
    }
  },

  goMistakes() {
    wx.switchTab({ url: "/pages/mistakes/mistakes" });
  },
});
