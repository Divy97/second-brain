import { count, eq } from "drizzle-orm"

import { apikeys } from "../schema.js"

import type { Database } from "../database.js"

export async function countDeviceKeys(
  db: Database,
  userId: string
): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(apikeys)
    .where(eq(apikeys.referenceId, userId))
  return row?.total ?? 0
}
