import { randomUUID } from "node:crypto";
import { closeMysqlPool, createMysqlPool, readMysqlConnectionConfig } from "../src/adapters/mysql-pool.ts";
import { MysqlLearningLoopStore } from "../src/adapters/mysql-learning-loop-store.ts";
import { LearningLoop } from "../src/learning-loop.ts";
import { MysqlIdempotencyStore } from "../src/server/idempotency-store.ts";

const config = readMysqlConnectionConfig();
if (!config) throw new Error("MYSQL_* configuration is required.");
const parentSubject = `acceptance-${randomUUID()}`;
let pool = createMysqlPool(config);
const loop = new LearningLoop(new MysqlLearningLoopStore(pool));
let parentId = "";
try {
  const login = await loop.startWeChatLoginAsync(parentSubject);
  parentId = login.account.id;
  const guardian = await loop.confirmGuardianshipAsync(parentId);
  const idempotency = new MysqlIdempotencyStore(pool);
  await idempotency.claim(parentId, "acceptance", "replay-key");
  await idempotency.complete(parentId, "acceptance", "replay-key", { ok: true });
  const idempotencyReplay = await idempotency.claim(parentId, "acceptance", "replay-key");
  const child = await loop.createChildProfileAsync(parentId, { nickname: "验收", grade: 3 });
  const draft = await loop.startQuestionDraftAsync(parentId, child.id, "manual");
  const question = await loop.confirmQuestionAsync(parentId, draft.id, { stem: "2+2=?", studentAnswer: "4" });
  const mistake = await loop.saveMistakeAsync(parentId, question.id, { primaryKnowledgePoint: "加法" });
  const review = await loop.startReviewAsync(parentId, mistake.id);
  const result = await loop.completeReviewAsync(parentId, review.reviewId, { selfAssessment: "mastered", variantCorrect: null });
  await closeMysqlPool(pool);
  pool = createMysqlPool(config);
  const restoredStore = new MysqlLearningLoopStore(pool);
  const restored = await new LearningLoop(restoredStore).getHomeOverviewAsync(parentId);
  const restoredSubject = await restoredStore.findWeChatSubject(parentId);
  console.log(JSON.stringify({ guardianship: guardian.guardianshipConfirmed, question: question.status, reviewRecorded: !result.alreadyRecorded, restoredStage: restored.stage, identityRestored: restoredSubject === parentSubject, idempotencyReplay: idempotencyReplay.state === "completed" }));
} finally {
  if (parentId) {
    try { await new MysqlLearningLoopStore(pool).deleteParentAccount(parentId); } catch { /* best effort cleanup */ }
  }
  await closeMysqlPool(pool);
}
