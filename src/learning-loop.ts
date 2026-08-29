import { randomUUID } from "node:crypto";

export type ProvinceCity = {
  provinceCode: string;
  provinceName: string;
  cityCode?: string;
  cityName?: string;
};

export type ChildProfileInput = {
  nickname: string;
  grade: number;
  location?: ProvinceCity;
  // Kept during the region migration for clients and profiles created before it.
  region?: string;
  textbookVersion?: string;
};

export type ParentAccount = {
  id: string;
  guardianshipConfirmed: boolean;
  allowDirectAnswerReveal: boolean;
  plan: SubscriptionPlan;
};

export type SubscriptionPlan = "free" | "subscriber";

export type PlanEntitlements = {
  monthlyPhotoQuota: number;
  maxChildProfiles: number;
  fullWeeklyReport: boolean;
  monthlyVariantExerciseQuota: number | null;
};

export const PLAN_ENTITLEMENTS: Record<SubscriptionPlan, PlanEntitlements> = {
  free: {
    monthlyPhotoQuota: 20,
    maxChildProfiles: 2,
    fullWeeklyReport: false,
    monthlyVariantExerciseQuota: 10,
  },
  subscriber: {
    monthlyPhotoQuota: 500,
    maxChildProfiles: 5,
    fullWeeklyReport: true,
    monthlyVariantExerciseQuota: null,
  },
};

export type EntitlementsView = PlanEntitlements & {
  plan: SubscriptionPlan;
  photosUsedThisMonth: number;
  variantExercisesUsedThisMonth: number;
};

export type LoginSession = {
  token: string;
  parentAccountId: string;
  expiresAt: number;
};

export type WeChatLogin = {
  account: ParentAccount;
  session: LoginSession;
};

export type ChildProfile = ChildProfileInput & {
  id: string;
  parentAccountId: string;
};

export type QuestionSource = "camera" | "album" | "manual";

export type CropRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type QuestionRecognition = {
  stem: string;
  formulas: string[];
  region: CropRegion | null;
  confidence: number;
  studentAnswer?: string | null;
  studentAnswerConfidence?: number | null;
};

export type QuestionDraft = {
  id: string;
  parentAccountId: string;
  childProfileId: string;
  source: QuestionSource;
  imageKey: string | null;
  crop: CropRegion | null;
  rotationDegrees: number;
  recognition: QuestionRecognition | null;
};

export type PhotoUploadCredential = {
  uploadToken: string;
  parentAccountId: string;
  draftId: string;
  imageKey: string;
  expiresAt: number;
  usedAt: number | null;
};

export type ConfirmedQuestion = {
  id: string;
  parentAccountId: string;
  childProfileId: string;
  source: QuestionSource;
  stem: string;
  formulas: string[];
  imageKey: string | null;
  crop: CropRegion | null;
  rotationDegrees: number;
  region: CropRegion | null;
  studentAnswer: string | null;
  answerAnalysisSkipped: boolean;
  status: "confirmed" | "pending-confirmation";
  createdAt: number;
};

export type ExplanationRequest = {
  stem: string;
  formulas: string[];
  grade: number;
  studentAnswer: string | null;
  skipAnswerAnalysis: boolean;
};

export type ExplanationContent = {
  hint: string;
  approach: string;
  steps: string[];
  finalAnswer: string;
  variantExercise: { stem: string; answer: string };
  suggestedPrimaryKnowledgePoint?: string | null;
  suggestedSecondaryKnowledgePoints?: string[];
  suggestedMistakeCause?: string | null;
};

export type Explanation = {
  questionId: string;
  grade: number;
  hint: string;
  approach: string;
  steps: string[];
  answerAvailable: boolean;
  finalAnswer: string | null;
  variantExercise: { stem: string; answer: string | null };
  suggestedPrimaryKnowledgePoint: string | null;
  suggestedSecondaryKnowledgePoints: string[];
  suggestedMistakeCause: string | null;
};

export type MistakeRecord = {
  id: string;
  parentAccountId: string;
  childProfileId: string;
  questionId: string;
  primaryKnowledgePoint: string;
  secondaryKnowledgePoints: string[];
  mistakeCause: string | null;
  masteryStatus: "not-started" | "learning" | "mastered";
  createdAt: number;
};

export type MistakeBookEntry = MistakeRecord & {
  stem: string;
};

export type MistakeFilters = {
  knowledgePoint?: string;
  mistakeCause?: string;
  createdFrom?: number;
  createdTo?: number;
  masteryStatus?: MistakeRecord["masteryStatus"];
  keyword?: string;
};

export const REVIEW_INTERVAL_DAYS = [1, 2, 4, 7, 15, 30] as const;

export const MASTERY_NOTE =
  "掌握度是基于错题与复习表现的学习记录指标，用于安排复习节奏，并非考试评价。";

export type ReviewSchedule = {
  mistakeId: string;
  parentAccountId: string;
  childProfileId: string;
  intervalIndex: number;
  nextReviewAt: number;
  masteryScore: number;
  reviewCount: number;
};

export type ReviewScheduleView = {
  mistakeId: string;
  intervalDays: number;
  nextReviewAt: number;
  masteryScore: number;
  masteryStatus: MistakeRecord["masteryStatus"];
  reviewCount: number;
  masteryNote: string;
};

export type DueReview = MistakeBookEntry & {
  nextReviewAt: number;
  masteryScore: number;
};

export type ReviewSelfAssessment = "not-yet" | "partially" | "mastered";

export type Review = {
  id: string;
  parentAccountId: string;
  mistakeId: string;
  exerciseKind: "original" | "variant";
  startedAt: number;
  completedAt: number | null;
  selfAssessment: ReviewSelfAssessment | null;
  variantCorrect: boolean | null;
  resultIntervalIndex: number | null;
  resultNextReviewAt: number | null;
  resultMasteryScore: number | null;
};

export type ReviewSession = {
  reviewId: string;
  recallPrompt: string;
  exercise: { kind: "original" | "variant"; stem: string };
};

export type ReviewResult = {
  alreadyRecorded: boolean;
  intervalDays: number;
  nextReviewAt: number;
  masteryScore: number;
  masteryStatus: MistakeRecord["masteryStatus"];
  masteryNote: string;
};

export type HomeOverview =
  | { stage: "no-child-profile" }
  | {
      stage: "ready";
      child: ChildProfile;
      dueReviewCount: number;
      dueReviews: DueReview[];
      recentMistakes: MistakeBookEntry[];
      sevenDaySummary: { newMistakes: number; completedReviews: number };
      streakDays: number;
    };

export const WEEKLY_REPORT_COMPARISON_NOTE =
  "本报告仅包含该孩子本人的学习记录，用于家庭支持，不包含任何排名或与其他孩子的比较。";

export type WeaknessEntry = {
  knowledgePoint: string;
  weaknessScore: number;
  mistakeCount: number;
  correctPracticeCount: number;
  averageMasteryScore: number;
  strugglingReviews: number;
  variantMisses: number;
  mistakeIds: string[];
  suggestion: string;
};

export type WeeklyReport = {
  childId: string;
  weekStart: number;
  weekEnd: number;
  full: boolean;
  empty: boolean;
  newMistakes: number;
  completedReviews: number;
  masteryChange: {
    netChange: number;
    improvedReviews: number;
    declinedReviews: number;
  };
  weaknesses: WeaknessEntry[];
  nextWeekPlan: { scheduledReviews: number; focusKnowledgePoints: string[] };
  suggestion: string;
  upgradeNote: string | null;
  comparisonNote: string;
};

export type ReminderSettings = {
  parentAccountId: string;
  childProfileId: string;
  enabled: boolean;
  hourOfDay: number;
};

export type ReminderNotification = {
  childNickname: string | null;
  dueCount: number;
  entryPath: string;
};

export type ReminderDispatch = {
  id: string;
  parentAccountId: string;
  childProfileId: string;
  dateKey: string;
  sentAt: number;
  status: "sent" | "failed";
};

export type ReminderDispatchOutcome = {
  childProfileId: string;
  status: "sent" | "failed";
};

export type HomeworkVerdict = "correct" | "incorrect" | "uncertain";

export type HomeworkAnswerSource = "teacher" | "parent" | "ai";

export type HomeworkQuestionCandidate = {
  id: string;
  stem: string;
  studentAnswer: string | null;
  studentAnswerConfidence: number | null;
  verdict: HomeworkVerdict;
  confidence: number;
  answerSource: HomeworkAnswerSource;
  referenceAnswer: string | null;
  reasoning: string | null;
  suggestedPrimaryKnowledgePoint: string | null;
  suggestedSecondaryKnowledgePoints: string[];
  suggestedMistakeCause: string | null;
  confirmedVerdict: HomeworkVerdict | null;
  questionId: string | null;
  mistakeId: string | null;
};

export type HomeworkReview = {
  id: string;
  parentAccountId: string;
  childProfileId: string;
  imageKey: string | null;
  createdAt: number;
  candidates: HomeworkQuestionCandidate[];
};

export type HomeworkRecognition = {
  questions: Omit<HomeworkQuestionCandidate, "id" | "confirmedVerdict" | "questionId" | "mistakeId">[];
};

export type CorrectPracticeEvidence = {
  id: string;
  parentAccountId: string;
  childProfileId: string;
  homeworkReviewId: string;
  knowledgePoint: string | null;
  createdAt: number;
};

export interface LearningLoopStore {
  createParentAccount(account: ParentAccount): void;
  findParentAccount(parentAccountId: string): ParentAccount | undefined;
  findParentAccountByWeChatSubject(
    weChatSubject: string,
  ): ParentAccount | undefined;
  saveWeChatSubject(parentAccountId: string, weChatSubject: string): void;
  saveParentAccount(account: ParentAccount): void;
  createSession(session: LoginSession): void;
  findSession(token: string): LoginSession | undefined;
  createQuestionDraft(draft: QuestionDraft): void;
  findQuestionDraft(
    parentAccountId: string,
    draftId: string,
  ): QuestionDraft | undefined;
  saveQuestionDraft(draft: QuestionDraft): void;
  deleteQuestionDraft(parentAccountId: string, draftId: string): void;
  createUploadCredential(credential: PhotoUploadCredential): void;
  findUploadCredential(token: string): PhotoUploadCredential | undefined;
  saveUploadCredential(credential: PhotoUploadCredential): void;
  createQuestion(question: ConfirmedQuestion): void;
  findQuestion(
    parentAccountId: string,
    questionId: string,
  ): ConfirmedQuestion | undefined;
  saveQuestion(question: ConfirmedQuestion): void;
  countQuestionsSince(parentAccountId: string, sinceMs: number): number;
  countVariantReviewsSince(parentAccountId: string, sinceMs: number): number;
  createMistake(mistake: MistakeRecord): void;
  findMistake(
    parentAccountId: string,
    mistakeId: string,
  ): MistakeRecord | undefined;
  findMistakeByQuestion(
    parentAccountId: string,
    questionId: string,
  ): MistakeRecord | undefined;
  saveMistake(mistake: MistakeRecord): void;
  listMistakes(
    parentAccountId: string,
    childProfileId: string,
  ): MistakeRecord[];
  deleteMistake(parentAccountId: string, mistakeId: string): void;
  deleteQuestion(parentAccountId: string, questionId: string): void;
  deleteChildProfile(parentAccountId: string, childProfileId: string): void;
  deleteParentAccount(parentAccountId: string): void;
  createReviewSchedule(schedule: ReviewSchedule): void;
  findReviewSchedule(
    parentAccountId: string,
    mistakeId: string,
  ): ReviewSchedule | undefined;
  saveReviewSchedule(schedule: ReviewSchedule): void;
  listDueReviewSchedules(
    parentAccountId: string,
    childProfileId: string,
    asOf: number,
  ): ReviewSchedule[];
  createReview(review: Review): void;
  findReview(parentAccountId: string, reviewId: string): Review | undefined;
  saveReview(review: Review): void;
  listCompletedReviewsSince(
    parentAccountId: string,
    childProfileId: string,
    sinceMs: number,
  ): Review[];
  saveReminderSettings(settings: ReminderSettings): void;
  findReminderSettings(
    parentAccountId: string,
    childProfileId: string,
  ): ReminderSettings | undefined;
  listEnabledReminderSettings(): ReminderSettings[];
  createReminderDispatch(dispatch: ReminderDispatch): void;
  findReminderDispatch(
    parentAccountId: string,
    childProfileId: string,
    dateKey: string,
  ): ReminderDispatch | undefined;
  createHomeworkReview(review: HomeworkReview): void;
  findHomeworkReview(
    parentAccountId: string,
    homeworkReviewId: string,
  ): HomeworkReview | undefined;
  saveHomeworkReview(review: HomeworkReview): void;
  createCorrectPracticeEvidence(evidence: CorrectPracticeEvidence): void;
  listCorrectPracticeEvidence(
    parentAccountId: string,
    childProfileId: string,
  ): CorrectPracticeEvidence[];
  createChildProfile(profile: ChildProfile): void;
  listChildProfiles(parentAccountId: string): ChildProfile[];
  findChildProfile(
    parentAccountId: string,
    childProfileId: string,
  ): ChildProfile | undefined;
  saveChildProfile(profile: ChildProfile): void;
  findSelectedChildProfile(parentAccountId: string): ChildProfile | undefined;
  selectChildProfile(parentAccountId: string, childProfileId: string): void;
}

class InMemoryLearningLoopStore implements LearningLoopStore {
  private readonly accounts = new Map<string, ParentAccount>();
  private readonly weChatSubjects = new Map<string, string>();
  private readonly sessions = new Map<string, LoginSession>();
  private readonly questionDrafts = new Map<string, QuestionDraft>();
  private readonly uploadCredentials = new Map<string, PhotoUploadCredential>();
  private readonly questions = new Map<string, ConfirmedQuestion>();
  private readonly mistakes = new Map<string, MistakeRecord>();
  private readonly reviewSchedules = new Map<string, ReviewSchedule>();
  private readonly reviews = new Map<string, Review>();
  private readonly childProfiles = new Map<string, ChildProfile>();
  private readonly homeworkReviews = new Map<string, HomeworkReview>();
  private readonly correctPracticeEvidence = new Map<string, CorrectPracticeEvidence>();
  private readonly selectedChildProfileIds = new Map<string, string>();

  createParentAccount(account: ParentAccount): void {
    this.accounts.set(account.id, account);
  }

  findParentAccount(parentAccountId: string): ParentAccount | undefined {
    return this.accounts.get(parentAccountId);
  }

  findParentAccountByWeChatSubject(
    weChatSubject: string,
  ): ParentAccount | undefined {
    const parentAccountId = this.weChatSubjects.get(weChatSubject);
    return parentAccountId ? this.accounts.get(parentAccountId) : undefined;
  }

  saveWeChatSubject(parentAccountId: string, weChatSubject: string): void {
    this.weChatSubjects.set(weChatSubject, parentAccountId);
  }

  saveParentAccount(account: ParentAccount): void {
    this.accounts.set(account.id, account);
  }

  createSession(session: LoginSession): void {
    this.sessions.set(session.token, session);
  }

  findSession(token: string): LoginSession | undefined {
    return this.sessions.get(token);
  }

  createQuestionDraft(draft: QuestionDraft): void {
    this.questionDrafts.set(draft.id, draft);
  }

  findQuestionDraft(
    parentAccountId: string,
    draftId: string,
  ): QuestionDraft | undefined {
    const draft = this.questionDrafts.get(draftId);
    return draft?.parentAccountId === parentAccountId ? draft : undefined;
  }

  saveQuestionDraft(draft: QuestionDraft): void {
    this.questionDrafts.set(draft.id, draft);
  }

  deleteQuestionDraft(parentAccountId: string, draftId: string): void {
    const draft = this.questionDrafts.get(draftId);
    if (draft?.parentAccountId === parentAccountId) {
      this.questionDrafts.delete(draftId);
    }
  }

  createUploadCredential(credential: PhotoUploadCredential): void {
    this.uploadCredentials.set(credential.uploadToken, credential);
  }

  findUploadCredential(token: string): PhotoUploadCredential | undefined {
    return this.uploadCredentials.get(token);
  }

  saveUploadCredential(credential: PhotoUploadCredential): void {
    this.uploadCredentials.set(credential.uploadToken, credential);
  }

  createQuestion(question: ConfirmedQuestion): void {
    this.questions.set(question.id, question);
  }

  findQuestion(
    parentAccountId: string,
    questionId: string,
  ): ConfirmedQuestion | undefined {
    const question = this.questions.get(questionId);
    return question?.parentAccountId === parentAccountId ? question : undefined;
  }

  saveQuestion(question: ConfirmedQuestion): void {
    this.questions.set(question.id, question);
  }

  countQuestionsSince(parentAccountId: string, sinceMs: number): number {
    return [...this.questions.values()].filter(
      (question) =>
        question.parentAccountId === parentAccountId &&
        question.createdAt >= sinceMs,
    ).length;
  }

  countVariantReviewsSince(parentAccountId: string, sinceMs: number): number {
    return [...this.reviews.values()].filter(
      (review) =>
        review.parentAccountId === parentAccountId &&
        review.exerciseKind === "variant" &&
        review.startedAt >= sinceMs,
    ).length;
  }

  createMistake(mistake: MistakeRecord): void {
    this.mistakes.set(mistake.id, mistake);
  }

  findMistake(
    parentAccountId: string,
    mistakeId: string,
  ): MistakeRecord | undefined {
    const mistake = this.mistakes.get(mistakeId);
    return mistake?.parentAccountId === parentAccountId ? mistake : undefined;
  }

  findMistakeByQuestion(
    parentAccountId: string,
    questionId: string,
  ): MistakeRecord | undefined {
    return [...this.mistakes.values()].find(
      (mistake) =>
        mistake.parentAccountId === parentAccountId &&
        mistake.questionId === questionId,
    );
  }

  saveMistake(mistake: MistakeRecord): void {
    this.mistakes.set(mistake.id, mistake);
  }

  listMistakes(
    parentAccountId: string,
    childProfileId: string,
  ): MistakeRecord[] {
    return [...this.mistakes.values()].filter(
      (mistake) =>
        mistake.parentAccountId === parentAccountId &&
        mistake.childProfileId === childProfileId,
    );
  }

  deleteMistake(parentAccountId: string, mistakeId: string): void {
    const mistake = this.mistakes.get(mistakeId);
    if (mistake?.parentAccountId === parentAccountId) {
      this.mistakes.delete(mistakeId);
      this.reviewSchedules.delete(mistakeId);
      for (const review of this.reviews.values()) {
        if (review.mistakeId === mistakeId) {
          this.reviews.delete(review.id);
        }
      }
    }
  }

  deleteQuestion(parentAccountId: string, questionId: string): void {
    const question = this.questions.get(questionId);
    if (question?.parentAccountId === parentAccountId) {
      this.questions.delete(questionId);
    }
  }

  deleteChildProfile(parentAccountId: string, childProfileId: string): void {
    const removedDraftIds = [...this.questionDrafts.values()]
      .filter(
        (draft) =>
          draft.parentAccountId === parentAccountId &&
          draft.childProfileId === childProfileId,
      )
      .map((draft) => draft.id);

    for (const draftId of removedDraftIds) {
      this.questionDrafts.delete(draftId);
    }

    for (const credential of this.uploadCredentials.values()) {
      if (removedDraftIds.includes(credential.draftId)) {
        this.uploadCredentials.delete(credential.uploadToken);
      }
    }

    for (const mistake of this.mistakes.values()) {
      if (
        mistake.parentAccountId === parentAccountId &&
        mistake.childProfileId === childProfileId
      ) {
        this.mistakes.delete(mistake.id);
        this.reviewSchedules.delete(mistake.id);
        for (const review of this.reviews.values()) {
          if (review.mistakeId === mistake.id) {
            this.reviews.delete(review.id);
          }
        }
      }
    }

    for (const question of this.questions.values()) {
      if (
        question.parentAccountId === parentAccountId &&
        question.childProfileId === childProfileId
      ) {
        this.questions.delete(question.id);
      }
    }

    for (const [reviewId, review] of this.homeworkReviews) {
      if (review.parentAccountId === parentAccountId && review.childProfileId === childProfileId) {
        this.homeworkReviews.delete(reviewId);
      }
    }
    for (const [evidenceId, evidence] of this.correctPracticeEvidence) {
      if (evidence.parentAccountId === parentAccountId && evidence.childProfileId === childProfileId) {
        this.correctPracticeEvidence.delete(evidenceId);
      }
    }

    this.childProfiles.delete(childProfileId);

    if (this.selectedChildProfileIds.get(parentAccountId) === childProfileId) {
      this.selectedChildProfileIds.delete(parentAccountId);
    }

    this.reminderSettings.delete(`${parentAccountId}:${childProfileId}`);
    for (const [key, dispatch] of this.reminderDispatches) {
      if (
        dispatch.parentAccountId === parentAccountId &&
        dispatch.childProfileId === childProfileId
      ) {
        this.reminderDispatches.delete(key);
      }
    }
  }

  deleteParentAccount(parentAccountId: string): void {
    const childProfileIds = [...this.childProfiles.values()]
      .filter((profile) => profile.parentAccountId === parentAccountId)
      .map((profile) => profile.id);

    for (const childProfileId of childProfileIds) {
      this.deleteChildProfile(parentAccountId, childProfileId);
    }

    for (const session of this.sessions.values()) {
      if (session.parentAccountId === parentAccountId) {
        this.sessions.delete(session.token);
      }
    }

    for (const [weChatSubject, mappedParentAccountId] of this.weChatSubjects) {
      if (mappedParentAccountId === parentAccountId) {
        this.weChatSubjects.delete(weChatSubject);
      }
    }

    for (const [key, settings] of this.reminderSettings) {
      if (settings.parentAccountId === parentAccountId) {
        this.reminderSettings.delete(key);
      }
    }
    for (const [key, dispatch] of this.reminderDispatches) {
      if (dispatch.parentAccountId === parentAccountId) {
        this.reminderDispatches.delete(key);
      }
    }

    this.accounts.delete(parentAccountId);
  }

  createReviewSchedule(schedule: ReviewSchedule): void {
    this.reviewSchedules.set(schedule.mistakeId, schedule);
  }

  findReviewSchedule(
    parentAccountId: string,
    mistakeId: string,
  ): ReviewSchedule | undefined {
    const schedule = this.reviewSchedules.get(mistakeId);
    return schedule?.parentAccountId === parentAccountId
      ? schedule
      : undefined;
  }

  saveReviewSchedule(schedule: ReviewSchedule): void {
    this.reviewSchedules.set(schedule.mistakeId, schedule);
  }

  listDueReviewSchedules(
    parentAccountId: string,
    childProfileId: string,
    asOf: number,
  ): ReviewSchedule[] {
    return [...this.reviewSchedules.values()].filter(
      (schedule) =>
        schedule.parentAccountId === parentAccountId &&
        schedule.childProfileId === childProfileId &&
        schedule.nextReviewAt <= asOf,
    );
  }

  createReview(review: Review): void {
    this.reviews.set(review.id, review);
  }

  findReview(parentAccountId: string, reviewId: string): Review | undefined {
    const review = this.reviews.get(reviewId);
    return review?.parentAccountId === parentAccountId ? review : undefined;
  }

  saveReview(review: Review): void {
    this.reviews.set(review.id, review);
  }

  listCompletedReviewsSince(
    parentAccountId: string,
    childProfileId: string,
    sinceMs: number,
  ): Review[] {
    return [...this.reviews.values()].filter((review) => {
      if (
        review.parentAccountId !== parentAccountId ||
        review.completedAt === null ||
        review.completedAt < sinceMs
      ) {
        return false;
      }
      const mistake = this.mistakes.get(review.mistakeId);
      return mistake?.childProfileId === childProfileId;
    });
  }

  private readonly reminderSettings = new Map<string, ReminderSettings>();
  private readonly reminderDispatches = new Map<string, ReminderDispatch>();

  saveReminderSettings(settings: ReminderSettings): void {
    this.reminderSettings.set(
      `${settings.parentAccountId}:${settings.childProfileId}`,
      settings,
    );
  }

  findReminderSettings(
    parentAccountId: string,
    childProfileId: string,
  ): ReminderSettings | undefined {
    return this.reminderSettings.get(`${parentAccountId}:${childProfileId}`);
  }

  listEnabledReminderSettings(): ReminderSettings[] {
    return [...this.reminderSettings.values()].filter(
      (settings) => settings.enabled,
    );
  }

  createReminderDispatch(dispatch: ReminderDispatch): void {
    this.reminderDispatches.set(
      `${dispatch.parentAccountId}:${dispatch.childProfileId}:${dispatch.dateKey}`,
      dispatch,
    );
  }

  findReminderDispatch(
    parentAccountId: string,
    childProfileId: string,
    dateKey: string,
  ): ReminderDispatch | undefined {
    return this.reminderDispatches.get(
      `${parentAccountId}:${childProfileId}:${dateKey}`,
    );
  }

  createHomeworkReview(review: HomeworkReview): void {
    this.homeworkReviews.set(review.id, review);
  }

  findHomeworkReview(parentAccountId: string, homeworkReviewId: string): HomeworkReview | undefined {
    const review = this.homeworkReviews.get(homeworkReviewId);
    return review?.parentAccountId === parentAccountId ? review : undefined;
  }

  saveHomeworkReview(review: HomeworkReview): void {
    this.homeworkReviews.set(review.id, review);
  }

  createCorrectPracticeEvidence(evidence: CorrectPracticeEvidence): void {
    this.correctPracticeEvidence.set(evidence.id, evidence);
  }

  listCorrectPracticeEvidence(parentAccountId: string, childProfileId: string): CorrectPracticeEvidence[] {
    return [...this.correctPracticeEvidence.values()].filter(
      (evidence) => evidence.parentAccountId === parentAccountId && evidence.childProfileId === childProfileId,
    );
  }

  createChildProfile(profile: ChildProfile): void {
    this.childProfiles.set(profile.id, profile);
  }

  listChildProfiles(parentAccountId: string): ChildProfile[] {
    return [...this.childProfiles.values()].filter(
      (profile) => profile.parentAccountId === parentAccountId,
    );
  }

  findChildProfile(
    parentAccountId: string,
    childProfileId: string,
  ): ChildProfile | undefined {
    const childProfile = this.childProfiles.get(childProfileId);
    return childProfile?.parentAccountId === parentAccountId
      ? childProfile
      : undefined;
  }

  saveChildProfile(profile: ChildProfile): void {
    this.childProfiles.set(profile.id, profile);
  }

  findSelectedChildProfile(parentAccountId: string): ChildProfile | undefined {
    const childProfileId = this.selectedChildProfileIds.get(parentAccountId);
    return childProfileId ? this.childProfiles.get(childProfileId) : undefined;
  }

  selectChildProfile(parentAccountId: string, childProfileId: string): void {
    this.selectedChildProfileIds.set(parentAccountId, childProfileId);
  }
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const UPLOAD_CREDENTIAL_TTL_MS = 10 * 60 * 1000;

const RECOGNITION_CONFIDENCE_THRESHOLD = 0.6;

function normalizeStemForDuplicateCheck(stem: string): string {
  return stem
    .toLowerCase()
    .replace(/[^0-9a-z一-鿿]+/g, "");
}

const DAY_MS = 24 * 60 * 60 * 1000;

function shanghaiDayStart(ms: number): number {
  const dateInShanghai = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ms);
  return Date.parse(`${dateInShanghai}T00:00:00+08:00`);
}

function shanghaiDayStartAfter(ms: number, days: number): number {
  // Shanghai has no daylight-saving shifts, so whole-day arithmetic is exact.
  return shanghaiDayStart(ms) + days * DAY_MS;
}

function masteryStatusFor(
  masteryScore: number,
): MistakeRecord["masteryStatus"] {
  return masteryScore >= 0.8 ? "mastered" : "learning";
}

function shanghaiStreakDays(completedAts: number[], now: number): number {
  const reviewDays = new Set(
    completedAts.map((completedAt) => shanghaiDayStart(completedAt)),
  );
  const todayStart = shanghaiDayStart(now);
  let cursor = reviewDays.has(todayStart)
    ? todayStart
    : todayStart - DAY_MS;
  let streak = 0;

  while (reviewDays.has(cursor)) {
    streak += 1;
    cursor -= DAY_MS;
  }

  return streak;
}

const SHANGHAI_WEEKDAY_OFFSETS: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

function shanghaiWeekStart(now: number): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
  }).format(now);
  return shanghaiDayStart(now) - SHANGHAI_WEEKDAY_OFFSETS[weekday]! * DAY_MS;
}

function shanghaiDateKey(now: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function shanghaiHour(now: number): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Shanghai",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
}

function shanghaiMonthStart(now: number): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
  }).format(now);
  return Date.parse(`${parts}-01T00:00:00+08:00`);
}

function masteryDeltaFor(
  selfAssessment: ReviewSelfAssessment,
  variantCorrect: boolean | null,
): number {
  const assessmentDelta = {
    "not-yet": 0,
    partially: 0.15,
    mastered: 0.34,
  }[selfAssessment];
  const variantDelta =
    variantCorrect === true ? 0.05 : variantCorrect === false ? -0.2 : 0;
  return assessmentDelta + variantDelta;
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

export type LearningLoopOptions = {
  now?: () => number;
  sessionTtlMs?: number;
  explanationProvider?: (
    request: ExplanationRequest,
  ) => ExplanationContent | Promise<ExplanationContent>;
  reminderSender?: (notification: ReminderNotification) => void;
};

export class LearningLoop {
  private readonly store: LearningLoopStore;
  private readonly now: () => number;
  private readonly sessionTtlMs: number;
  private readonly explanationProvider?: (
    request: ExplanationRequest,
  ) => ExplanationContent | Promise<ExplanationContent>;
  private readonly reminderSender?: (
    notification: ReminderNotification,
  ) => void;

  constructor(
    store: LearningLoopStore = new InMemoryLearningLoopStore(),
    options: LearningLoopOptions = {},
  ) {
    this.store = store;
    this.now = options.now ?? Date.now;
    this.sessionTtlMs = options.sessionTtlMs ?? SESSION_TTL_MS;
    this.explanationProvider = options.explanationProvider;
    this.reminderSender = options.reminderSender;
  }

  startWeChatLogin(weChatSubject: string): WeChatLogin {
    if (!weChatSubject.trim()) {
      throw new Error("WeChat identity is required to start a session.");
    }

    let account = this.store.findParentAccountByWeChatSubject(weChatSubject);
    if (!account) {
      account = {
        id: randomUUID(),
        guardianshipConfirmed: false,
        allowDirectAnswerReveal: false,
        plan: "free",
      };
      this.store.createParentAccount(account);
      this.store.saveWeChatSubject(account.id, weChatSubject);
    }
    const session: LoginSession = {
      token: randomUUID(),
      parentAccountId: account.id,
      expiresAt: this.now() + this.sessionTtlMs,
    };

    this.store.createSession(session);
    return { account, session };
  }

  resumeSession(token: string): ParentAccount {
    const session = this.store.findSession(token);
    const account = session
      ? this.store.findParentAccount(session.parentAccountId)
      : undefined;

    if (!session || !account || session.expiresAt <= this.now()) {
      throw new Error(
        "Session is no longer valid; please log in again with WeChat.",
      );
    }

    return account;
  }

  startQuestionDraft(
    parentAccountId: string,
    childProfileId: string,
    source: QuestionSource,
  ): QuestionDraft {
    const account = this.store.findParentAccount(parentAccountId);

    if (!account?.guardianshipConfirmed) {
      throw new Error(
        "Guardianship confirmation is required before capturing a question.",
      );
    }

    this.findChildProfileForGuardian(parentAccountId, childProfileId);

    const draft: QuestionDraft = {
      id: randomUUID(),
      parentAccountId,
      childProfileId,
      source,
      imageKey: null,
      crop: null,
      rotationDegrees: 0,
      recognition: null,
    };

    this.store.createQuestionDraft(draft);
    return draft;
  }

  updateQuestionDraft(
    parentAccountId: string,
    draftId: string,
    edits: { crop?: CropRegion; rotationDegrees?: number },
  ): QuestionDraft {
    const draft = this.findQuestionDraftForGuardian(parentAccountId, draftId);

    if (edits.rotationDegrees !== undefined) {
      if (![0, 90, 180, 270].includes(edits.rotationDegrees)) {
        throw new Error("Rotation must be 0, 90, 180, or 270 degrees.");
      }
      draft.rotationDegrees = edits.rotationDegrees;
    }

    if (edits.crop !== undefined) {
      this.validateCropRegion(edits.crop);
      draft.crop = edits.crop;
    }

    this.store.saveQuestionDraft(draft);
    return draft;
  }

  requestPhotoUpload(
    parentAccountId: string,
    draftId: string,
  ): PhotoUploadCredential {
    const draft = this.findQuestionDraftForGuardian(parentAccountId, draftId);
    const credential: PhotoUploadCredential = {
      uploadToken: randomUUID(),
      parentAccountId,
      draftId: draft.id,
      imageKey: `questions/${draft.id}/${randomUUID()}`,
      expiresAt: this.now() + UPLOAD_CREDENTIAL_TTL_MS,
      usedAt: null,
    };

    this.store.createUploadCredential(credential);
    return credential;
  }

  completePhotoUpload(
    parentAccountId: string,
    uploadToken: string,
  ): QuestionDraft {
    const credential = this.store.findUploadCredential(uploadToken);

    if (!credential || credential.parentAccountId !== parentAccountId) {
      throw new Error("Upload credential is not available to this guardian.");
    }

    const draft = this.store.findQuestionDraft(
      parentAccountId,
      credential.draftId,
    );

    if (!draft) {
      throw new Error(
        "Upload credential is no longer valid; start a new draft to retry.",
      );
    }

    if (credential.usedAt !== null) {
      throw new Error(
        "Upload credential has already been used; request a new one to retry.",
      );
    }

    if (credential.expiresAt <= this.now()) {
      throw new Error(
        "Upload credential has expired; request a new one to retry the upload.",
      );
    }

    credential.usedAt = this.now();
    this.store.saveUploadCredential(credential);

    draft.imageKey = credential.imageKey;
    this.store.saveQuestionDraft(draft);
    return draft;
  }

  cancelQuestionDraft(parentAccountId: string, draftId: string): void {
    this.findQuestionDraftForGuardian(parentAccountId, draftId);
    this.store.deleteQuestionDraft(parentAccountId, draftId);
  }

  reselectDraftImage(
    parentAccountId: string,
    draftId: string,
  ): QuestionDraft {
    const draft = this.findQuestionDraftForGuardian(parentAccountId, draftId);

    draft.imageKey = null;
    draft.recognition = null;
    draft.crop = null;
    draft.rotationDegrees = 0;

    this.store.saveQuestionDraft(draft);
    return draft;
  }

  recordQuestionRecognition(
    parentAccountId: string,
    draftId: string,
    recognition: QuestionRecognition,
  ): QuestionDraft {
    const draft = this.findQuestionDraftForGuardian(parentAccountId, draftId);

    if (recognition.confidence < 0 || recognition.confidence > 1) {
      throw new Error("Recognition confidence must be between 0 and 1.");
    }

    draft.recognition = recognition;
    this.store.saveQuestionDraft(draft);
    return draft;
  }

  confirmQuestion(
    parentAccountId: string,
    draftId: string,
    confirmation: { stem: string; studentAnswer?: string },
  ): ConfirmedQuestion {
    const draft = this.findQuestionDraftForGuardian(parentAccountId, draftId);
    const stem = confirmation.stem.trim();

    if (!stem) {
      throw new Error("A question stem is required to confirm the question.");
    }

    const account = this.store.findParentAccount(parentAccountId)!;
    const photoEntitlements = PLAN_ENTITLEMENTS[account.plan];
    const photosUsed = this.store.countQuestionsSince(
      parentAccountId,
      shanghaiMonthStart(this.now()),
    );

    if (photosUsed >= photoEntitlements.monthlyPhotoQuota) {
      throw new Error(
        `本月拍题额度已用完（${photoEntitlements.monthlyPhotoQuota} 道）；升级订阅可获得更高额度，或等待下月额度重置。`,
      );
    }

    const recognition = draft.recognition;
    const stemUnedited =
      recognition !== null && recognition.stem === confirmation.stem;
    const reliable =
      recognition === null ||
      recognition.confidence >= RECOGNITION_CONFIDENCE_THRESHOLD ||
      !stemUnedited;

    const question: ConfirmedQuestion = {
      id: randomUUID(),
      parentAccountId,
      childProfileId: draft.childProfileId,
      source: draft.source,
      stem,
      formulas: recognition?.formulas ?? [],
      imageKey: draft.imageKey,
      crop: draft.crop,
      rotationDegrees: draft.rotationDegrees,
      region: recognition?.region ?? null,
      studentAnswer:
        (confirmation.studentAnswer ?? recognition?.studentAnswer)?.trim() || null,
      answerAnalysisSkipped: false,
      status: reliable ? "confirmed" : "pending-confirmation",
      createdAt: this.now(),
    };

    this.store.createQuestion(question);
    this.store.deleteQuestionDraft(parentAccountId, draftId);
    return question;
  }

  createHomeworkReview(
    parentAccountId: string,
    childProfileId: string,
    recognition: HomeworkRecognition,
  ): HomeworkReview {
    this.findChildProfileForGuardian(parentAccountId, childProfileId);
    if (!Array.isArray(recognition.questions) || recognition.questions.length === 0) {
      throw new Error("A homework review must contain at least one math question.");
    }

    const candidates = recognition.questions.map((question) => {
      if (!question.stem?.trim()) {
        throw new Error("Each homework question needs a stem.");
      }
      if (!Number.isFinite(question.confidence) || question.confidence < 0 || question.confidence > 1) {
        throw new Error("Homework recognition confidence must be between 0 and 1.");
      }
      if (question.studentAnswerConfidence !== null &&
        (!Number.isFinite(question.studentAnswerConfidence) || question.studentAnswerConfidence < 0 || question.studentAnswerConfidence > 1)) {
        throw new Error("Handwritten answer confidence must be between 0 and 1.");
      }
      if (question.suggestedSecondaryKnowledgePoints.length > 2) {
        throw new Error("At most two secondary knowledge points may be suggested.");
      }
      return {
        ...question,
        id: randomUUID(),
        stem: question.stem.trim(),
        studentAnswer: question.studentAnswer?.trim() || null,
        referenceAnswer: question.referenceAnswer?.trim() || null,
        reasoning: question.reasoning?.trim() || null,
        suggestedPrimaryKnowledgePoint:
          question.suggestedPrimaryKnowledgePoint?.trim() || null,
        suggestedSecondaryKnowledgePoints: question.suggestedSecondaryKnowledgePoints
          .map((point) => point.trim())
          .filter(Boolean),
        suggestedMistakeCause: question.suggestedMistakeCause?.trim() || null,
        confirmedVerdict: null,
        questionId: null,
        mistakeId: null,
      };
    });

    const review: HomeworkReview = {
      id: randomUUID(),
      parentAccountId,
      childProfileId,
      imageKey: null,
      createdAt: this.now(),
      candidates,
    };
    this.store.createHomeworkReview(review);
    return review;
  }

  getHomeworkReview(parentAccountId: string, homeworkReviewId: string): HomeworkReview {
    return this.findHomeworkReviewForGuardian(parentAccountId, homeworkReviewId);
  }

  confirmHomeworkQuestion(
    parentAccountId: string,
    homeworkReviewId: string,
    candidateId: string,
    confirmation: {
      verdict: HomeworkVerdict;
      stem?: string;
      studentAnswer?: string | null;
      primaryKnowledgePoint?: string;
      secondaryKnowledgePoints?: string[];
      mistakeCause?: string | null;
    },
  ): HomeworkQuestionCandidate {
    const review = this.findHomeworkReviewForGuardian(parentAccountId, homeworkReviewId);
    const candidate = review.candidates.find((entry) => entry.id === candidateId);
    if (!candidate) throw new Error("Homework question is not available to this guardian.");
    if (candidate.confirmedVerdict !== null) return candidate;

    if (!(["correct", "incorrect", "uncertain"] as const).includes(confirmation.verdict)) {
      throw new Error("Homework verdict must be correct, incorrect, or uncertain.");
    }

    candidate.confirmedVerdict = confirmation.verdict;
    candidate.stem = confirmation.stem?.trim() || candidate.stem;
    if (confirmation.studentAnswer !== undefined) {
      candidate.studentAnswer = confirmation.studentAnswer?.trim() || null;
    }
    const primary = confirmation.primaryKnowledgePoint?.trim() || candidate.suggestedPrimaryKnowledgePoint;
    const secondary = (confirmation.secondaryKnowledgePoints ?? candidate.suggestedSecondaryKnowledgePoints)
      .map((point) => point.trim()).filter(Boolean).slice(0, 2);
    const cause = confirmation.mistakeCause?.trim() || candidate.suggestedMistakeCause;

    if (confirmation.verdict === "incorrect") {
      if (!primary) throw new Error("An incorrect homework question needs a confirmed primary knowledge point.");
      const account = this.store.findParentAccount(parentAccountId)!;
      const photosUsed = this.store.countQuestionsSince(
        parentAccountId,
        shanghaiMonthStart(this.now()),
      );
      if (photosUsed >= PLAN_ENTITLEMENTS[account.plan].monthlyPhotoQuota) {
        throw new Error(
          `本月拍题额度已用完（${PLAN_ENTITLEMENTS[account.plan].monthlyPhotoQuota} 道）；升级订阅可获得更高额度，或等待下月额度重置。`,
        );
      }
      const question: ConfirmedQuestion = {
        id: randomUUID(), parentAccountId, childProfileId: review.childProfileId,
        source: "camera", stem: candidate.stem, formulas: [], imageKey: null,
        crop: null, rotationDegrees: 0, region: null,
        studentAnswer: candidate.studentAnswer, answerAnalysisSkipped: false,
        status: "confirmed", createdAt: this.now(),
      };
      this.store.createQuestion(question);
      const mistake = this.saveMistake(parentAccountId, question.id, {
        primaryKnowledgePoint: primary,
        secondaryKnowledgePoints: secondary,
        mistakeCause: cause ?? undefined,
      });
      candidate.questionId = question.id;
      candidate.mistakeId = mistake.id;
    }
    if (confirmation.verdict === "correct") {
      this.store.createCorrectPracticeEvidence({
        id: randomUUID(), parentAccountId, childProfileId: review.childProfileId,
        homeworkReviewId: review.id,
        knowledgePoint: primary,
        createdAt: this.now(),
      });
    }
    this.store.saveHomeworkReview(review);
    return candidate;
  }

  confirmGuardianship(parentAccountId: string): ParentAccount {
    const account = this.store.findParentAccount(parentAccountId);

    if (!account) {
      throw new Error("Parent account was not found.");
    }

    account.guardianshipConfirmed = true;
    this.store.saveParentAccount(account);
    return account;
  }

  setAnswerRevealPreference(
    parentAccountId: string,
    allowDirectAnswerReveal: boolean,
  ): ParentAccount {
    const account = this.store.findParentAccount(parentAccountId);

    if (!account) {
      throw new Error("Parent account was not found.");
    }

    account.allowDirectAnswerReveal = allowDirectAnswerReveal;
    this.store.saveParentAccount(account);
    return account;
  }

  grantSubscription(
    parentAccountId: string,
    plan: SubscriptionPlan,
  ): ParentAccount {
    const account = this.store.findParentAccount(parentAccountId);

    if (!account) {
      throw new Error("Parent account was not found.");
    }

    account.plan = plan;
    this.store.saveParentAccount(account);
    return account;
  }

  getEntitlements(parentAccountId: string): EntitlementsView {
    const account = this.store.findParentAccount(parentAccountId);

    if (!account) {
      throw new Error("Parent account was not found.");
    }

    const monthStart = shanghaiMonthStart(this.now());

    return {
      plan: account.plan,
      ...PLAN_ENTITLEMENTS[account.plan],
      photosUsedThisMonth: this.store.countQuestionsSince(
        parentAccountId,
        monthStart,
      ),
      variantExercisesUsedThisMonth: this.store.countVariantReviewsSince(
        parentAccountId,
        monthStart,
      ),
    };
  }

  recordStudentAnswer(
    parentAccountId: string,
    questionId: string,
    entry: { answer?: string; skipAnalysis?: boolean },
  ): ConfirmedQuestion {
    const question = this.findQuestionForGuardian(parentAccountId, questionId);

    if (entry.skipAnalysis) {
      question.studentAnswer = null;
      question.answerAnalysisSkipped = true;
    } else {
      question.studentAnswer = entry.answer?.trim() || null;
      question.answerAnalysisSkipped = false;
    }

    this.store.saveQuestion(question);
    return question;
  }

  saveMistake(
    parentAccountId: string,
    questionId: string,
    details: {
      primaryKnowledgePoint: string;
      secondaryKnowledgePoints?: string[];
      mistakeCause?: string;
    },
  ): MistakeRecord {
    const question = this.findQuestionForGuardian(parentAccountId, questionId);

    if (question.status !== "confirmed") {
      throw new Error(
        "An unreliable question cannot be saved as a mistake; confirm the stem first.",
      );
    }

    const primaryKnowledgePoint = details.primaryKnowledgePoint.trim();

    if (!primaryKnowledgePoint) {
      throw new Error("A primary knowledge point is required.");
    }

    const secondaryKnowledgePoints = (
      details.secondaryKnowledgePoints ?? []
    ).map((point) => point.trim());

    if (secondaryKnowledgePoints.length > 2) {
      throw new Error("At most two secondary knowledge points are allowed.");
    }

    if (this.store.findMistakeByQuestion(parentAccountId, questionId)) {
      throw new Error("This question is already saved as a mistake.");
    }

    const mistake: MistakeRecord = {
      id: randomUUID(),
      parentAccountId,
      childProfileId: question.childProfileId,
      questionId: question.id,
      primaryKnowledgePoint,
      secondaryKnowledgePoints,
      mistakeCause: details.mistakeCause?.trim() || null,
      masteryStatus: "not-started",
      createdAt: this.now(),
    };

    this.store.createMistake(mistake);
    this.store.createReviewSchedule({
      mistakeId: mistake.id,
      parentAccountId,
      childProfileId: question.childProfileId,
      intervalIndex: 0,
      nextReviewAt: shanghaiDayStartAfter(
        this.now(),
        REVIEW_INTERVAL_DAYS[0],
      ),
      masteryScore: 0,
      reviewCount: 0,
    });
    return mistake;
  }

  getReviewSchedule(
    parentAccountId: string,
    mistakeId: string,
  ): ReviewScheduleView {
    const mistake = this.findMistakeForGuardian(parentAccountId, mistakeId);
    const schedule = this.store.findReviewSchedule(
      parentAccountId,
      mistake.id,
    );

    if (!schedule) {
      throw new Error("Review schedule is not available to this guardian.");
    }

    return {
      mistakeId: schedule.mistakeId,
      intervalDays: REVIEW_INTERVAL_DAYS[schedule.intervalIndex],
      nextReviewAt: schedule.nextReviewAt,
      masteryScore: schedule.masteryScore,
      masteryStatus: mistake.masteryStatus,
      reviewCount: schedule.reviewCount,
      masteryNote: MASTERY_NOTE,
    };
  }

  listChildProfiles(parentAccountId: string): ChildProfile[] {
    const account = this.store.findParentAccount(parentAccountId);

    if (!account) {
      throw new Error("Parent account was not found.");
    }

    return this.store.listChildProfiles(parentAccountId);
  }

  getHomeOverview(parentAccountId: string): HomeOverview {
    const account = this.store.findParentAccount(parentAccountId);

    if (!account) {
      throw new Error("Parent account was not found.");
    }

    const profiles = this.store.listChildProfiles(parentAccountId);
    const child =
      this.store.findSelectedChildProfile(parentAccountId) ?? profiles[0];

    if (!child) {
      return { stage: "no-child-profile" };
    }

    const now = this.now();
    const sevenDaysAgo = shanghaiDayStart(now) - 6 * DAY_MS;
    const dueReviews = this.getDueReviews(parentAccountId, child.id);
    const mistakes = this.listMistakes(parentAccountId, child.id);
    const completedReviews = this.store.listCompletedReviewsSince(
      parentAccountId,
      child.id,
      0,
    );
    return {
      stage: "ready",
      child,
      dueReviewCount: dueReviews.length,
      dueReviews,
      recentMistakes: mistakes.slice(-3).reverse(),
      sevenDaySummary: {
        newMistakes: mistakes.filter(
          (entry) => entry.createdAt >= sevenDaysAgo,
        ).length,
        completedReviews: completedReviews.filter(
          (review) => review.completedAt! >= sevenDaysAgo,
        ).length,
      },
      streakDays: shanghaiStreakDays(
        completedReviews.map((review) => review.completedAt!),
        now,
      ),
    };
  }

  getWeeklyReport(
    parentAccountId: string,
    childProfileId: string,
  ): WeeklyReport {
    this.findChildProfileForGuardian(parentAccountId, childProfileId);

    const weekStart = shanghaiWeekStart(this.now());
    const weekEnd = weekStart + 7 * DAY_MS;
    const mistakes = this.store.listMistakes(parentAccountId, childProfileId);
    const completedReviews = this.store.listCompletedReviewsSince(
      parentAccountId,
      childProfileId,
      0,
    );
    const correctPracticeByKnowledgePoint = new Map<string, number>();
    for (const evidence of this.store.listCorrectPracticeEvidence(
      parentAccountId,
      childProfileId,
    )) {
      if (evidence.knowledgePoint) {
        correctPracticeByKnowledgePoint.set(
          evidence.knowledgePoint,
          (correctPracticeByKnowledgePoint.get(evidence.knowledgePoint) ?? 0) + 1,
        );
      }
    }

    const weekReviews = completedReviews.filter(
      (review) =>
        review.completedAt! >= weekStart && review.completedAt! < weekEnd,
    );
    const reviewDeltas = weekReviews.map((review) =>
      masteryDeltaFor(review.selfAssessment!, review.variantCorrect),
    );

    const reviewsByMistake = new Map<string, Review[]>();
    for (const review of completedReviews) {
      const list = reviewsByMistake.get(review.mistakeId) ?? [];
      list.push(review);
      reviewsByMistake.set(review.mistakeId, list);
    }

    const mistakesByKnowledgePoint = new Map<string, MistakeRecord[]>();
    for (const mistake of mistakes) {
      const list = mistakesByKnowledgePoint.get(mistake.primaryKnowledgePoint) ?? [];
      list.push(mistake);
      mistakesByKnowledgePoint.set(mistake.primaryKnowledgePoint, list);
    }

    const weaknesses = [...mistakesByKnowledgePoint.entries()]
      .map(([knowledgePoint, group]) => {
        const reviews = group.flatMap(
          (mistake) => reviewsByMistake.get(mistake.id) ?? [],
        );
        const masteryScores = group.map(
          (mistake) =>
            this.store.findReviewSchedule(parentAccountId, mistake.id)
              ?.masteryScore ?? 0,
        );
        const averageMasteryScore =
          masteryScores.reduce((sum, score) => sum + score, 0) /
          masteryScores.length;
        const strugglingReviews = reviews.filter(
          (review) => review.selfAssessment === "not-yet",
        ).length;
        const variantMisses = reviews.filter(
          (review) => review.variantCorrect === false,
        ).length;
        const correctPracticeCount =
          correctPracticeByKnowledgePoint.get(knowledgePoint) ?? 0;
        const weaknessScore = roundToTwo(
          2 * group.length +
            2 * strugglingReviews +
            2 * variantMisses +
            4 * (1 - averageMasteryScore) -
            correctPracticeCount,
        );

        return {
          knowledgePoint,
          weaknessScore,
          mistakeCount: group.length,
          correctPracticeCount,
          averageMasteryScore: roundToTwo(averageMasteryScore),
          strugglingReviews,
          variantMisses,
          mistakeIds: group.map((mistake) => mistake.id),
          suggestion: `「${knowledgePoint}」还不够稳：用一道变式题检验理解，并回顾 ${group.length} 道相关错题的错因。`,
        };
      })
      .sort(
        (a, b) =>
          b.weaknessScore - a.weaknessScore ||
          (a.knowledgePoint < b.knowledgePoint ? -1 : 1),
      )
      .slice(0, 3);

    const dueNextWeek = mistakes.filter((mistake) => {
      const schedule = this.store.findReviewSchedule(
        parentAccountId,
        mistake.id,
      );
      return (
        schedule !== undefined &&
        schedule.nextReviewAt >= weekEnd &&
        schedule.nextReviewAt < weekEnd + 7 * DAY_MS
      );
    });

    const empty = mistakes.length === 0;
    const topWeakness = weaknesses[0];
    const account = this.store.findParentAccount(parentAccountId)!;
    const full = PLAN_ENTITLEMENTS[account.plan].fullWeeklyReport;

    return {
      childId: childProfileId,
      weekStart,
      weekEnd,
      full,
      empty,
      newMistakes: mistakes.filter(
        (mistake) =>
          mistake.createdAt >= weekStart && mistake.createdAt < weekEnd,
      ).length,
      completedReviews: weekReviews.length,
      masteryChange: {
        netChange: roundToTwo(
          reviewDeltas.reduce((sum, delta) => sum + delta, 0),
        ),
        improvedReviews: reviewDeltas.filter((delta) => delta > 0).length,
        declinedReviews: reviewDeltas.filter((delta) => delta < 0).length,
      },
      weaknesses: full ? weaknesses : [],
      nextWeekPlan: {
        scheduledReviews: dueNextWeek.length,
        focusKnowledgePoints: full
          ? [
              ...new Set(
                dueNextWeek.map((mistake) => mistake.primaryKnowledgePoint),
              ),
            ].slice(0, 3)
          : [],
      },
      suggestion: empty
        ? "本周还没有学习记录，可以先拍一道错题开始积累。"
        : full && topWeakness
          ? `下周优先巩固「${topWeakness.knowledgePoint}」：安排一次变式练习，并回顾对应错因。`
          : "本周保持复习节奏，巩固已收录的错题。",
      upgradeNote: full
        ? null
        : "升级订阅可查看完整周报，包括薄弱知识点排序与下周复习重点。",
      comparisonNote: WEEKLY_REPORT_COMPARISON_NOTE,
    };
  }

  updateReminderSettings(
    parentAccountId: string,
    childProfileId: string,
    settings: { enabled: boolean; hourOfDay: number },
  ): ReminderSettings {
    this.findChildProfileForGuardian(parentAccountId, childProfileId);

    if (
      !Number.isInteger(settings.hourOfDay) ||
      settings.hourOfDay < 0 ||
      settings.hourOfDay > 23
    ) {
      throw new Error("Reminder hour must be a whole hour from 0 to 23.");
    }

    const reminderSettings: ReminderSettings = {
      parentAccountId,
      childProfileId,
      enabled: settings.enabled,
      hourOfDay: settings.hourOfDay,
    };

    this.store.saveReminderSettings(reminderSettings);
    return reminderSettings;
  }

  getReminderSettings(
    parentAccountId: string,
    childProfileId: string,
  ): ReminderSettings | undefined {
    this.findChildProfileForGuardian(parentAccountId, childProfileId);
    return this.store.findReminderSettings(parentAccountId, childProfileId);
  }

  dispatchDueReminders(): ReminderDispatchOutcome[] {
    const now = this.now();
    const dateKey = shanghaiDateKey(now);
    const hourOfDay = shanghaiHour(now);
    const outcomes: ReminderDispatchOutcome[] = [];

    for (const settings of this.store.listEnabledReminderSettings()) {
      if (hourOfDay < settings.hourOfDay) {
        continue;
      }

      if (
        this.store.findReminderDispatch(
          settings.parentAccountId,
          settings.childProfileId,
          dateKey,
        )
      ) {
        continue;
      }

      const dueCount = this.store.listDueReviewSchedules(
        settings.parentAccountId,
        settings.childProfileId,
        now,
      ).length;

      if (dueCount === 0) {
        continue;
      }

      const child = this.store.findChildProfile(
        settings.parentAccountId,
        settings.childProfileId,
      );

      if (!child) {
        continue;
      }

      const notification: ReminderNotification = {
        childNickname: child.nickname,
        dueCount,
        entryPath: `/pages/review/index?childId=${child.id}`,
      };

      let status: ReminderDispatch["status"] = "sent";
      try {
        if (!this.reminderSender) {
          throw new Error("Reminder channel is not configured.");
        }
        this.reminderSender(notification);
      } catch {
        status = "failed";
      }

      this.store.createReminderDispatch({
        id: randomUUID(),
        parentAccountId: settings.parentAccountId,
        childProfileId: settings.childProfileId,
        dateKey,
        sentAt: now,
        status,
      });
      outcomes.push({ childProfileId: settings.childProfileId, status });
    }

    return outcomes;
  }

  getDueReviews(
    parentAccountId: string,
    childProfileId: string,
  ): DueReview[] {
    this.findChildProfileForGuardian(parentAccountId, childProfileId);

    return this.store
      .listDueReviewSchedules(parentAccountId, childProfileId, this.now())
      .map((schedule) => {
        const mistake = this.store.findMistake(
          parentAccountId,
          schedule.mistakeId,
        );
        const question = mistake
          ? this.store.findQuestion(parentAccountId, mistake.questionId)
          : undefined;

        if (!mistake || !question) {
          return undefined;
        }

        return {
          ...mistake,
          stem: question.stem,
          nextReviewAt: schedule.nextReviewAt,
          masteryScore: schedule.masteryScore,
        };
      })
      .filter((entry): entry is DueReview => entry !== undefined)
      .sort((a, b) => a.nextReviewAt - b.nextReviewAt);
  }

  async startReview(
    parentAccountId: string,
    mistakeId: string,
    options: { exercise?: "original" | "variant" } = {},
  ): Promise<ReviewSession> {
    const mistake = this.findMistakeForGuardian(parentAccountId, mistakeId);
    const question = this.store.findQuestion(
      parentAccountId,
      mistake.questionId,
    );

    if (!question) {
      throw new Error("Question is not available to this guardian.");
    }

    const exerciseKind = options.exercise ?? "original";
    let exerciseStem = question.stem;

    if (exerciseKind === "variant") {
      if (!this.explanationProvider) {
        throw new Error(
          "A variant exercise requires an explanation provider.",
        );
      }
      const account = this.store.findParentAccount(parentAccountId)!;
      const variantQuota =
        PLAN_ENTITLEMENTS[account.plan].monthlyVariantExerciseQuota;

      if (
        variantQuota !== null &&
        this.store.countVariantReviewsSince(
          parentAccountId,
          shanghaiMonthStart(this.now()),
        ) >= variantQuota
      ) {
        throw new Error(
          `本月变式练习额度已用完（${variantQuota} 次）；可继续用原题复习，或升级订阅获得不限量变式练习。`,
        );
      }

      const child = this.store.findChildProfile(
        parentAccountId,
        question.childProfileId,
      );
      exerciseStem = (
        await this.explanationProvider({
          stem: question.stem,
          formulas: question.formulas,
          grade: child?.grade ?? 1,
          studentAnswer: question.studentAnswer,
          skipAnswerAnalysis: question.answerAnalysisSkipped,
        })
      ).variantExercise.stem;
    }

    const review: Review = {
      id: randomUUID(),
      parentAccountId,
      mistakeId: mistake.id,
      exerciseKind,
      startedAt: this.now(),
      completedAt: null,
      selfAssessment: null,
      variantCorrect: null,
      resultIntervalIndex: null,
      resultNextReviewAt: null,
      resultMasteryScore: null,
    };

    this.store.createReview(review);

    return {
      reviewId: review.id,
      recallPrompt: `先回忆「${mistake.primaryKnowledgePoint}」的知识点和解题思路，再开始作答。`,
      exercise: { kind: exerciseKind, stem: exerciseStem },
    };
  }

  completeReview(
    parentAccountId: string,
    reviewId: string,
    outcome: {
      selfAssessment: ReviewSelfAssessment;
      variantCorrect: boolean | null;
    },
  ): ReviewResult {
    const account = this.store.findParentAccount(parentAccountId);

    if (!account) {
      throw new Error("Parent account was not found.");
    }

    const review = this.store.findReview(parentAccountId, reviewId);

    if (!review) {
      throw new Error("Review is not available to this guardian.");
    }

    if (
      review.completedAt !== null &&
      review.resultIntervalIndex !== null &&
      review.resultNextReviewAt !== null &&
      review.resultMasteryScore !== null
    ) {
      return {
        alreadyRecorded: true,
        intervalDays: REVIEW_INTERVAL_DAYS[review.resultIntervalIndex],
        nextReviewAt: review.resultNextReviewAt,
        masteryScore: review.resultMasteryScore,
        masteryStatus: masteryStatusFor(
          review.resultMasteryScore,
        ),
        masteryNote: MASTERY_NOTE,
      };
    }

    const schedule = this.store.findReviewSchedule(
      parentAccountId,
      review.mistakeId,
    );
    const mistake = this.store.findMistake(parentAccountId, review.mistakeId);

    if (!schedule || !mistake) {
      throw new Error("Review schedule is not available to this guardian.");
    }

    let intervalIndex = schedule.intervalIndex;
    if (outcome.selfAssessment === "mastered") {
      intervalIndex = Math.min(
        intervalIndex + 1,
        REVIEW_INTERVAL_DAYS.length - 1,
      );
    } else if (outcome.selfAssessment === "not-yet") {
      intervalIndex = 0;
    }
    if (outcome.variantCorrect === false) {
      intervalIndex = Math.max(0, intervalIndex - 1);
    }

    const masteryScore =
      Math.round(
        Math.min(1, Math.max(0, schedule.masteryScore +
          masteryDeltaFor(outcome.selfAssessment, outcome.variantCorrect))) *
          100,
      ) / 100;

    const nextReviewAt = shanghaiDayStartAfter(
      this.now(),
      REVIEW_INTERVAL_DAYS[intervalIndex],
    );

    schedule.intervalIndex = intervalIndex;
    schedule.nextReviewAt = nextReviewAt;
    schedule.masteryScore = masteryScore;
    schedule.reviewCount += 1;
    this.store.saveReviewSchedule(schedule);

    const masteryStatus = masteryStatusFor(masteryScore);
    mistake.masteryStatus = masteryStatus;
    this.store.saveMistake(mistake);

    review.completedAt = this.now();
    review.selfAssessment = outcome.selfAssessment;
    review.variantCorrect = outcome.variantCorrect;
    review.resultIntervalIndex = intervalIndex;
    review.resultNextReviewAt = nextReviewAt;
    review.resultMasteryScore = masteryScore;
    this.store.saveReview(review);

    return {
      alreadyRecorded: false,
      intervalDays: REVIEW_INTERVAL_DAYS[intervalIndex],
      nextReviewAt,
      masteryScore,
      masteryStatus,
      masteryNote: MASTERY_NOTE,
    };
  }

  updateMistakeCause(
    parentAccountId: string,
    mistakeId: string,
    mistakeCause: string,
  ): MistakeRecord {
    const account = this.store.findParentAccount(parentAccountId);

    if (!account) {
      throw new Error("Parent account was not found.");
    }

    const mistake = this.store.findMistake(parentAccountId, mistakeId);

    if (!mistake) {
      throw new Error("Mistake record is not available to this guardian.");
    }

    mistake.mistakeCause = mistakeCause.trim() || null;
    this.store.saveMistake(mistake);
    return mistake;
  }

  deleteMistake(parentAccountId: string, mistakeId: string): void {
    const mistake = this.findMistakeForGuardian(parentAccountId, mistakeId);

    this.store.deleteMistake(parentAccountId, mistake.id);
    this.store.deleteQuestion(parentAccountId, mistake.questionId);
  }

  deleteChildProfile(parentAccountId: string, childProfileId: string): void {
    this.findChildProfileForGuardian(parentAccountId, childProfileId);
    this.store.deleteChildProfile(parentAccountId, childProfileId);
  }

  deleteParentAccount(parentAccountId: string): void {
    const account = this.store.findParentAccount(parentAccountId);

    if (!account) {
      throw new Error("Parent account was not found.");
    }

    this.store.deleteParentAccount(parentAccountId);
  }

  listMistakes(
    parentAccountId: string,
    childProfileId: string,
    filters: MistakeFilters = {},
  ): MistakeBookEntry[] {
    this.findChildProfileForGuardian(parentAccountId, childProfileId);

    return this.store
      .listMistakes(parentAccountId, childProfileId)
      .map((mistake) => {
        const question = this.store.findQuestion(
          parentAccountId,
          mistake.questionId,
        );
        return question ? { ...mistake, stem: question.stem } : undefined;
      })
      .filter((entry): entry is MistakeBookEntry => entry !== undefined)
      .filter((entry) => this.matchesMistakeFilters(entry, filters))
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  private matchesMistakeFilters(
    entry: MistakeBookEntry,
    filters: MistakeFilters,
  ): boolean {
    if (filters.knowledgePoint) {
      const points = [
        entry.primaryKnowledgePoint,
        ...entry.secondaryKnowledgePoints,
      ];
      if (!points.some((point) => point.includes(filters.knowledgePoint!))) {
        return false;
      }
    }

    if (
      filters.mistakeCause &&
      !entry.mistakeCause?.includes(filters.mistakeCause)
    ) {
      return false;
    }

    if (
      filters.createdFrom !== undefined &&
      entry.createdAt < filters.createdFrom
    ) {
      return false;
    }

    if (
      filters.createdTo !== undefined &&
      entry.createdAt > filters.createdTo
    ) {
      return false;
    }

    if (
      filters.masteryStatus &&
      entry.masteryStatus !== filters.masteryStatus
    ) {
      return false;
    }

    if (filters.keyword && !entry.stem.includes(filters.keyword)) {
      return false;
    }

    return true;
  }

  findDuplicateMistakes(
    parentAccountId: string,
    childProfileId: string,
  ): MistakeBookEntry[][] {
    const entries = this.listMistakes(parentAccountId, childProfileId);
    const groups = new Map<string, MistakeBookEntry[]>();

    for (const entry of entries) {
      const key = normalizeStemForDuplicateCheck(entry.stem);
      const group = groups.get(key) ?? [];
      group.push(entry);
      groups.set(key, group);
    }

    return [...groups.values()].filter((group) => group.length > 1);
  }

  mergeMistakes(
    parentAccountId: string,
    keepMistakeId: string,
    duplicateMistakeId: string,
  ): MistakeRecord {
    const keep = this.findMistakeForGuardian(parentAccountId, keepMistakeId);
    const duplicate = this.findMistakeForGuardian(
      parentAccountId,
      duplicateMistakeId,
    );

    if (keep.id === duplicate.id) {
      throw new Error("A mistake cannot be merged into itself.");
    }

    if (keep.childProfileId !== duplicate.childProfileId) {
      throw new Error("Mistakes from different children cannot be merged.");
    }

    keep.secondaryKnowledgePoints = [
      ...new Set([
        ...keep.secondaryKnowledgePoints,
        ...duplicate.secondaryKnowledgePoints,
      ]),
    ].slice(0, 2);
    keep.mistakeCause = keep.mistakeCause ?? duplicate.mistakeCause;
    keep.createdAt = Math.min(keep.createdAt, duplicate.createdAt);

    this.store.saveMistake(keep);
    this.store.deleteMistake(parentAccountId, duplicate.id);
    this.store.deleteQuestion(parentAccountId, duplicate.questionId);
    return keep;
  }

  private findMistakeForGuardian(
    parentAccountId: string,
    mistakeId: string,
  ): MistakeRecord {
    const account = this.store.findParentAccount(parentAccountId);

    if (!account) {
      throw new Error("Parent account was not found.");
    }

    const mistake = this.store.findMistake(parentAccountId, mistakeId);

    if (!mistake) {
      throw new Error("Mistake record is not available to this guardian.");
    }

    return mistake;
  }

  async getExplanation(
    parentAccountId: string,
    questionId: string,
    options: { revealAnswer?: boolean } = {},
  ): Promise<Explanation> {
    const account = this.store.findParentAccount(parentAccountId);

    if (!account) {
      throw new Error("Parent account was not found.");
    }

    const question = this.findQuestionForGuardian(parentAccountId, questionId);

    if (!this.explanationProvider) {
      throw new Error("Explanation provider is not configured.");
    }

    if (question.status !== "confirmed") {
      throw new Error(
        "An unreliable question cannot produce a reliable explanation; confirm the stem first.",
      );
    }

    const child = this.store.findChildProfile(
      parentAccountId,
      question.childProfileId,
    );

    if (!child) {
      throw new Error("Child profile is not available to this guardian.");
    }

    const content = await this.explanationProvider({
      stem: question.stem,
      formulas: question.formulas,
      grade: child.grade,
      studentAnswer: question.studentAnswer,
      skipAnswerAnalysis: question.answerAnalysisSkipped,
    });

    const revealAnswer =
      Boolean(options.revealAnswer) && account.allowDirectAnswerReveal;

    return {
      questionId: question.id,
      grade: child.grade,
      hint: content.hint,
      approach: content.approach,
      steps: content.steps,
      answerAvailable: true,
      finalAnswer: revealAnswer ? content.finalAnswer : null,
      variantExercise: {
        stem: content.variantExercise.stem,
        answer: revealAnswer ? content.variantExercise.answer : null,
      },
      suggestedPrimaryKnowledgePoint:
        content.suggestedPrimaryKnowledgePoint?.trim() || null,
      suggestedSecondaryKnowledgePoints:
        content.suggestedSecondaryKnowledgePoints
          ?.map((point) => point.trim())
          .filter(Boolean)
          .slice(0, 2) ?? [],
      suggestedMistakeCause: content.suggestedMistakeCause?.trim() || null,
    };
  }

  createChildProfile(
    parentAccountId: string,
    profile: ChildProfileInput,
  ): ChildProfile {
    const account = this.store.findParentAccount(parentAccountId);

    if (!account?.guardianshipConfirmed) {
      throw new Error("Guardianship confirmation is required before creating a child profile.");
    }

    const maxChildProfiles = PLAN_ENTITLEMENTS[account.plan].maxChildProfiles;

    if (
      this.store.listChildProfiles(parentAccountId).length >= maxChildProfiles
    ) {
      throw new Error(
        `孩子档案数量已达当前套餐上限（${maxChildProfiles} 个）；升级订阅可建立更多孩子档案。`,
      );
    }

    this.validateChildProfile(profile);

    const childProfile = {
      ...profile,
      ...(profile.region !== undefined
        ? { region: profile.region }
        : profile.location
          ? { region: this.displayRegion(profile.location) }
          : {}),
      id: randomUUID(),
      parentAccountId,
    };

    this.store.createChildProfile(childProfile);
    this.store.selectChildProfile(parentAccountId, childProfile.id);
    return childProfile;
  }

  getSelectedChildProfile(parentAccountId: string): ChildProfile | undefined {
    const account = this.store.findParentAccount(parentAccountId);

    if (!account) {
      throw new Error("Parent account was not found.");
    }

    return this.store.findSelectedChildProfile(parentAccountId);
  }

  updateChildProfile(
    parentAccountId: string,
    childProfileId: string,
    profile: ChildProfileInput,
  ): ChildProfile {
    const childProfile = this.findChildProfileForGuardian(
      parentAccountId,
      childProfileId,
    );
    this.validateChildProfile(profile);
    const updatedChildProfile = {
      ...childProfile,
      ...profile,
      ...(profile.location
        ? {
            location: {
              ...childProfile.location,
              ...profile.location,
            },
          }
        : {}),
      ...(profile.region !== undefined
        ? { region: profile.region }
        : profile.location
          ? { region: this.displayRegion(profile.location) }
          : {}),
      id: childProfile.id,
      parentAccountId: childProfile.parentAccountId,
    };

    this.store.saveChildProfile(updatedChildProfile);
    return updatedChildProfile;
  }

  selectChildProfile(parentAccountId: string, childProfileId: string): void {
    this.findChildProfileForGuardian(parentAccountId, childProfileId);
    this.store.selectChildProfile(parentAccountId, childProfileId);
  }

  private findChildProfileForGuardian(
    parentAccountId: string,
    childProfileId: string,
  ): ChildProfile {
    const account = this.store.findParentAccount(parentAccountId);

    if (!account) {
      throw new Error("Parent account was not found.");
    }

    const childProfile = this.store.findChildProfile(
      parentAccountId,
      childProfileId,
    );

    if (!childProfile) {
      throw new Error("Child profile is not available to this guardian.");
    }

    return childProfile;
  }

  private findQuestionDraftForGuardian(
    parentAccountId: string,
    draftId: string,
  ): QuestionDraft {
    const account = this.store.findParentAccount(parentAccountId);

    if (!account) {
      throw new Error("Parent account was not found.");
    }

    const draft = this.store.findQuestionDraft(parentAccountId, draftId);

    if (!draft) {
      throw new Error("Question draft is not available to this guardian.");
    }

    return draft;
  }

  private findQuestionForGuardian(
    parentAccountId: string,
    questionId: string,
  ): ConfirmedQuestion {
    const account = this.store.findParentAccount(parentAccountId);

    if (!account) {
      throw new Error("Parent account was not found.");
    }

    const question = this.store.findQuestion(parentAccountId, questionId);

    if (!question) {
      throw new Error("Question is not available to this guardian.");
    }

    return question;
  }

  private findHomeworkReviewForGuardian(
    parentAccountId: string,
    homeworkReviewId: string,
  ): HomeworkReview {
    const account = this.store.findParentAccount(parentAccountId);
    if (!account) {
      throw new Error("Parent account was not found.");
    }
    const review = this.store.findHomeworkReview(parentAccountId, homeworkReviewId);
    if (!review) {
      throw new Error("Homework review is not available to this guardian.");
    }
    return review;
  }

  private validateCropRegion(crop: CropRegion): void {
    const withinBounds =
      crop.x >= 0 &&
      crop.y >= 0 &&
      crop.width > 0 &&
      crop.height > 0 &&
      crop.x + crop.width <= 1 &&
      crop.y + crop.height <= 1;

    if (!withinBounds) {
      throw new Error("Crop region must stay within the image bounds.");
    }
  }

  private validateChildProfile(profile: ChildProfileInput | undefined | null): void {
    if (!profile) {
      throw new Error("A child profile is required.");
    }
    const nickname = typeof profile?.nickname === "string" ? profile.nickname.trim() : "";
    if (!nickname) {
      throw new Error("A child profile nickname is required.");
    }

    if (!Number.isInteger(profile?.grade) || profile.grade < 1 || profile.grade > 9) {
      throw new Error("A child profile grade must be from one to nine.");
    }

    if (profile?.location) {
      const { provinceCode, provinceName, cityCode, cityName } = profile.location;
      if (
        !/^\d{6}$/.test(provinceCode) ||
        !provinceName.trim() ||
        ((cityCode || cityName) &&
          (!/^\d{6}$/.test(cityCode ?? "") || !cityName?.trim()))
      ) {
        throw new Error("A child profile province is invalid.");
      }
      return;
    }

    if (profile?.region !== undefined &&
      (typeof profile.region !== "string" || !profile.region.trim())) {
      throw new Error("A child profile region is invalid.");
    }
  }

  private displayRegion(location: ProvinceCity): string {
    return [location.provinceName, location.cityName].filter(Boolean).join(" ");
  }
}
