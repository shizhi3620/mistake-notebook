const api = require("../../services/api");

const VERDICTS = ["正确", "错误", "待确认"];
const VERDICT_VALUES = ["correct", "incorrect", "uncertain"];

Page({
  data: {
    loading: true,
    childId: "",
    review: null,
    questions: [{ stem: "", studentAnswer: "", verdictIndex: 2 }],
    saving: false,
    verdicts: VERDICTS,
  },

  async onLoad() {
    try {
      const overview = await api.request("GET", "/home");
      if (overview.stage !== "ready") throw new Error("请先创建孩子档案");
      this.setData({ loading: false, childId: overview.child.id });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: error.message, icon: "none" });
    }
  },

  onQuestionInput(event) {
    const index = Number(event.currentTarget.dataset.index);
    const field = event.currentTarget.dataset.field;
    this.setData({ [`questions[${index}].${field}`]: event.detail.value });
  },

  onVerdictChange(event) {
    const index = Number(event.currentTarget.dataset.index);
    this.setData({ [`questions[${index}].verdictIndex`]: Number(event.detail.value) });
  },

  addQuestion() {
    this.setData({ questions: this.data.questions.concat({ stem: "", studentAnswer: "", verdictIndex: 2 }) });
  },

  async createReview() {
    if (this.data.questions.some((question) => !question.stem.trim())) {
      wx.showToast({ title: "请填写每道题的题干", icon: "none" });
      return;
    }
    this.setData({ saving: true });
    try {
      const review = await api.request("POST", "/homework-reviews", {
        childProfileId: this.data.childId,
        recognition: { questions: this.data.questions.map((question) => ({
          stem: question.stem.trim(),
          studentAnswer: question.studentAnswer.trim() || null,
          studentAnswerConfidence: question.studentAnswer.trim() ? 1 : null,
          verdict: VERDICT_VALUES[question.verdictIndex], confidence: 1,
          answerSource: "parent", referenceAnswer: null, reasoning: null,
          suggestedPrimaryKnowledgePoint: null,
          suggestedSecondaryKnowledgePoints: [], suggestedMistakeCause: null,
        })) },
      });
      this.setData({ review });
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    } finally {
      this.setData({ saving: false });
    }
  },

  onCandidateInput(event) {
    const index = Number(event.currentTarget.dataset.index);
    const field = event.currentTarget.dataset.field;
    this.setData({ [`review.candidates[${index}].${field}`]: event.detail.value });
  },

  async confirmCandidate(event) {
    const index = Number(event.currentTarget.dataset.index);
    const candidate = this.data.review.candidates[index];
    const verdict = VERDICT_VALUES[Number(event.currentTarget.dataset.verdict)];
    try {
      const updated = await api.request(
        "POST",
        `/homework-reviews/${this.data.review.id}/questions/${candidate.id}/confirm`,
        {
          verdict,
          stem: candidate.stem,
          studentAnswer: candidate.studentAnswer,
          primaryKnowledgePoint: candidate.primaryKnowledgePoint || undefined,
          mistakeCause: candidate.mistakeCause || undefined,
        },
      );
      this.setData({ [`review.candidates[${index}]`]: updated });
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    }
  },

  finish() { wx.navigateBack(); },
});
