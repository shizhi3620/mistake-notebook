import assert from "node:assert/strict";
import test from "node:test";

import { LearningLoop } from "../src/learning-loop.ts";

function confirmedGuardianWithChild(learningLoop: LearningLoop) {
  const guardian = learningLoop.startWeChatLogin("guardian-code").account;
  learningLoop.confirmGuardianship(guardian.id);
  const child = learningLoop.createChildProfile(guardian.id, {
    nickname: "小明",
    grade: 3,
    region: "浙江",
  });
  return { guardian, child };
}

test("a confirmed guardian starts a question draft that is not yet a question", () => {
  const learningLoop = new LearningLoop();
  const { guardian, child } = confirmedGuardianWithChild(learningLoop);

  const draft = learningLoop.startQuestionDraft(guardian.id, child.id, "camera");

  assert.match(draft.id, /^[0-9a-f-]{36}$/i);
  assert.equal(draft.childProfileId, child.id);
  assert.equal(draft.source, "camera");
  assert.equal(draft.imageKey, null);
  assert.equal(draft.recognition, null);

  const unconfirmed = learningLoop.startWeChatLogin("unconfirmed-code").account;
  assert.throws(
    () => learningLoop.startQuestionDraft(unconfirmed.id, child.id, "camera"),
    /guardianship confirmation/i,
  );
  assert.throws(
    () => learningLoop.startQuestionDraft(unconfirmed.id, child.id, "album"),
    /guardianship confirmation/i,
  );

  const otherGuardian = learningLoop.startWeChatLogin("other-code").account;
  learningLoop.confirmGuardianship(otherGuardian.id);
  assert.throws(
    () => learningLoop.startQuestionDraft(otherGuardian.id, child.id, "camera"),
    /not available to this guardian/i,
  );
});

test("the draft preview supports cropping and rotating with validation", () => {
  const learningLoop = new LearningLoop();
  const { guardian, child } = confirmedGuardianWithChild(learningLoop);
  const draft = learningLoop.startQuestionDraft(guardian.id, child.id, "album");

  const edited = learningLoop.updateQuestionDraft(guardian.id, draft.id, {
    crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
    rotationDegrees: 90,
  });

  assert.deepEqual(edited.crop, { x: 0.1, y: 0.2, width: 0.5, height: 0.4 });
  assert.equal(edited.rotationDegrees, 90);

  assert.throws(
    () =>
      learningLoop.updateQuestionDraft(guardian.id, draft.id, {
        rotationDegrees: 45,
      }),
    /rotation/i,
  );
  assert.throws(
    () =>
      learningLoop.updateQuestionDraft(guardian.id, draft.id, {
        crop: { x: 0.8, y: 0.2, width: 0.5, height: 0.4 },
      }),
    /crop/i,
  );

  const otherGuardian = learningLoop.startWeChatLogin("other-code").account;
  learningLoop.confirmGuardianship(otherGuardian.id);
  assert.throws(
    () =>
      learningLoop.updateQuestionDraft(otherGuardian.id, draft.id, {
        rotationDegrees: 180,
      }),
    /not available to this guardian/i,
  );
});

test("photo upload uses a short-lived single-use credential and failures keep the draft recoverable", () => {
  let now = 1_000_000;
  const learningLoop = new LearningLoop(undefined, { now: () => now });
  const { guardian, child } = confirmedGuardianWithChild(learningLoop);
  const draft = learningLoop.startQuestionDraft(guardian.id, child.id, "camera");

  const credential = learningLoop.requestPhotoUpload(guardian.id, draft.id);
  assert.ok(credential.expiresAt > now);
  assert.ok(credential.expiresAt <= now + 15 * 60 * 1000);
  assert.ok(credential.imageKey);

  const uploaded = learningLoop.completePhotoUpload(
    guardian.id,
    credential.uploadToken,
  );
  assert.equal(uploaded.imageKey, credential.imageKey);

  assert.throws(
    () => learningLoop.completePhotoUpload(guardian.id, credential.uploadToken),
    /already been used/i,
  );

  const otherGuardian = learningLoop.startWeChatLogin("other-code").account;
  learningLoop.confirmGuardianship(otherGuardian.id);
  assert.throws(
    () =>
      learningLoop.completePhotoUpload(otherGuardian.id, credential.uploadToken),
    /not available to this guardian/i,
  );

  const expiredDraft = learningLoop.startQuestionDraft(
    guardian.id,
    child.id,
    "camera",
  );
  const expiring = learningLoop.requestPhotoUpload(guardian.id, expiredDraft.id);
  now += 16 * 60 * 1000;
  assert.throws(
    () => learningLoop.completePhotoUpload(guardian.id, expiring.uploadToken),
    /expired/i,
  );

  const fresh = learningLoop.requestPhotoUpload(guardian.id, expiredDraft.id);
  const recovered = learningLoop.completePhotoUpload(
    guardian.id,
    fresh.uploadToken,
  );
  assert.equal(recovered.imageKey, fresh.imageKey);
});

test("cancelling a draft leaves no question behind and voids its credentials", () => {
  const learningLoop = new LearningLoop();
  const { guardian, child } = confirmedGuardianWithChild(learningLoop);
  const draft = learningLoop.startQuestionDraft(guardian.id, child.id, "album");
  const credential = learningLoop.requestPhotoUpload(guardian.id, draft.id);

  learningLoop.cancelQuestionDraft(guardian.id, draft.id);

  assert.throws(
    () => learningLoop.completePhotoUpload(guardian.id, credential.uploadToken),
    /no longer valid/i,
  );
  assert.throws(
    () =>
      learningLoop.updateQuestionDraft(guardian.id, draft.id, {
        rotationDegrees: 90,
      }),
    /not available to this guardian/i,
  );
});

test("recognition is editable before confirmation and produces a confirmed question", () => {
  const learningLoop = new LearningLoop();
  const { guardian, child } = confirmedGuardianWithChild(learningLoop);
  const draft = learningLoop.startQuestionDraft(guardian.id, child.id, "camera");
  const credential = learningLoop.requestPhotoUpload(guardian.id, draft.id);
  learningLoop.completePhotoUpload(guardian.id, credential.uploadToken);

  const recognized = learningLoop.recordQuestionRecognition(
    guardian.id,
    draft.id,
    {
      stem: "3 + 5 = ?",
      formulas: ["3+5"],
      region: { x: 0.1, y: 0.1, width: 0.6, height: 0.2 },
      confidence: 0.92,
    },
  );
  assert.equal(recognized.recognition?.confidence, 0.92);

  const question = learningLoop.confirmQuestion(guardian.id, draft.id, {
    stem: "3 + 5 = ?",
    studentAnswer: "7",
  });

  assert.equal(question.status, "confirmed");
  assert.equal(question.stem, "3 + 5 = ?");
  assert.equal(question.studentAnswer, "7");
  assert.equal(question.imageKey, credential.imageKey);
  assert.deepEqual(question.formulas, ["3+5"]);
});

test("a low-confidence recognition stays pending until the stem is corrected or the photo retaken", () => {
  const learningLoop = new LearningLoop();
  const { guardian, child } = confirmedGuardianWithChild(learningLoop);

  const uncertainDraft = learningLoop.startQuestionDraft(
    guardian.id,
    child.id,
    "camera",
  );
  const credential = learningLoop.requestPhotoUpload(
    guardian.id,
    uncertainDraft.id,
  );
  learningLoop.completePhotoUpload(guardian.id, credential.uploadToken);
  learningLoop.recordQuestionRecognition(guardian.id, uncertainDraft.id, {
    stem: "3 + S = ?",
    formulas: [],
    region: null,
    confidence: 0.3,
  });

  const pending = learningLoop.confirmQuestion(guardian.id, uncertainDraft.id, {
    stem: "3 + S = ?",
  });
  assert.equal(pending.status, "pending-confirmation");

  const correctedDraft = learningLoop.startQuestionDraft(
    guardian.id,
    child.id,
    "camera",
  );
  learningLoop.recordQuestionRecognition(guardian.id, correctedDraft.id, {
    stem: "3 + S = ?",
    formulas: [],
    region: null,
    confidence: 0.3,
  });
  const corrected = learningLoop.confirmQuestion(guardian.id, correctedDraft.id, {
    stem: "3 + 5 = ?",
  });
  assert.equal(corrected.status, "confirmed");

  const retakeDraft = learningLoop.startQuestionDraft(
    guardian.id,
    child.id,
    "camera",
  );
  const retakeCredential = learningLoop.requestPhotoUpload(
    guardian.id,
    retakeDraft.id,
  );
  learningLoop.completePhotoUpload(guardian.id, retakeCredential.uploadToken);
  learningLoop.recordQuestionRecognition(guardian.id, retakeDraft.id, {
    stem: "模糊题干",
    formulas: [],
    region: null,
    confidence: 0.2,
  });

  const cleared = learningLoop.reselectDraftImage(guardian.id, retakeDraft.id);
  assert.equal(cleared.imageKey, null);
  assert.equal(cleared.recognition, null);
});

test("manual entry without a photo produces a confirmed question", () => {
  const learningLoop = new LearningLoop();
  const { guardian, child } = confirmedGuardianWithChild(learningLoop);

  const draft = learningLoop.startQuestionDraft(guardian.id, child.id, "manual");
  const question = learningLoop.confirmQuestion(guardian.id, draft.id, {
    stem: "小明有 3 个苹果，吃了 1 个，还剩几个？",
  });

  assert.equal(question.status, "confirmed");
  assert.equal(question.imageKey, null);
  assert.equal(question.source, "manual");

  const emptyDraft = learningLoop.startQuestionDraft(
    guardian.id,
    child.id,
    "manual",
  );
  assert.throws(
    () => learningLoop.confirmQuestion(guardian.id, emptyDraft.id, { stem: "  " }),
    /stem/i,
  );
});
