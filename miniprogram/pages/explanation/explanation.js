const api = require("../../services/api");

Page({
  data: {
    questionId: "",
    loading: true,
    explanation: null,
    showApproach: false,
    showSteps: false,
    showAnswer: false,
    mistakeForm: { primary: "", secondary: "", cause: "" },
    saved: false,
    saving: false,
  },

  onLoad(options) {
    this.setData({ questionId: options.questionId || "" });
    this.load();
  },

  async load() {
    try {
      const explanation = await api.request(
        "GET",
        `/questions/${this.data.questionId}/explanation`,
      );
      this.setData({
        explanation,
        loading: false,
        mistakeForm: {
          primary: explanation.suggestedPrimaryKnowledgePoint || "",
          secondary: (explanation.suggestedSecondaryKnowledgePoints || []).join(","),
          cause: explanation.suggestedMistakeCause || "",
        },
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showModal({
        title: "无法生成讲解",
        content: error.message,
        showCancel: false,
      });
    }
  },

  revealApproach() {
    this.setData({ showApproach: true });
  },

  revealSteps() {
    this.setData({ showSteps: true });
  },

  async revealAnswer() {
    try {
      const explanation = await api.request(
        "GET",
        `/questions/${this.data.questionId}/explanation?reveal=1`,
      );
      if (!explanation.finalAnswer) {
        wx.showToast({
          title: "家长未开启直接查看答案，可在“我的”中调整",
          icon: "none",
        });
        return;
      }
      this.setData({ explanation, showAnswer: true });
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    }
  },

  onMistakeInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`mistakeForm.${field}`]: event.detail.value });
  },

  async saveMistake() {
    const { primary, secondary, cause } = this.data.mistakeForm;
    if (!primary.trim()) {
      wx.showToast({ title: "请填写主知识点", icon: "none" });
      return;
    }
    this.setData({ saving: true });
    try {
      await api.request(
        "POST",
        `/questions/${this.data.questionId}/mistake`,
        {
          primaryKnowledgePoint: primary.trim(),
          secondaryKnowledgePoints: secondary
            .split(/[,，]/)
            .map((point) => point.trim())
            .filter(Boolean),
          mistakeCause: cause.trim() || undefined,
        },
      );
      this.setData({ saved: true });
      wx.showToast({ title: "已加入错题本", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    } finally {
      this.setData({ saving: false });
    }
  },

  finish() {
    wx.switchTab({ url: "/pages/home/home" });
  },
});
