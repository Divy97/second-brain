import { createOpenRouter } from "@workspace/ai"
import { loadCandidates, searchChunks, type Database } from "@workspace/db"

import { embeddingModel, retrieval } from "../config.js"
import { answerQuestion, toSources, type Answer } from "./answer.js"
import { rerankCandidates } from "./rerank.js"
import { rewriteQuestion } from "./rewrite.js"
import { fuseRankings } from "./rrf.js"
import { resolveOpenRouterKey } from "../user-keys/index.js"

import type { HistoryTurn } from "./history.js"

export interface AskInput {
  userId: string
  question: string
  timezone: string
  now: Date
  history: HistoryTurn[]
}

export type AskResult =
  { ok: true; answer: Answer } | { ok: false; reason: "missing_key" }

export async function askQuestion(
  db: Database,
  env: Env,
  input: AskInput
): Promise<AskResult> {
  const key = await resolveOpenRouterKey(db, env, input.userId)
  if (!key.ok) return { ok: false, reason: "missing_key" }
  const openRouter = createOpenRouter({ apiKey: key.apiKey })

  const rewrite = await rewriteQuestion(openRouter, input)
  const { embeddings } = await openRouter.embed({
    model: embeddingModel,
    input: rewrite.variants,
  })
  const lists = await searchChunks(db, {
    userId: input.userId,
    embeddingModel,
    variants: rewrite.variants.map((text, index) => ({
      text,
      embedding: embeddings[index] ?? [],
    })),
    keywords: rewrite.keywords,
    limit: retrieval.perListLimit,
  })
  const fused = fuseRankings(lists, retrieval.rrfK)
  const candidates = await loadCandidates(db, {
    userId: input.userId,
    embeddingModel,
    chunkIds: fused
      .slice(0, retrieval.rerankCandidates)
      .map((entry) => entry.id),
  })
  const relevant = await rerankCandidates(openRouter, { rewrite, candidates })
  const answer = await answerQuestion(openRouter, {
    question: rewrite.question,
    sources: toSources(relevant),
    history: input.history,
  })
  return { ok: true, answer }
}
