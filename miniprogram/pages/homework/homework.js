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
    imagePath: "",
    recognizing: false,
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

  chooseImage(event) {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: [event.currentTarget.dataset.source],
      success: (result) => this.setData({ imagePath: result.tempFiles[0].tempFilePath }),
      fail: () => wx.showToast({ title: "未选择图片", icon: "none" }),
    });
  },

  clearImage() { this.setData({ imagePath: "" }); },

  async recognizeImage() {
    if (!this.data.imagePath) return;
    this.setData({ recognizing: true });
    try {
      console.log("[homework_recognition_started]", { transport: require("../../config").transport });
      const imageDataUrl = await compressForContainer(this.data.imagePath);
      console.log("[homework_recognition_image_ready]", { imageDataUrlLength: imageDataUrl.length });
      if (imageDataUrl.length > 95_000) throw new Error("图片过大，请裁剪作业区域后重试");
      const review = await api.request("POST", "/homework-reviews", {
        childProfileId: this.data.childId,
        imageDataUrl,
      });
      console.log("[homework_recognition_succeeded]", { questionCount: review.candidates ? review.candidates.length : 0 });
      this.setData({ review });
    } catch (error) {
      console.error("[homework_recognition_failed]", { errorMessage: error && error.message ? String(error.message).slice(0, 300) : "" });
      wx.showModal({ title: "作业识别失败", content: `${error.message || "请重试"}。也可以手动录入。`, confirmText: "手动录入", cancelText: "重试", success: (result) => { if (result.confirm) this.clearImage(); } });
    } finally { this.setData({ recognizing: false }); }
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

async function compressForContainer(src) {
  const attempts = [
    { quality: 30, compressedWidth: 768 },
    { quality: 22, compressedWidth: 640 },
    { quality: 16, compressedWidth: 512 },
    { quality: 12, compressedWidth: 400 },
    { quality: 8, compressedWidth: 320 },
  ];
  let imageDataUrl = await readImageDataUrl(src);
  for (const attempt of attempts) {
    if (imageDataUrl.length <= 70_000) return imageDataUrl;
    const path = await compress(src, attempt.quality, attempt.compressedWidth);
    imageDataUrl = await readImageDataUrl(path);
  }
  return imageDataUrl;
}

function compress(src, quality, compressedWidth) {
  return new Promise((resolve) => wx.compressImage({ src, quality, compressedWidth, success: (result) => resolve(result.tempFilePath), fail: () => resolve(src) }));
}

function readImageDataUrl(filePath) {
  return new Promise((resolve, reject) => wx.getFileSystemManager().readFile({ filePath, encoding: "base64", success: (result) => resolve(`data:image/jpeg;base64,${result.data}`), fail: reject }));
}
