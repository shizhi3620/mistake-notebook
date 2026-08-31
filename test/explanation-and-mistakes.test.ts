import assert from "node:assert/strict";
import test from "node:test";

import {
  LearningLoop,
  type ConfirmedQuestion,
  type ExplanationRequest,
  type ParentAccount,
  type ChildProfile,
} from "../src/learning-loop.ts";

async function confirmedGuardianWithChild(learningLoop: LearningLoop): Promise<{
  guardian: ParentAccount;
  child: ChildProfile;
}> {
  const guardian = (await learningLoop.startWeChatLoginAsync("guardian-code")).account;
  await learningLoop.confirmGuardianshipAsync(guardian.id);
  const child = await learningLoop.createChildProfileAsync(guardian.id, {
    nickname: "小明",
    grade: 3,
    region: "浙江",
  });
  return { guardian, child };
}

async function captureConfirmedQuestion(
  learningLoop: LearningLoop,
  guardian: ParentAccount,
  child: ChildProfile,
  stem = "3 + 5 = ?",
): Promise<ConfirmedQuestion> {
  const draft = await learningLoop.startQuestionDraftAsync(guardian.id, child.id, "manual");
  return learningLoop.confirmQuestionAsync(guardian.id, draft.id, { stem });
}

const explanationContent = {
  hint: "先想一想：两个数合在一起是多少？",
  approach: "用凑十法把加法拆开。",
  steps: ["把 5 分成 2 和 3", "3 + 2 = 5", "5 + 3 = 8"],
  finalAnswer: "8",
  variantExercise: { stem: "4 + 5 = ?", answer: "9" },
  suggestedPrimaryKnowledgePoint: "20以内进位加法",
  suggestedSecondaryKnowledgePoints: ["凑十法"],
  suggestedMistakeCause: "把加法看成减法",
};

test("the explanation unfolds hint-first and hides the final answer unless the guardian allows it", async () => {
  const requests: ExplanationRequest[] = [];
  const learningLoop = new LearningLoop(undefined, {
    explanationProvider: (request) => {
      requests.push(request);
      return explanationContent;
    },
  });
  const { guardian, child } = await confirmedGuardianWithChild(learningLoop);
  const question = await captureConfirmedQuestion(learningLoop, guardian, child);

  const folded = await learningLoop.getExplanation(guardian.id, question.id);
  assert.equal(folded.hint, explanationContent.hint);
  assert.equal(folded.approach, explanationContent.approach);
  assert.deepEqual(folded.steps, explanationContent.steps);
  assert.equal(folded.finalAnswer, null);
  assert.equal(folded.answerAvailable, true);
  assert.equal(folded.variantExercise.answer, null);
  assert.equal(folded.suggestedPrimaryKnowledgePoint, "20以内进位加法");
  assert.deepEqual(folded.suggestedSecondaryKnowledgePoints, ["凑十法"]);
  assert.equal(folded.suggestedMistakeCause, "把加法看成减法");
  assert.equal(requests[0]?.grade, 3);

  const stillFolded = await learningLoop.getExplanation(guardian.id, question.id, {
    revealAnswer: true,
  });
  assert.equal(stillFolded.finalAnswer, null);

  await learningLoop.setAnswerRevealPreferenceAsync(guardian.id, true);
  const revealed = await learningLoop.getExplanation(guardian.id, question.id, {
    revealAnswer: true,
  });
  assert.equal(revealed.finalAnswer, "8");
  assert.equal(revealed.variantExercise.stem, "4 + 5 = ?");
  assert.equal(revealed.variantExercise.answer, "9");
});

test("a student answer can be attached later and unclear handwriting skips answer analysis", async () => {
  const requests: ExplanationRequest[] = [];
  const learningLoop = new LearningLoop(undefined, {
    explanationProvider: (request) => {
      requests.push(request);
      return explanationContent;
    },
  });
  const { guardian, child } = await confirmedGuardianWithChild(learningLoop);
  const question = await captureConfirmedQuestion(learningLoop, guardian, child);

  const withAnswer = await learningLoop.recordStudentAnswerAsync(guardian.id, question.id, {
    answer: "7",
  });
  assert.equal(withAnswer.studentAnswer, "7");
  assert.equal(withAnswer.answerAnalysisSkipped, false);

  await learningLoop.getExplanation(guardian.id, question.id);
  assert.equal(requests.at(-1)?.studentAnswer, "7");
  assert.equal(requests.at(-1)?.skipAnswerAnalysis, false);

  const skipped = await learningLoop.recordStudentAnswerAsync(guardian.id, question.id, {
    skipAnalysis: true,
  });
  assert.equal(skipped.studentAnswer, null);
  assert.equal(skipped.answerAnalysisSkipped, true);

  await learningLoop.getExplanation(guardian.id, question.id);
  assert.equal(requests.at(-1)?.studentAnswer, null);
  assert.equal(requests.at(-1)?.skipAnswerAnalysis, true);

  const otherGuardian = (await learningLoop.startWeChatLoginAsync("other-code")).account;
  await learningLoop.confirmGuardianshipAsync(otherGuardian.id);
  await assert.rejects(
      learningLoop.recordStudentAnswerAsync(otherGuardian.id, question.id, {
        answer: "8",
      }),
    /not available to this guardian/i,
  );
});

test("a confirmed question uses recognized handwriting until a guardian edits it", async () => {
  const learningLoop = new LearningLoop();
  const { guardian, child } = await confirmedGuardianWithChild(learningLoop);
  const draft = await learningLoop.startQuestionDraftAsync(guardian.id, child.id, "camera");
  await learningLoop.recordQuestionRecognitionAsync(guardian.id, draft.id, {
    stem: "3 + 5 = ?",
    formulas: ["3 + 5"],
    region: null,
    confidence: 0.95,
    studentAnswer: "7",
    studentAnswerConfidence: 0.42,
  });

  const question = await learningLoop.confirmQuestionAsync(guardian.id, draft.id, {
    stem: "3 + 5 = ?",
  });
  assert.equal(question.studentAnswer, "7");
});

test("a saved mistake carries one primary knowledge point, up to two secondary, and an editable cause", async () => {
  const learningLoop = new LearningLoop();
  const { guardian, child } = await confirmedGuardianWithChild(learningLoop);
  const question = await captureConfirmedQuestion(learningLoop, guardian, child);

  const mistake = await learningLoop.saveMistakeAsync(guardian.id, question.id, {
    primaryKnowledgePoint: "20以内进位加法",
    secondaryKnowledgePoints: ["数的组成", "凑十法"],
    mistakeCause: "把加法看成减法",
  });

  assert.equal(mistake.questionId, question.id);
  assert.equal(mistake.childProfileId, child.id);
  assert.equal(mistake.primaryKnowledgePoint, "20以内进位加法");
  assert.deepEqual(mistake.secondaryKnowledgePoints, ["数的组成", "凑十法"]);
  assert.equal(mistake.mistakeCause, "把加法看成减法");

  const updated = await learningLoop.updateMistakeCauseAsync(
    guardian.id,
    mistake.id,
    "粗心抄错数字",
  );
  assert.equal(updated.mistakeCause, "粗心抄错数字");

  await assert.rejects(
      learningLoop.saveMistakeAsync(guardian.id, question.id, {
        primaryKnowledgePoint: "  ",
      }),
    /primary knowledge point/i,
  );
  await assert.rejects(
      learningLoop.saveMistakeAsync(guardian.id, question.id, {
        primaryKnowledgePoint: "加法",
        secondaryKnowledgePoints: ["一", "二", "三"],
      }),
    /at most two/i,
  );
  const replay = await learningLoop.saveMistakeAsync(guardian.id, question.id, {
    primaryKnowledgePoint: "加法",
  });
  assert.equal(replay.id, mistake.id);

  const otherGuardian = (await learningLoop.startWeChatLoginAsync("other-code")).account;
  await learningLoop.confirmGuardianshipAsync(otherGuardian.id);
  await assert.rejects(
      learningLoop.updateMistakeCauseAsync(otherGuardian.id, mistake.id, "x"),
    /not available to this guardian/i,
  );
});

test("an unreliable question cannot be explained or saved as a mistake", async () => {
  const learningLoop = new LearningLoop(undefined, {
    explanationProvider: () => explanationContent,
  });
  const { guardian, child } = await confirmedGuardianWithChild(learningLoop);

  const draft = await learningLoop.startQuestionDraftAsync(guardian.id, child.id, "camera");
  await learningLoop.recordQuestionRecognitionAsync(guardian.id, draft.id, {
    stem: "3 + S = ?",
    formulas: [],
    region: null,
    confidence: 0.3,
  });
  const pending = await learningLoop.confirmQuestionAsync(guardian.id, draft.id, {
    stem: "3 + S = ?",
  });
  assert.equal(pending.status, "pending-confirmation");

  await assert.rejects(
    learningLoop.getExplanation(guardian.id, pending.id),
    /reliable/i,
  );
  await assert.rejects(
      learningLoop.saveMistakeAsync(guardian.id, pending.id, {
        primaryKnowledgePoint: "加法",
      }),
    /reliable/i,
  );
});
