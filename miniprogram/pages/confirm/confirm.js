const api = require("../../services/api");

Page({
  data: {
    draftId: "",
    manual: false,
    stem: "",
    confidence: 1,
    lowConfidence: false,
    studentAnswerConfidence: null,
    lowStudentAnswerConfidence: false,
    studentAnswer: "",
    skipAnalysis: false,
    confirming: false,
  },

  onLoad(options) {
    if (options.manual) {
      this.setData({ manual: true });
      return;
    }
    const draft = wx.getStorageSync("currentDraft");
    wx.removeStorageSync("currentDraft");
    const recognition = draft && draft.recognition;
    const confidence = recognition ? recognition.confidence : 0;
    this.setData({
      draftId: options.draftId || (draft && draft.id) || "",
      stem: recognition ? recognition.stem : "",
      confidence,
      lowConfidence: confidence < 0.6,
      studentAnswer: recognition?.studentAnswer || "",
      studentAnswerConfidence: recognition?.studentAnswerConfidence ?? null,
      lowStudentAnswerConfidence:
        recognition?.studentAnswerConfidence !== undefined &&
        recognition.studentAnswerConfidence !== null &&
        recognition.studentAnswerConfidence < 0.6,
    });
  },

  onStemInput(event) {
    this.setData({ stem: event.detail.value });
  },

  onAnswerInput(event) {
    this.setData({ studentAnswer: event.detail.value });
  },

  onSkipChange(event) {
    this.setData({ skipAnalysis: event.detail.value });
  },

  retake() {
    wx.navigateBack();
  },

  async confirm() {
    if (!this.data.stem.trim()) {
      wx.showToast({ title: "请填写题干", icon: "none" });
      return;
    }
    this.setData({ confirming: true });
    try {
      let draftId = this.data.draftId;
      if (this.data.manual) {
        const overview = await api.request("GET", "/home");
        if (overview.stage !== "ready") {
          throw new Error("请先创建孩子档案");
        }
        const draft = await api.request("POST", "/drafts", {
          childProfileId: overview.child.id,
          source: "manual",
        });
        draftId = draft.id;
      }
      const question = await api.request(
        "POST",
        `/drafts/${draftId}/confirm`,
        {
          stem: this.data.stem,
          studentAnswer: this.data.skipAnalysis
            ? undefined
            : this.data.studentAnswer || undefined,
        },
      );
      if (this.data.skipAnalysis) {
        await api.request("PUT", `/questions/${question.id}/student-answer`, {
          skipAnalysis: true,
        });
      }
      wx.redirectTo({
        url: `/pages/explanation/explanation?questionId=${question.id}`,
      });
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    } finally {
      this.setData({ confirming: false });
    }
  },
});
