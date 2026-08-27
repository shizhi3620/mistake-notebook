const api = require("../../services/api");

Page({
  data: {
    loading: true,
    due: [],
    childId: "",
    session: null,
    phase: "list", // list | recall | exercise | done
    variantCorrect: null,
    result: null,
  },

  onShow() {
    this.load();
  },

  async load() {
    try {
      const overview = await api.request("GET", "/home");
      if (overview.stage !== "ready") {
        this.setData({ loading: false, due: [] });
        return;
      }
      const due = await api.request(
        "GET",
        `/reviews/due?childProfileId=${overview.child.id}`,
      );
      this.setData({ loading: false, due, childId: overview.child.id });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: error.message, icon: "none" });
    }
  },

  async startReview(event) {
    const mistakeId = event.currentTarget.dataset.id;
    const exercise = event.currentTarget.dataset.exercise || "original";
    try {
      const session = await api.request("POST", "/reviews", {
        mistakeId,
        exercise,
      });
      this.setData({ session, phase: "recall", variantCorrect: null });
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    }
  },

  recalled() {
    this.setData({ phase: "exercise" });
  },

  markVariant(event) {
    this.setData({ variantCorrect: event.currentTarget.dataset.value === "1" });
  },

  async assess(event) {
    const selfAssessment = event.currentTarget.dataset.value;
    if (
      this.data.session.exercise.kind === "variant" &&
      this.data.variantCorrect === null
    ) {
      wx.showToast({ title: "请先标记变式题是否答对", icon: "none" });
      return;
    }
    try {
      const result = await api.request(
        "POST",
        `/reviews/${this.data.session.reviewId}/complete`,
        {
          selfAssessment,
          variantCorrect:
            this.data.session.exercise.kind === "variant"
              ? this.data.variantCorrect
              : null,
        },
      );
      this.setData({ result, phase: "done" });
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    }
  },

  backToList() {
    this.setData({ session: null, phase: "list", result: null });
    this.load();
  },
});
