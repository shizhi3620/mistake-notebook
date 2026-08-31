export type ImageRetentionKind = "original" | "crop" | "draft";
export type ImageCleanupTask = {
  id: string;
  fileId: string;
  kind: ImageRetentionKind;
  deleteAfter: number;
  attempts: number;
  lastError: string | null;
  deletedAt: number | null;
};

export const IMAGE_RETENTION_MS: Record<ImageRetentionKind, number> = {
  original: 0,
  crop: 365 * 24 * 60 * 60 * 1000,
  draft: 24 * 60 * 60 * 1000,
};

export function scheduleImageCleanup(input: { id: string; fileId: string; kind: ImageRetentionKind; createdAt: number; keepOriginal?: boolean }): ImageCleanupTask {
  const retention = input.kind === "original" && input.keepOriginal ? 365 * 24 * 60 * 60 * 1000 : IMAGE_RETENTION_MS[input.kind];
  return { id: input.id, fileId: input.fileId, kind: input.kind, deleteAfter: input.createdAt + retention, attempts: 0, lastError: null, deletedAt: null };
}

export async function runImageCleanup(tasks: ImageCleanupTask[], now: number, deleteFile: (fileId: string) => Promise<void>, maxAttempts = 3): Promise<ImageCleanupTask[]> {
  for (const task of tasks) {
    if (task.deletedAt !== null || task.deleteAfter > now || task.attempts >= maxAttempts) continue;
    try { await deleteFile(task.fileId); task.deletedAt = now; task.lastError = null; }
    catch (error) { task.attempts += 1; task.lastError = error instanceof Error ? error.message : "unknown deletion error"; }
  }
  return tasks;
}
