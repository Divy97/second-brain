import { and, count, eq, inArray, isNull, sql } from "drizzle-orm"

import { items } from "../schema.js"

import type { Database } from "../database.js"
import type { ItemRef } from "./item-types.js"
import type { PipelineJob } from "./pipeline.js"

export async function countStoredItems(
  db: Database,
  userId: string
): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(items)
    .where(
      and(
        eq(items.userId, userId),
        eq(items.status, "stored"),
        isNull(items.deletedAt)
      )
    )
  return row?.total ?? 0
}

// Moves Stored items into the pipeline and returns a job for every requested item that is now
// pending, so repeating the call after the queue refused a job queues it again.
export async function indexStoredItems(
  db: Database,
  userId: string,
  itemIds: string[]
): Promise<PipelineJob[]> {
  const owned = and(
    eq(items.userId, userId),
    inArray(items.id, itemIds),
    isNull(items.deletedAt)
  )
  await db
    .update(items)
    .set({ status: "pending", pipelineRun: sql`${items.pipelineRun} + 1` })
    .where(and(owned, eq(items.status, "stored")))
  return db
    .select({ itemId: items.id, run: items.pipelineRun })
    .from(items)
    .where(and(owned, eq(items.status, "pending")))
}

export async function deleteStoredItem(
  db: Database,
  ref: ItemRef
): Promise<boolean> {
  const rows = await db
    .update(items)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(items.id, ref.itemId),
        eq(items.userId, ref.userId),
        eq(items.status, "stored"),
        isNull(items.deletedAt)
      )
    )
    .returning({ id: items.id })
  return rows.length > 0
}
