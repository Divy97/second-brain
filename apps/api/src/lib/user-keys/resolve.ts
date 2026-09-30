import { findUserKey, type Database, type KeyProvider } from "@workspace/db"

import { decryptApiKey } from "./encryption.js"
import { keyRef } from "./routes.js"

export type ResolvedKey =
  { ok: true; apiKey: string } | { ok: false; reason: "missing_key" }

export async function resolveUserKey(
  db: Database,
  env: Env,
  userId: string,
  provider: KeyProvider
): Promise<ResolvedKey> {
  const stored = await findUserKey(db, keyRef(userId, provider))
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
