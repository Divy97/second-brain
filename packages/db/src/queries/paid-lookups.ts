import { lt, sql } from "drizzle-orm"

import { paidLookupUsage } from "../schema.js"

import type { Database } from "../database.js"

export type PaidService = (typeof paidLookupUsage.$inferSelect)["service"]

export interface PaidLookup {
  userId: string
  service: PaidService
  day: string
  limit: number
}

export async function spendPaidLookup(
  db: Database,
  { userId, service, day, limit }: PaidLookup
): Promise<boolean> {
  if (limit < 1) return false
  const rows = await db
    .insert(paidLookupUsage)
    .values({ userId, service, day, count: 1 })
    .onConflictDoUpdate({
      target: [
        paidLookupUsage.userId,
        paidLookupUsage.day,
        paidLookupUsage.service,
      ],
      set: { count: sql`${paidLookupUsage.count} + 1` },
      setWhere: lt(paidLookupUsage.count, limit),
    })
    .returning({ count: paidLookupUsage.count })
  return rows.length > 0
}
