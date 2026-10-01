import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm"

import { chunks, entities, generateId, itemEntities, items } from "../schema.js"

import type { Database } from "../database.js"
import type { PartialReason } from "../schema.js"
import type { ItemEntity, ItemKind, ItemRef } from "./item-types.js"

export interface PipelineJob {
  itemId: string
  run: number
}

export interface ClaimedItem {
  userId: string
  rawText: string
  type: "text" | "voice" | "image" | "pdf" | "url"
  fileKey: string | null
  fileName: string | null
  mimeType: string | null
  sourceUrl: string | null
  sourceNote: string | null
  captureQuality: "full" | "partial" | null
}

export interface Enrichment {
  title: string
  summary: string
  cleanText: string
  kind: ItemKind
  language: string
  tags: string[]
  entities: ItemEntity[]
}

export interface IndexedChunk {
  text: string
  searchText: string
  embedding: number[]
}

export type FailureReason =
  | "missing_key"
  | "invalid_key"
  | "insufficient_credits"
  | "model_error"
  | "processing_error"

const currentRun = (job: PipelineJob) =>
  and(
    eq(items.id, job.itemId),
    eq(items.pipelineRun, job.run),
    isNull(items.deletedAt)
  )

// Only the item's current run may move it forward; an older run (superseded by an edit or
// a retry) or a deleted item returns undefined and the run stops.
export async function claimItemRun(
  db: Database,
  job: PipelineJob
): Promise<ClaimedItem | undefined> {
  const [row] = await db
    .update(items)
    .set({ status: "processing", failureReason: null, error: null })
    .where(
      and(currentRun(job), inArray(items.status, ["pending", "processing"]))
    )
    .returning({
      userId: items.userId,
      rawText: items.rawText,
      type: items.type,
      fileKey: items.fileKey,
      fileName: items.fileName,
      mimeType: items.mimeType,
      sourceUrl: items.sourceUrl,
      sourceNote: items.sourceNote,
      captureQuality: items.captureQuality,
    })
  return row
}

export async function saveExtractedText(
  db: Database,
  job: PipelineJob,
  text: string,
  quality: "full" | "partial" = "full",
  partialReason: PartialReason | null = null
): Promise<boolean> {
  const rows = await db
    .update(items)
    .set({ rawText: text, captureQuality: quality, partialReason })
    .where(currentRun(job))
    .returning({ id: items.id })
  return rows.length > 0
}

export async function loadExtractedText(
  db: Database,
  job: PipelineJob
): Promise<string | undefined> {
  const [row] = await db
    .select({ rawText: items.rawText })
    .from(items)
    .where(currentRun(job))
  return row?.rawText
}

// Nearest chunks first (index-ordered and bounded), then the closest distinct items.
export async function findNeighbourTags(
  db: Database,
  input: {
    userId: string
    excludeItemId: string
    embedding: number[]
    embeddingModel: string
    limit: number
  }
): Promise<string[]> {
  const vector = JSON.stringify(input.embedding)
  const rows = await db.execute<{ tags: string[] }>(sql`
    with nearest_chunks as (
      select c.item_id, c.embedding <=> ${vector}::vector as distance
      from ${chunks} c
      join ${items} i on i.id = c.item_id
      where i.user_id = ${input.userId}
        and i.id <> ${input.excludeItemId}
        and i.deleted_at is null
        and i.status = 'ready'
        and c.embedding_model = ${input.embeddingModel}
      order by c.embedding <=> ${vector}::vector
      limit ${input.limit * 8}
    ), nearest_items as (
      select item_id, min(distance) as distance
      from nearest_chunks
      group by item_id
      order by min(distance)
      limit ${input.limit}
    )
    select i.tags
    from nearest_items n
    join ${items} i on i.id = n.item_id
    order by n.distance
  `)
  return [...new Set(rows.flatMap((row) => row.tags))]
}

function normalizeEntityName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase()
}

export async function saveProcessedItem(
  db: Database,
  job: PipelineJob,
  input: {
    userId: string
    enrichment: Enrichment
    chunks: IndexedChunk[]
    embeddingModel: string
    embeddingDimensions: number
  }
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const { enrichment } = input
    const updated = await tx
      .update(items)
      .set({
        status: "ready",
        title: enrichment.title,
        summary: enrichment.summary,
        cleanText: enrichment.cleanText,
        kind: enrichment.kind,
        language: enrichment.language,
        tags: enrichment.tags,
        failureReason: null,
        error: null,
      })
      .where(and(currentRun(job), eq(items.status, "processing")))
      .returning({ id: items.id })
    if (updated.length === 0) return false

    await tx.delete(chunks).where(eq(chunks.itemId, job.itemId))
    await tx.delete(itemEntities).where(eq(itemEntities.itemId, job.itemId))
    await tx.insert(chunks).values(
      input.chunks.map((chunk, idx) => ({
        itemId: job.itemId,
        idx,
        text: chunk.text,
        searchText: chunk.searchText,
        embedding: chunk.embedding,
        embeddingModel: input.embeddingModel,
        embeddingDimensions: input.embeddingDimensions,
      }))
    )

    const uniqueEntities = [
      ...new Map(
        enrichment.entities
          .map((entity) => ({
            ...entity,
            normalizedName: normalizeEntityName(entity.name),
          }))
          .filter((entity) => entity.normalizedName.length > 0)
          .map((entity) => [`${entity.type}:${entity.normalizedName}`, entity])
      ).values(),
    ]
    if (uniqueEntities.length > 0) {
      const stored = await tx
        .insert(entities)
        .values(
          uniqueEntities.map((entity) => ({
            id: generateId(),
            userId: input.userId,
            name: entity.name.trim(),
            normalizedName: entity.normalizedName,
            type: entity.type,
          }))
        )
        .onConflictDoUpdate({
          target: [entities.userId, entities.normalizedName, entities.type],
          set: { normalizedName: sql`excluded.normalized_name` },
        })
        .returning({ id: entities.id })
      await tx
        .insert(itemEntities)
        .values(
          stored.map((entity) => ({ itemId: job.itemId, entityId: entity.id }))
        )
    }
    return true
  })
}

export async function markItemFailed(
  db: Database,
  job: PipelineJob,
  failure: { reason: FailureReason; error: string }
): Promise<void> {
  await db
    .update(items)
    .set({
      status: "failed",
      failureReason: failure.reason,
      error: failure.error,
    })
    .where(currentRun(job))
}

export type RequeueResult =
  | { outcome: "queued"; job: PipelineJob }
  | { outcome: "not_found" }
  | { outcome: "conflict" }

// Starts a new run from scratch: bumps the run so any in-flight run becomes stale.
export async function requeueItem(
  db: Database,
  ref: ItemRef,
  allowedFrom: ("pending" | "ready" | "failed")[],
  stalledBefore?: Date,
  resetExtraction = false
): Promise<RequeueResult> {
  const [row] = await db
    .update(items)
    .set({
      status: "pending",
      pipelineRun: sql`${items.pipelineRun} + 1`,
      failureReason: null,
      error: null,
      ...(resetExtraction
        ? {
            rawText: sql`case when ${items.type} in ('voice', 'image', 'pdf') then '' when ${items.type} = 'url' and not ${items.clientText} then coalesce(${items.sourceNote}, ${items.sourceUrl}, '') else ${items.rawText} end`,
            captureQuality: sql`case when ${items.type} in ('voice', 'image', 'pdf') or (${items.type} = 'url' and not ${items.clientText}) then null else ${items.captureQuality} end`,
            partialReason: sql`case when ${items.type} in ('voice', 'image', 'pdf') or (${items.type} = 'url' and not ${items.clientText}) then null else ${items.partialReason} end`,
          }
        : {}),
    })
    .where(
      and(
        eq(items.id, ref.itemId),
        eq(items.userId, ref.userId),
        isNull(items.deletedAt),
        or(
          inArray(items.status, allowedFrom),
          stalledBefore
            ? and(
                eq(items.status, "processing"),
                lt(items.updatedAt, stalledBefore)
              )
            : undefined
        )
      )
    )
    .returning({ run: items.pipelineRun })
  if (row)
    return { outcome: "queued", job: { itemId: ref.itemId, run: row.run } }
  const [exists] = await db
    .select({ id: items.id })
    .from(items)
    .where(
      and(
        eq(items.id, ref.itemId),
        eq(items.userId, ref.userId),
        isNull(items.deletedAt)
      )
    )
  return exists ? { outcome: "conflict" } : { outcome: "not_found" }
}
