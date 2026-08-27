const api = require("../../services/api");

const MASTERY_OPTIONS = [
  { value: "", label: "全部状态" },
  { value: "not-started", label: "未开始" },
  { value: "learning", label: "学习中" },
  { value: "mastered", label: "已掌握" },
];

Page({
  data: {
    loading: true,
    childId: "",
    mistakes: [],
    keyword: "",
    knowledgePoint: "",
    mistakeCause: "",
    masteryIndex: 0,
    masteryOptions: MASTERY_OPTIONS.map((option) => option.label),
  },

  onShow() {
    this.load();
  },

  async load() {
    try {
      const overview = await api.request("GET", "/home");
      if (overview.stage !== "ready") {
        this.setData({ loading: false, mistakes: [], childId: "" });
        return;
      }
      this.setData({ childId: overview.child.id });
      await this.search();
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: error.message, icon: "none" });
    }
  },

  async search() {
    if (!this.data.childId) {
      return;
    }
    const params = new URLSearchParams({ childProfileId: this.data.childId });
    if (this.data.keyword.trim()) {
      params.set("keyword", this.data.keyword.trim());
    }
    if (this.data.knowledgePoint.trim()) {
      params.set("knowledgePoint", this.data.knowledgePoint.trim());
    }
    if (this.data.mistakeCause.trim()) {
      params.set("mistakeCause", this.data.mistakeCause.trim());
    }
    const mastery = MASTERY_OPTIONS[this.data.masteryIndex].value;
    if (mastery) {
      params.set("masteryStatus", mastery);
    }
    try {
      const mistakes = await api.request("GET", `/mistakes?${params}`);
      this.setData({ mistakes, loading: false });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: error.message, icon: "none" });
    }
  },

  onFilterInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [field]: event.detail.value });
  },

  onMasteryChange(event) {
    this.setData({ masteryIndex: Number(event.detail.value) }, () =>
      this.search(),
    );
  },

  editCause(event) {
    const { id, cause } = event.currentTarget.dataset;
    wx.showModal({
      title: "修改错因",
      editable: true,
      placeholderText: "如：粗心抄错数字",
      content: cause || "",
      success: async (res) => {
        if (!res.confirm) {
          return;
        }
        try {
          await api.request("PATCH", `/mistakes/${id}`, {
            mistakeCause: res.content || "",
          });
          this.search();
        } catch (error) {
          wx.showToast({ title: error.message, icon: "none" });
        }
      },
    });
  },

  remove(event) {
    const id = event.currentTarget.dataset.id;
    wx.showModal({
      title: "删除这道错题？",
      content: "题目与关联学习记录将一并删除，无法恢复。",
      confirmColor: "#d83931",
      success: async (res) => {
        if (!res.confirm) {
          return;
        }
        try {
          await api.request("DELETE", `/mistakes/${id}`);
          this.search();
        } catch (error) {
          wx.showToast({ title: error.message, icon: "none" });
        }
      },
    });
  },
});
