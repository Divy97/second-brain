import { and, eq, isNull, sql } from "drizzle-orm"

import { facts } from "../schema.js"

import type { Database } from "../database.js"

export interface SimilarFact extends Record<string, unknown> {
  id: string
  text: string
}

export interface FactChange {
  text: string
  embedding: number[]
  action: "ADD" | "UPDATE" | "DELETE" | "NOOP"
  existingFactId: string | null
}

export async function findSimilarFacts(
  db: Database,
  input: {
    userId: string
    embedding: number[]
    embeddingModel: string
    limit: number
  }
): Promise<SimilarFact[]> {
  const vector = JSON.stringify(input.embedding)
  return db.execute<SimilarFact>(sql`
    select id, text
    from ${facts}
    where user_id = ${input.userId}
      and valid_to is null
      and embedding_model = ${input.embeddingModel}
    order by embedding <=> ${vector}::vector
    limit ${input.limit}
  `)
}

export async function saveFactChanges(
  db: Database,
  input: {
    userId: string
    sourceItemId: string
    changes: FactChange[]
    embeddingModel: string
    embeddingDimensions: number
  }
): Promise<void> {
  await db.transaction(async (tx) => {
    const now = new Date()
    for (const change of input.changes) {
      if (change.action !== "UPDATE" && change.action !== "DELETE") continue
      const existingFactId = change.existingFactId
      if (!existingFactId) continue
      await tx
        .update(facts)
        .set({ validTo: now })
        .where(
          and(
            eq(facts.id, existingFactId),
            eq(facts.userId, input.userId),
            isNull(facts.validTo)
          )
        )
    }

    const inserts = input.changes.filter(
      (change) => change.action === "ADD" || change.action === "UPDATE"
    )
    if (inserts.length === 0) return
    await tx.insert(facts).values(
      inserts.map((change) => ({
        userId: input.userId,
        sourceItemId: input.sourceItemId,
        text: change.text,
        searchText: change.text,
        embedding: change.embedding,
        embeddingModel: input.embeddingModel,
        embeddingDimensions: input.embeddingDimensions,
      }))
    )
  })
}
