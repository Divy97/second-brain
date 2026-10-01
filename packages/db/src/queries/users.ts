import { eq } from "drizzle-orm"

import { users } from "../schema.js"

import type { Database } from "../database.js"

export async function findUserEmail(
  db: Database,
  userId: string
): Promise<string | null> {
  const [row] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
  return row?.email ?? null
}
