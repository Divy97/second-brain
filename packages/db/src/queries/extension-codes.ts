import { and, eq, gt } from "drizzle-orm"

import { generateId, verifications } from "../schema.js"

import type { Database } from "../database.js"

export interface AuthorizationCode {
  userId: string
  codeChallenge: string
  redirectUri: string
  label: string
}

const identifierFor = (codeHash: string) => `extension-code:${codeHash}`

// Codes ride in the verifications table. Only the hash of a code is stored.
export async function saveAuthorizationCode(
  db: Database,
  input: { codeHash: string; expiresAt: Date } & AuthorizationCode
): Promise<void> {
  const { codeHash, expiresAt, ...payload } = input
  await db.insert(verifications).values({
    id: generateId(),
    identifier: identifierFor(codeHash),
    value: JSON.stringify(payload),
    expiresAt,
  })
}

// Single use: the row is deleted by the same statement that reads it.
export async function consumeAuthorizationCode(
  db: Database,
  codeHash: string
): Promise<AuthorizationCode | null> {
  const [row] = await db
    .delete(verifications)
    .where(
      and(
        eq(verifications.identifier, identifierFor(codeHash)),
        gt(verifications.expiresAt, new Date())
      )
    )
    .returning({ value: verifications.value })
  return row ? (JSON.parse(row.value) as AuthorizationCode) : null
}
