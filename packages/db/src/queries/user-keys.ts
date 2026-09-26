import { and, eq } from "drizzle-orm"

import { userKeys } from "../schema.js"

import type { Database } from "../database.js"

export type KeyProvider = (typeof userKeys.$inferSelect)["provider"]

export interface StoredUserKey {
  encryptedKey: string
  last4: string
}

export interface UserKeyRef {
  userId: string
  provider: KeyProvider
}

export async function saveUserKey(
  db: Database,
  ref: UserKeyRef,
  key: StoredUserKey
): Promise<void> {
  await db
    .insert(userKeys)
    .values({ ...ref, ...key })
    .onConflictDoUpdate({
      target: [userKeys.userId, userKeys.provider],
      set: { ...key, updatedAt: new Date() },
    })
}

export async function findUserKey(
  db: Database,
  ref: UserKeyRef
): Promise<StoredUserKey | undefined> {
  const [row] = await db
    .select({ encryptedKey: userKeys.encryptedKey, last4: userKeys.last4 })
    .from(userKeys)
    .where(
      and(eq(userKeys.userId, ref.userId), eq(userKeys.provider, ref.provider))
    )
  return row
}

export async function deleteUserKey(
  db: Database,
  ref: UserKeyRef
): Promise<void> {
  await db
    .delete(userKeys)
    .where(
      and(eq(userKeys.userId, ref.userId), eq(userKeys.provider, ref.provider))
    )
}
