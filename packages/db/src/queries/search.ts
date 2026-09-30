import { sql, type SQL } from "drizzle-orm"

import { chunks, facts, items } from "../schema.js"

import type { Database } from "../database.js"
import type { ItemKind } from "./item-types.js"

export interface TimeWindow {
  from: Date | null
  to: Date | null
}

export interface SearchInput {
  userId: string
  embeddingModel: string
  variants: { text: string; embedding: number[] }[]
  keywords: string[]
  window: TimeWindow
  preferredKind: ItemKind | null
  limit: number
}

export interface Candidate {
  candidateId: string
  itemId: string
  text: string
  itemTitle: string | null
  itemKind: ItemKind | null
  itemRawText: string
  capturedAt: Date
}

const searchableChunk = (userId: string, embeddingModel: string) => sql`
  i.user_id = ${userId}
  and i.deleted_at is null
  and i.status = 'ready'
  and c.embedding_model = ${embeddingModel}
`

const searchableFact = (userId: string, embeddingModel: string) => sql`
  f.user_id = ${userId}
  and f.valid_to is null
  and f.embedding_model = ${embeddingModel}
  and i.deleted_at is null
  and i.status = 'ready'
`

function listFilter(input: SearchInput, kind: ItemKind | null): SQL {
  return sql`
    ${searchableChunk(input.userId, input.embeddingModel)}
    ${input.window.from ? sql`and i.captured_at >= ${input.window.from.toISOString()}::timestamptz` : sql``}
    ${input.window.to ? sql`and i.captured_at < ${input.window.to.toISOString()}::timestamptz` : sql``}
    ${kind ? sql`and i.kind = ${kind}` : sql``}
  `
}

function factListFilter(input: SearchInput): SQL {
  return sql`
    ${searchableFact(input.userId, input.embeddingModel)}
    ${input.window.from ? sql`and i.captured_at >= ${input.window.from.toISOString()}::timestamptz` : sql``}
    ${input.window.to ? sql`and i.captured_at < ${input.window.to.toISOString()}::timestamptz` : sql``}
  `
}

function vectorList(
  label: string,
  embedding: number[],
  input: SearchInput,
  kind: ItemKind | null = null
): SQL {
  const vector = JSON.stringify(embedding)
  return sql`(
    with hits as materialized (
      select c.id, c.embedding <=> ${vector}::vector as distance
      from ${chunks} c
      join ${items} i on i.id = c.item_id
      where ${listFilter(input, kind)}
      order by c.embedding <=> ${vector}::vector
      limit ${input.limit}
    )
    select ${label} as list, id, row_number() over (order by distance + 0, id) as rank
    from hits
  )`
}

function vectorFactList(
  label: string,
  embedding: number[],
  input: SearchInput
): SQL {
  const vector = JSON.stringify(embedding)
  return sql`(
    with hits as materialized (
      select f.id, f.embedding <=> ${vector}::vector as distance
      from ${facts} f
      join ${items} i on i.id = f.source_item_id
      where ${factListFilter(input)}
      order by f.embedding <=> ${vector}::vector
      limit ${input.limit}
    )
    select ${label} as list, id, row_number() over (order by distance + 0, id) as rank
    from hits
  )`
}

function fullTextList(label: string, query: SQL, input: SearchInput): SQL {
  return sql`(
    with query as (select ${query} as q), hits as materialized (
      select c.id, ts_rank_cd(c.tsv, query.q) as score
      from ${chunks} c
      join ${items} i on i.id = c.item_id
      cross join query
      where query.q is not null
        and querytree(query.q) not in ('', 'T')
        and c.tsv @@ query.q
        and ${listFilter(input, null)}
      order by score desc, c.id
      limit ${input.limit}
    )
    select ${label} as list, id, row_number() over (order by score desc, id) as rank
    from hits
  )`
}

function fullTextFactList(label: string, query: SQL, input: SearchInput): SQL {
  return sql`(
    with query as (select ${query} as q), hits as materialized (
      select f.id, ts_rank_cd(f.tsv, query.q) as score
      from ${facts} f
      join ${items} i on i.id = f.source_item_id
      cross join query
      where query.q is not null
        and querytree(query.q) not in ('', 'T')
        and f.tsv @@ query.q
        and ${factListFilter(input)}
      order by score desc, f.id
      limit ${input.limit}
    )
    select ${label} as list, id, row_number() over (order by score desc, id) as rank
    from hits
  )`
}

// websearch_to_tsquery never raises on raw text; AND across a variant's words.
const variantQuery = (text: string) =>
  sql`websearch_to_tsquery('simple', ${text})`

// OR across the parser-normalised keyword lexemes; the parser drops operator characters.
const keywordQuery = (keywords: string[]) => sql`(
  select string_agg(quote_literal(lexeme), ' | ')::tsquery
  from unnest(tsvector_to_array(to_tsvector('simple', ${keywords.join(" ")}))) as lexeme
)`

// A preferred kind adds lists instead of filtering, so those items rank higher without
// excluding the rest. Iterative index scans keep filtered HNSW searches from returning
// fewer than `limit` rows when the user owns a small share of the index.
export async function searchChunks(
  db: Database,
  input: SearchInput
): Promise<string[][]> {
  const lists = [
    ...input.variants.flatMap((variant, index) => [
      vectorList(`vector:${index}`, variant.embedding, input),
      vectorFactList(`fact-vector:${index}`, variant.embedding, input),
      fullTextList(`text:${index}`, variantQuery(variant.text), input),
      fullTextFactList(`fact-text:${index}`, variantQuery(variant.text), input),
      ...(input.preferredKind
        ? [
            vectorList(
              `kind:${index}`,
              variant.embedding,
              input,
              input.preferredKind
            ),
          ]
        : []),
    ]),
    ...(input.keywords.length > 0
      ? [fullTextList("keywords", keywordQuery(input.keywords), input)]
      : []),
    ...(input.keywords.length > 0
      ? [fullTextFactList("fact-keywords", keywordQuery(input.keywords), input)]
      : []),
  ]
  if (lists.length === 0) return []

  const rows = await db.transaction(
    async (tx) => {
      await tx.execute(
        sql`select set_config('hnsw.iterative_scan', 'relaxed_order', true)`
      )
      return tx.execute<{ list: string; id: string; rank: string }>(
        sql.join(lists, sql` union all `)
      )
    },
    { accessMode: "read only" }
  )

  const byList = new Map<string, { id: string; rank: number }[]>()
  for (const row of rows) {
    const entries = byList.get(row.list) ?? []
    entries.push({ id: row.id, rank: Number(row.rank) })
    byList.set(row.list, entries)
  }
  return [...byList.values()].map((entries) =>
    entries.sort((a, b) => a.rank - b.rank).map((entry) => entry.id)
  )
}

export async function loadCandidates(
  db: Database,
  input: { userId: string; embeddingModel: string; candidateIds: string[] }
): Promise<Candidate[]> {
  if (input.candidateIds.length === 0) return []
  const rows = await db.execute<{
    candidate_id: string
    item_id: string
    candidate_text: string
    item_title: string | null
    item_kind: ItemKind | null
    item_raw_text: string
    captured_at: Date
  }>(sql`
    select c.id as candidate_id, c.item_id, c.text as candidate_text, i.title as item_title,
           i.kind as item_kind, i.raw_text as item_raw_text, i.captured_at
    from ${chunks} c
    join ${items} i on i.id = c.item_id
    where c.id in ${input.candidateIds}
      and ${searchableChunk(input.userId, input.embeddingModel)}
    union all
    select f.id as candidate_id, f.source_item_id as item_id, f.text as candidate_text,
           i.title as item_title, i.kind as item_kind, f.text as item_raw_text,
           i.captured_at
    from ${facts} f
    join ${items} i on i.id = f.source_item_id
    where f.id in ${input.candidateIds}
      and ${searchableFact(input.userId, input.embeddingModel)}
  `)
  const byId = new Map(
    rows.map((row) => [
      row.candidate_id,
      {
        candidateId: row.candidate_id,
        itemId: row.item_id,
        text: row.candidate_text,
        itemTitle: row.item_title,
        itemKind: row.item_kind,
        itemRawText: row.item_raw_text,
        capturedAt: new Date(row.captured_at),
      },
    ])
  )
  return input.candidateIds.flatMap((id) => byId.get(id) ?? [])
}

// Every chunk of the given items, in item order then chunk order: the follow-up path puts
// the thread's previous citations at the top of the candidates.
export async function loadItemChunks(
  db: Database,
  input: {
    userId: string
    embeddingModel: string
    itemIds: string[]
    chunksPerItem: number
  }
): Promise<string[]> {
  if (input.itemIds.length === 0) return []
  const rows = await db.execute<{ id: string; item_id: string }>(sql`
    select c.id, c.item_id
    from ${chunks} c
    join ${items} i on i.id = c.item_id
    where c.item_id in ${input.itemIds}
      and ${searchableChunk(input.userId, input.embeddingModel)}
    order by c.idx
  `)
  const byItem = new Map<string, string[]>()
  for (const row of rows) {
    byItem.set(row.item_id, [...(byItem.get(row.item_id) ?? []), row.id])
  }
  return input.itemIds.flatMap((itemId) =>
    (byItem.get(itemId) ?? []).slice(0, input.chunksPerItem)
  )
}
