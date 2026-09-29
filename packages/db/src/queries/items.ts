import { and, desc, eq, isNull, lt, sql } from "drizzle-orm"

import {
  chunks,
  fileDeletions,
  generateId,
  itemCaptures,
  itemEntities,
  items,
} from "../schema.js"
import { listItemEntities } from "./item-entities.js"

import type { Database } from "../database.js"
import type { ItemEntity, ItemKind, ItemRef, ItemStatus } from "./item-types.js"

const EXCERPT_LENGTH = 200

export interface ItemSummary {
  id: string
  type: "text" | "voice" | "image" | "pdf" | "url"
  status: ItemStatus
  captureQuality: "full" | "partial" | null
  kind: ItemKind | null
  title: string | null
  excerpt: string
  capturedAt: Date
}

export interface ItemDetail extends ItemSummary {
  fileName: string | null
  mimeType: string | null
  fileSize: number | null
  sourceUrl: string | null
  sourceNote: string | null
  rawText: string
  cleanText: string | null
  summary: string | null
  language: string | null
  tags: string[]
  failureReason: string | null
  error: string | null
  updatedAt: Date
  entities: ItemEntity[]
  captures: Date[]
}

export interface CapturedItem {
  item: ItemSummary & { rawText: string }
  created: boolean
  run: number
}

export interface ItemPage {
  items: ItemSummary[]
  nextCursor: string | null
}

const summaryColumns = {
  id: items.id,
  type: items.type,
  status: items.status,
  captureQuality: items.captureQuality,
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
  type: "text" | "voice" | "image" | "pdf" | "url"
  status: ItemStatus
  capture_quality: "full" | "partial" | null
  kind: ItemKind | null
  title: string | null
  raw_text: string
  captured_at: Date
  created: boolean
  run: number
}

// One round trip: insert the user's item for this content hash or reuse the live one, and
// record the capture in the same statement. xmax = 0 only for rows this statement inserted.
// Deleted items are outside the partial unique index, so saving their text again starts fresh.
export async function captureTextItem(
  db: Database,
  input: { userId: string; text: string; contentHash: string }
): Promise<CapturedItem> {
  const [row] = await db.execute<CaptureRow>(sql`
    with upserted as (
      insert into ${items} (id, user_id, type, status, content_hash, raw_text)
      values (${generateId()}, ${input.userId}, 'text', 'pending', ${input.contentHash}, ${input.text})
      on conflict (user_id, content_hash) where deleted_at is null do update
        set captured_at = now(), updated_at = now()
      returning id, type, status, capture_quality, kind, title, raw_text, captured_at, pipeline_run as run, (xmax = 0) as created
    ), capture as (
      insert into ${itemCaptures} (id, item_id, captured_at)
      select ${generateId()}, id, captured_at from upserted
    )
    select * from upserted
  `)
  if (!row) throw new Error("capture did not return a row")
  return {
    created: row.created,
    run: row.run,
    item: {
      id: row.id,
      type: row.type,
      status: row.status,
      captureQuality: row.capture_quality,
      kind: row.kind,
      title: row.title,
      excerpt: row.raw_text.slice(0, EXCERPT_LENGTH),
      rawText: row.raw_text,
      capturedAt: new Date(row.captured_at),
    },
  }
}

export async function captureFileItem(
  db: Database,
  input: {
    userId: string
    type: "voice" | "image" | "pdf"
    contentHash: string
    fileKey: string
    fileName: string
    mimeType: string
    fileSize: number
  }
): Promise<CapturedItem> {
  const [row] = await db.execute<CaptureRow>(sql`
    with upserted as (
      insert into ${items} (id, user_id, type, status, content_hash, raw_text, file_key, file_name, mime_type, file_size)
      values (${generateId()}, ${input.userId}, ${input.type}, 'pending', ${input.contentHash}, '', ${input.fileKey}, ${input.fileName}, ${input.mimeType}, ${input.fileSize})
      on conflict (user_id, content_hash) where deleted_at is null do update
        set captured_at = now(), updated_at = now()
      returning id, type, status, capture_quality, kind, title, raw_text, captured_at, pipeline_run as run, (xmax = 0) as created
    ), capture as (
      insert into ${itemCaptures} (id, item_id, captured_at)
      select ${generateId()}, id, captured_at from upserted
    ), reservation_removed as (
      delete from ${fileDeletions}
      where file_key = ${input.fileKey} and exists (select 1 from upserted where created)
    )
    select * from upserted
  `)
  if (!row) throw new Error("capture did not return a row")
  return {
    created: row.created,
    run: row.run,
    item: {
      id: row.id,
      type: row.type,
      status: row.status,
      captureQuality: row.capture_quality,
      kind: row.kind,
      title: row.title,
      excerpt: row.raw_text.slice(0, EXCERPT_LENGTH),
      rawText: row.raw_text,
      capturedAt: new Date(row.captured_at),
    },
  }
}

export async function captureUrlItem(
  db: Database,
  input: {
    userId: string
    sourceUrl: string
    sourceNote: string | null
    contentHash: string
  }
): Promise<CapturedItem> {
  const rawText = input.sourceNote ?? input.sourceUrl
  const [row] = await db.execute<CaptureRow>(sql`
    with upserted as (
      insert into ${items} (id, user_id, type, status, content_hash, raw_text, source_url, source_note)
      values (${generateId()}, ${input.userId}, 'url', 'pending', ${input.contentHash}, ${rawText}, ${input.sourceUrl}, ${input.sourceNote})
      on conflict (user_id, content_hash) where deleted_at is null do update
        set captured_at = now(), updated_at = now(), status = 'pending', raw_text = coalesce(${input.sourceNote}, ${items.sourceNote}, ${items.rawText}), source_note = coalesce(${input.sourceNote}, ${items.sourceNote}), capture_quality = null, pipeline_run = ${items.pipelineRun} + 1
      returning id, type, status, capture_quality, kind, title, raw_text, captured_at, pipeline_run as run, (xmax = 0) as created
    ), capture as (
      insert into ${itemCaptures} (id, item_id, captured_at)
      select ${generateId()}, id, captured_at from upserted
    )
    select * from upserted
  `)
  if (!row) throw new Error("capture did not return a row")
  return {
    created: row.created,
    run: row.run,
    item: {
      id: row.id,
      type: row.type,
      status: row.status,
      captureQuality: row.capture_quality,
      kind: row.kind,
      title: row.title,
      excerpt: row.raw_text.slice(0, EXCERPT_LENGTH),
      rawText: row.raw_text,
      capturedAt: new Date(row.captured_at),
    },
  }
}

// The cursor keeps captured_at at full microsecond precision; a JS Date would truncate it to
// milliseconds and skip rows on the next page.
const cursorKey = sql<string>`to_char(${items.capturedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '_' || ${items.id}`

const cursorPattern =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z)_([0-9a-f-]{36})$/i

export class InvalidCursorError extends Error {
  constructor() {
    super("invalid cursor")
    this.name = "InvalidCursorError"
  }
}

function afterCursor(cursor: string) {
  const match = cursorPattern.exec(cursor)
  if (!match) throw new InvalidCursorError()
  const [, capturedAt, id] = match
  return sql`(${items.capturedAt}, ${items.id}) < (${capturedAt}::timestamptz, ${id}::uuid)`
}

export async function listItems(
  db: Database,
  input: { userId: string; limit: number; cursor?: string }
): Promise<ItemPage> {
  const rows = await db
    .select({ ...summaryColumns, cursor: cursorKey })
    .from(items)
    .where(
      and(
        eq(items.userId, input.userId),
        isNull(items.deletedAt),
        input.cursor ? afterCursor(input.cursor) : undefined
      )
    )
    .orderBy(desc(items.capturedAt), desc(items.id))
    .limit(input.limit + 1)
  const page = rows.slice(0, input.limit)
  return {
    items: page.map(({ cursor: _cursor, ...item }) => item),
    nextCursor:
      rows.length > input.limit ? (page.at(-1)?.cursor ?? null) : null,
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
      fileName: items.fileName,
      mimeType: items.mimeType,
      fileSize: items.fileSize,
      sourceUrl: items.sourceUrl,
      sourceNote: items.sourceNote,
      cleanText: items.cleanText,
      summary: items.summary,
      language: items.language,
      tags: items.tags,
      failureReason: items.failureReason,
      error: items.error,
      updatedAt: items.updatedAt,
    })
    .from(items)
    .where(visibleItem(ref))
  if (!row) return undefined
  const [captures, itemEntityRows] = await Promise.all([
    db
      .select({ capturedAt: itemCaptures.capturedAt })
      .from(itemCaptures)
      .where(eq(itemCaptures.itemId, ref.itemId))
      .orderBy(desc(itemCaptures.capturedAt)),
    listItemEntities(db, ref.itemId),
  ])
  return {
    ...row,
    entities: itemEntityRows,
    captures: captures.map((capture) => capture.capturedAt),
  }
}

export async function findItemFile(
  db: Database,
  ref: ItemRef
): Promise<{ key: string; mimeType: string; fileName: string } | undefined> {
  const [row] = await db
    .select({
      key: items.fileKey,
      mimeType: items.mimeType,
      fileName: items.fileName,
    })
    .from(items)
    .where(visibleItem(ref))
  return row?.key && row.mimeType && row.fileName
    ? { key: row.key, mimeType: row.mimeType, fileName: row.fileName }
    : undefined
}

export type ReplaceTextResult =
  | { outcome: "replaced"; run: number }
  | { outcome: "not_found" }
  | { outcome: "duplicate" }

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
          pipelineRun: sql`${items.pipelineRun} + 1`,
        })
        .where(and(visibleItem(ref), eq(items.type, "text")))
        .returning({ run: items.pipelineRun })
      const [row] = updated
      if (!row) return { outcome: "not_found" as const }
      await tx.delete(chunks).where(eq(chunks.itemId, ref.itemId))
      await tx.delete(itemEntities).where(eq(itemEntities.itemId, ref.itemId))
      return { outcome: "replaced" as const, run: row.run }
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
  return db.transaction(async (tx) => {
    const [deleted] = await tx
      .update(items)
      .set({ deletedAt: new Date() })
      .where(visibleItem(ref))
      .returning({ fileKey: items.fileKey })
    if (!deleted) return false
    if (deleted.fileKey) {
      await tx.insert(fileDeletions).values({ fileKey: deleted.fileKey })
    }
    return true
  })
}

export async function queueFileDeletion(db: Database, fileKey: string) {
  await db.insert(fileDeletions).values({ fileKey })
}

export async function listFileDeletions(
  db: Database,
  limit: number,
  olderThan = new Date()
) {
  return db
    .select({ fileKey: fileDeletions.fileKey })
    .from(fileDeletions)
    .where(lt(fileDeletions.createdAt, olderThan))
    .limit(limit)
}

export async function completeFileDeletion(db: Database, fileKey: string) {
  await db.delete(fileDeletions).where(eq(fileDeletions.fileKey, fileKey))
}
