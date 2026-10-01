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

// Moves Stored items into the pipeline. Items that are not Stored, not the user's or deleted
// are skipped, so indexing twice queues nothing the second time.
export async function indexStoredItems(
  db: Database,
  userId: string,
  itemIds: string[]
): Promise<PipelineJob[]> {
  const rows = await db
    .update(items)
    .set({ status: "pending", pipelineRun: sql`${items.pipelineRun} + 1` })
    .where(
      and(
        eq(items.userId, userId),
        inArray(items.id, itemIds),
        eq(items.status, "stored"),
        isNull(items.deletedAt)
      )
    )
    .returning({ itemId: items.id, run: items.pipelineRun })
  return rows
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
