import assert from "node:assert/strict";
import test from "node:test";

import { LearningLoop } from "../src/learning-loop.ts";

async function confirmedGuardianWithChildAsync(learningLoop: LearningLoop) {
  const guardian = (await learningLoop.startWeChatLoginAsync("guardian-code")).account;
  await learningLoop.confirmGuardianshipAsync(guardian.id);
  const child = await learningLoop.createChildProfileAsync(guardian.id, { nickname: "小明", grade: 3, region: "浙江" });
  return { guardian, child };
}

test("a confirmed guardian starts a question draft that is not yet a question", async () => {
  const learningLoop = new LearningLoop();
  const { guardian, child } = await confirmedGuardianWithChildAsync(learningLoop);

  const draft = await learningLoop.startQuestionDraftAsync(guardian.id, child.id, "camera");

  assert.match(draft.id, /^[0-9a-f-]{36}$/i);
  assert.equal(draft.childProfileId, child.id);
  assert.equal(draft.source, "camera");
  assert.equal(draft.imageKey, null);
  assert.equal(draft.recognition, null);

  const unconfirmed = (await learningLoop.startWeChatLoginAsync("unconfirmed-code")).account;
  await assert.rejects(
    () => learningLoop.startQuestionDraftAsync(unconfirmed.id, child.id, "camera"),
    /guardianship confirmation/i,
  );
  await assert.rejects(
    () => learningLoop.startQuestionDraftAsync(unconfirmed.id, child.id, "album"),
    /guardianship confirmation/i,
  );

  const otherGuardian = (await learningLoop.startWeChatLoginAsync("other-code")).account;
  await learningLoop.confirmGuardianshipAsync(otherGuardian.id);
  await assert.rejects(
    () => learningLoop.startQuestionDraftAsync(otherGuardian.id, child.id, "camera"),
    /not available to this guardian/i,
  );
});

test("the draft preview supports cropping and rotating with validation", async () => {
  const learningLoop = new LearningLoop();
  const { guardian, child } = await confirmedGuardianWithChildAsync(learningLoop);
  const draft = await learningLoop.startQuestionDraftAsync(guardian.id, child.id, "album");

  const edited = await learningLoop.updateQuestionDraftAsync(guardian.id, draft.id, {
    crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
    rotationDegrees: 90,
  });

  assert.deepEqual(edited.crop, { x: 0.1, y: 0.2, width: 0.5, height: 0.4 });
  assert.equal(edited.rotationDegrees, 90);

  await assert.rejects(
    () =>
      learningLoop.updateQuestionDraftAsync(guardian.id, draft.id, {
        rotationDegrees: 45,
      }),
    /rotation/i,
  );
  await assert.rejects(
    () =>
      learningLoop.updateQuestionDraftAsync(guardian.id, draft.id, {
        crop: { x: 0.8, y: 0.2, width: 0.5, height: 0.4 },
      }),
    /crop/i,
  );

  const otherGuardian = (await learningLoop.startWeChatLoginAsync("other-code")).account;
  await learningLoop.confirmGuardianshipAsync(otherGuardian.id);
  await assert.rejects(
    () =>
      learningLoop.updateQuestionDraftAsync(otherGuardian.id, draft.id, {
        rotationDegrees: 180,
      }),
    /not available to this guardian/i,
  );
});

test("photo upload uses a short-lived single-use credential and failures keep the draft recoverable", async () => {
  let now = 1_000_000;
  const learningLoop = new LearningLoop(undefined, { now: () => now });
  const { guardian, child } = await confirmedGuardianWithChildAsync(learningLoop);
  const draft = await learningLoop.startQuestionDraftAsync(guardian.id, child.id, "camera");

  const credential = await learningLoop.requestPhotoUploadAsync(guardian.id, draft.id);
  assert.ok(credential.expiresAt > now);
  assert.ok(credential.expiresAt <= now + 15 * 60 * 1000);
  assert.ok(credential.imageKey);

  const uploaded = await learningLoop.completePhotoUploadAsync(
    guardian.id,
    credential.uploadToken,
  );
  assert.equal(uploaded.imageKey, credential.imageKey);

  await assert.rejects(
    () => learningLoop.completePhotoUploadAsync(guardian.id, credential.uploadToken),
    /already been used/i,
  );

  const otherGuardian = (await learningLoop.startWeChatLoginAsync("other-code")).account;
  await learningLoop.confirmGuardianshipAsync(otherGuardian.id);
  await assert.rejects(
    () =>
      learningLoop.completePhotoUploadAsync(otherGuardian.id, credential.uploadToken),
    /not available to this guardian/i,
  );

  const expiredDraft = await learningLoop.startQuestionDraftAsync(
    guardian.id,
    child.id,
    "camera",
  );
  const expiring = await learningLoop.requestPhotoUploadAsync(guardian.id, expiredDraft.id);
  now += 16 * 60 * 1000;
  await assert.rejects(
    () => learningLoop.completePhotoUploadAsync(guardian.id, expiring.uploadToken),
    /expired/i,
  );

  const fresh = await learningLoop.requestPhotoUploadAsync(guardian.id, expiredDraft.id);
  const recovered = await learningLoop.completePhotoUploadAsync(
    guardian.id,
    fresh.uploadToken,
  );
  assert.equal(recovered.imageKey, fresh.imageKey);
});

test("cancelling a draft leaves no question behind and voids its credentials", async () => {
  const learningLoop = new LearningLoop();
  const { guardian, child } = await confirmedGuardianWithChildAsync(learningLoop);
  const draft = await learningLoop.startQuestionDraftAsync(guardian.id, child.id, "album");
  const credential = await learningLoop.requestPhotoUploadAsync(guardian.id, draft.id);

  await learningLoop.cancelQuestionDraftAsync(guardian.id, draft.id);

  await assert.rejects(
    () => learningLoop.completePhotoUploadAsync(guardian.id, credential.uploadToken),
    /no longer valid/i,
  );
  await assert.rejects(
    () =>
      learningLoop.updateQuestionDraftAsync(guardian.id, draft.id, {
        rotationDegrees: 90,
      }),
    /not available to this guardian/i,
  );
});

test("recognition is editable before confirmation and produces a confirmed question", async () => {
  const learningLoop = new LearningLoop();
  const { guardian, child } = await confirmedGuardianWithChildAsync(learningLoop);
  const draft = await learningLoop.startQuestionDraftAsync(guardian.id, child.id, "camera");
  const credential = await learningLoop.requestPhotoUploadAsync(guardian.id, draft.id);
  await learningLoop.completePhotoUploadAsync(guardian.id, credential.uploadToken);

  const recognized = await learningLoop.recordQuestionRecognitionAsync(
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

  const question = await learningLoop.confirmQuestionAsync(guardian.id, draft.id, {
    stem: "3 + 5 = ?",
    studentAnswer: "7",
  });

  assert.equal(question.status, "confirmed");
  assert.equal(question.stem, "3 + 5 = ?");
  assert.equal(question.studentAnswer, "7");
  assert.equal(question.imageKey, credential.imageKey);
  assert.deepEqual(question.formulas, ["3+5"]);
});

test("a low-confidence recognition stays pending until the stem is corrected or the photo retaken", async () => {
  const learningLoop = new LearningLoop();
  const { guardian, child } = await confirmedGuardianWithChildAsync(learningLoop);

  const uncertainDraft = await learningLoop.startQuestionDraftAsync(
    guardian.id,
    child.id,
    "camera",
  );
  const credential = await learningLoop.requestPhotoUploadAsync(
    guardian.id,
    uncertainDraft.id,
  );
  await learningLoop.completePhotoUploadAsync(guardian.id, credential.uploadToken);
  await learningLoop.recordQuestionRecognitionAsync(guardian.id, uncertainDraft.id, {
    stem: "3 + S = ?",
    formulas: [],
    region: null,
    confidence: 0.3,
  });

  const pending = await learningLoop.confirmQuestionAsync(guardian.id, uncertainDraft.id, {
    stem: "3 + S = ?",
  });
  assert.equal(pending.status, "pending-confirmation");

  const correctedDraft = await learningLoop.startQuestionDraftAsync(
    guardian.id,
    child.id,
    "camera",
  );
  await learningLoop.recordQuestionRecognitionAsync(guardian.id, correctedDraft.id, {
    stem: "3 + S = ?",
    formulas: [],
    region: null,
    confidence: 0.3,
  });
  const corrected = await learningLoop.confirmQuestionAsync(guardian.id, correctedDraft.id, {
    stem: "3 + 5 = ?",
  });
  assert.equal(corrected.status, "confirmed");

  const retakeDraft = await learningLoop.startQuestionDraftAsync(
    guardian.id,
    child.id,
    "camera",
  );
  const retakeCredential = await learningLoop.requestPhotoUploadAsync(
    guardian.id,
    retakeDraft.id,
  );
  await learningLoop.completePhotoUploadAsync(guardian.id, retakeCredential.uploadToken);
  await learningLoop.recordQuestionRecognitionAsync(guardian.id, retakeDraft.id, {
    stem: "模糊题干",
    formulas: [],
    region: null,
    confidence: 0.2,
  });

  const cleared = await learningLoop.reselectDraftImageAsync(guardian.id, retakeDraft.id);
  assert.equal(cleared.imageKey, null);
  assert.equal(cleared.recognition, null);
});

test("manual entry without a photo produces a confirmed question", async () => {
  const learningLoop = new LearningLoop();
  const { guardian, child } = await confirmedGuardianWithChildAsync(learningLoop);

  const draft = await learningLoop.startQuestionDraftAsync(guardian.id, child.id, "manual");
  const question = await learningLoop.confirmQuestionAsync(guardian.id, draft.id, {
    stem: "小明有 3 个苹果，吃了 1 个，还剩几个？",
  });

  assert.equal(question.status, "confirmed");
  assert.equal(question.imageKey, null);
  assert.equal(question.source, "manual");

  const emptyDraft = await learningLoop.startQuestionDraftAsync(
    guardian.id,
    child.id,
    "manual",
  );
  await assert.rejects(
    () => learningLoop.confirmQuestionAsync(guardian.id, emptyDraft.id, { stem: "  " }),
    /stem/i,
  );
});
