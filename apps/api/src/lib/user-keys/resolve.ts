import { findUserKey, type Database } from "@workspace/db"

import { decryptApiKey } from "./encryption.js"
import { openRouterKeyRef } from "./routes.js"

export type ResolvedKey =
  { ok: true; apiKey: string } | { ok: false; reason: "missing_key" }

export async function resolveOpenRouterKey(
  db: Database,
  env: Env,
  userId: string
): Promise<ResolvedKey> {
  const stored = await findUserKey(db, openRouterKeyRef(userId))
  if (!stored) return { ok: false, reason: "missing_key" }
  return {
    ok: true,
    apiKey: await decryptApiKey(
      env.KEY_ENCRYPTION_SECRET,
      stored.encryptedKey,
      userId
    ),
  }
}
