import { sql, type SQL } from "drizzle-orm"

import { chunks, items } from "../schema.js"

import type { Database } from "../database.js"
import type { ItemKind } from "./item-types.js"

export interface SearchInput {
  userId: string
  embeddingModel: string
  variants: { text: string; embedding: number[] }[]
  keywords: string[]
  limit: number
}

export interface Candidate {
  chunkId: string
  itemId: string
  chunkText: string
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

function vectorList(
  label: string,
  embedding: number[],
  input: SearchInput
): SQL {
  const vector = JSON.stringify(embedding)
  return sql`(
    with hits as materialized (
      select c.id, c.embedding <=> ${vector}::vector as distance
      from ${chunks} c
      join ${items} i on i.id = c.item_id
      where ${searchableChunk(input.userId, input.embeddingModel)}
      order by c.embedding <=> ${vector}::vector
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
        and ${searchableChunk(input.userId, input.embeddingModel)}
      order by score desc, c.id
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

// One statement for every list: per variant a vector and a full-text list, plus one list
// over the keywords. Iterative index scans keep filtered HNSW searches from returning
// fewer than `limit` rows when the user owns a small share of the index.
export async function searchChunks(
  db: Database,
  input: SearchInput
): Promise<string[][]> {
  const lists = [
    ...input.variants.flatMap((variant, index) => [
      vectorList(`vector:${index}`, variant.embedding, input),
      fullTextList(`text:${index}`, variantQuery(variant.text), input),
    ]),
    ...(input.keywords.length > 0
      ? [fullTextList("keywords", keywordQuery(input.keywords), input)]
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
  input: { userId: string; embeddingModel: string; chunkIds: string[] }
): Promise<Candidate[]> {
  if (input.chunkIds.length === 0) return []
  const rows = await db.execute<{
    chunk_id: string
    item_id: string
    chunk_text: string
    item_title: string | null
    item_kind: ItemKind | null
    item_raw_text: string
    captured_at: Date
  }>(sql`
    select c.id as chunk_id, c.item_id, c.text as chunk_text, i.title as item_title,
           i.kind as item_kind, i.raw_text as item_raw_text, i.captured_at
    from ${chunks} c
    join ${items} i on i.id = c.item_id
    where c.id in ${input.chunkIds}
      and ${searchableChunk(input.userId, input.embeddingModel)}
  `)
  const byId = new Map(
    rows.map((row) => [
      row.chunk_id,
      {
        chunkId: row.chunk_id,
        itemId: row.item_id,
        chunkText: row.chunk_text,
        itemTitle: row.item_title,
        itemKind: row.item_kind,
        itemRawText: row.item_raw_text,
        capturedAt: new Date(row.captured_at),
      },
    ])
  )
  return input.chunkIds.flatMap((id) => byId.get(id) ?? [])
}
