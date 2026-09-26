import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm"

import {
  chunks,
  generateId,
  itemCaptures,
  itemEntities,
  items,
} from "../schema.js"

import type { Database } from "../database.js"

type ItemRow = typeof items.$inferSelect

export type ItemStatus = ItemRow["status"]
export type ItemKind = NonNullable<ItemRow["kind"]>

const EXCERPT_LENGTH = 200

export interface ItemSummary {
  id: string
  status: ItemStatus
  kind: ItemKind | null
  title: string | null
  excerpt: string
  capturedAt: Date
}

export interface ItemDetail extends ItemSummary {
  rawText: string
  cleanText: string | null
  summary: string | null
  language: string | null
  tags: string[]
  failureReason: string | null
  error: string | null
  captures: Date[]
}

export interface CapturedItem {
  item: ItemSummary & { rawText: string }
  created: boolean
}

export interface ItemRef {
  userId: string
  itemId: string
}

export interface ItemPage {
  items: ItemSummary[]
  nextCursor: string | null
}

const summaryColumns = {
  id: items.id,
  status: items.status,
  kind: items.kind,
  title: items.title,
  excerpt: sql<string>`left(${items.rawText}, ${EXCERPT_LENGTH})`,
  capturedAt: items.capturedAt,
}

const visibleItem = (ref: ItemRef) =>
  and(
    eq(items.id, ref.itemId),
    eq(items.userId, ref.userId),
    isNull(items.deletedAt)
  )

interface CaptureRow extends Record<string, unknown> {
  id: string
  status: ItemStatus
  kind: ItemKind | null
  title: string | null
  raw_text: string
  captured_at: Date
  created: boolean
}

// One round trip: insert or revive the user's item for this content hash, and record the
// capture in the same statement. xmax = 0 only for rows this statement inserted.
export async function captureTextItem(
  db: Database,
  input: { userId: string; text: string; contentHash: string }
): Promise<CapturedItem> {
  const [row] = await db.execute<CaptureRow>(sql`
    with upserted as (
      insert into ${items} (id, user_id, type, status, content_hash, raw_text)
      values (${generateId()}, ${input.userId}, 'text', 'pending', ${input.contentHash}, ${input.text})
      on conflict (user_id, content_hash) do update
        set deleted_at = null, captured_at = now(), updated_at = now()
      returning id, status, kind, title, raw_text, captured_at, (xmax = 0) as created
    ), capture as (
      insert into ${itemCaptures} (id, item_id, captured_at)
      select ${generateId()}, id, captured_at from upserted
    )
    select * from upserted
  `)
  if (!row) throw new Error("capture did not return a row")
  return {
    created: row.created,
    item: {
      id: row.id,
      status: row.status,
      kind: row.kind,
      title: row.title,
      excerpt: row.raw_text.slice(0, EXCERPT_LENGTH),
      rawText: row.raw_text,
      capturedAt: new Date(row.captured_at),
    },
  }
}

function encodeCursor(item: ItemSummary): string {
  return `${item.capturedAt.toISOString()}_${item.id}`
}

function decodeCursor(cursor: string): { capturedAt: Date; id: string } | null {
  const [iso, id] = cursor.split("_")
  if (!iso || !id) return null
  const capturedAt = new Date(iso)
  return Number.isNaN(capturedAt.getTime()) ? null : { capturedAt, id }
}

export async function listItems(
  db: Database,
  input: { userId: string; limit: number; cursor?: string }
): Promise<ItemPage> {
  const after = input.cursor ? decodeCursor(input.cursor) : null
  const rows = await db
    .select(summaryColumns)
    .from(items)
    .where(
      and(
        eq(items.userId, input.userId),
        isNull(items.deletedAt),
        after
          ? or(
              lt(items.capturedAt, after.capturedAt),
              and(
                eq(items.capturedAt, after.capturedAt),
                lt(items.id, after.id)
              )
            )
          : undefined
      )
    )
    .orderBy(desc(items.capturedAt), desc(items.id))
    .limit(input.limit + 1)
  const page = rows.slice(0, input.limit)
  const last = page.at(-1)
  return {
    items: page,
    nextCursor: rows.length > input.limit && last ? encodeCursor(last) : null,
  }
}

export async function findItem(
  db: Database,
  ref: ItemRef
): Promise<ItemDetail | undefined> {
  const [row] = await db
    .select({
      ...summaryColumns,
      rawText: items.rawText,
      cleanText: items.cleanText,
      summary: items.summary,
      language: items.language,
      tags: items.tags,
      failureReason: items.failureReason,
      error: items.error,
    })
    .from(items)
    .where(visibleItem(ref))
  if (!row) return undefined
  const captures = await db
    .select({ capturedAt: itemCaptures.capturedAt })
    .from(itemCaptures)
    .where(eq(itemCaptures.itemId, ref.itemId))
    .orderBy(desc(itemCaptures.capturedAt))
  return { ...row, captures: captures.map((capture) => capture.capturedAt) }
}

export type ReplaceTextResult =
  { outcome: "replaced" } | { outcome: "not_found" } | { outcome: "duplicate" }

const UNIQUE_VIOLATION = "23505"

function isUniqueViolation(error: unknown): boolean {
  const cause = error instanceof Error && "cause" in error ? error.cause : error
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    cause.code === UNIQUE_VIOLATION
  )
}

export async function replaceItemText(
  db: Database,
  ref: ItemRef,
  input: { text: string; contentHash: string }
): Promise<ReplaceTextResult> {
  try {
    return await db.transaction(async (tx) => {
      const updated = await tx
        .update(items)
        .set({
          rawText: input.text,
          contentHash: input.contentHash,
          status: "pending",
          kind: null,
          title: null,
          summary: null,
          cleanText: null,
          language: null,
          tags: [],
          failureReason: null,
          error: null,
        })
        .where(visibleItem(ref))
        .returning({ id: items.id })
      if (updated.length === 0) return { outcome: "not_found" as const }
      await tx.delete(chunks).where(eq(chunks.itemId, ref.itemId))
      await tx.delete(itemEntities).where(eq(itemEntities.itemId, ref.itemId))
      return { outcome: "replaced" as const }
    })
  } catch (error) {
    if (isUniqueViolation(error)) return { outcome: "duplicate" }
    throw error
  }
}

export async function softDeleteItem(
  db: Database,
  ref: ItemRef
): Promise<boolean> {
  const deleted = await db
    .update(items)
    .set({ deletedAt: new Date() })
    .where(visibleItem(ref))
    .returning({ id: items.id })
  return deleted.length > 0
}
