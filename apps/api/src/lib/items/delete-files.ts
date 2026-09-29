import {
  completeFileDeletion,
  listFileDeletions,
  type Database,
} from "@workspace/db"

export async function deletePendingFiles(db: Database, bucket: R2Bucket) {
  const pending = await listFileDeletions(db, 100)
  for (const { fileKey } of pending) {
    try {
      await bucket.delete(fileKey)
      await completeFileDeletion(db, fileKey)
    } catch (error) {
      console.error("file deletion failed", fileKey, error)
    }
  }
}
