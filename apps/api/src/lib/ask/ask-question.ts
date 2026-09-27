import { createOpenRouter } from "@workspace/ai"
import {
  loadCandidates,
  loadItemChunks,
  searchChunks,
  type Database,
} from "@workspace/db"

import { embeddingModel, retrieval } from "../config.js"
import {
  answerQuestion,
  nothingSaved,
  toSources,
  type Answer,
} from "./answer.js"
import { timeWindow } from "./filters.js"
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
  // A follow-up about an exchange whose note was deleted has nothing left to refer to.
  const lastAnswer = [...input.history]
    .reverse()
    .find((turn) => turn.role === "assistant")
  if (rewrite.followUp && lastAnswer?.hidden)
    return { ok: true, answer: nothingSaved }
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
    window: timeWindow(rewrite.filters, input.now, input.timezone),
    preferredKind: rewrite.filters.kind,
    limit: retrieval.perListLimit,
  })
  const fused = fuseRankings(lists, retrieval.rrfK).map((entry) => entry.id)
  // Follow-ups: the most recently cited notes lead the candidates and skip the rerank
  // floor, so "tell me more about that one" always reaches the note it refers to.
  const previouslyCited = rewrite.followUp
    ? await loadItemChunks(db, {
        userId: input.userId,
        embeddingModel,
        itemIds: [
          ...new Set(
            input.history.flatMap((turn) => turn.citedItemIds).reverse()
          ),
        ].slice(0, retrieval.followUpItems),
        chunksPerItem: retrieval.followUpChunksPerItem,
      })
    : []
  const candidates = await loadCandidates(db, {
    userId: input.userId,
    embeddingModel,
    chunkIds: [...new Set([...previouslyCited, ...fused])].slice(
      0,
      retrieval.rerankCandidates
    ),
  })
  const reranked = await rerankCandidates(openRouter, {
    rewrite,
    candidates,
    history: input.history,
  })
  const carriedOver = candidates.filter((candidate) =>
    previouslyCited.includes(candidate.chunkId)
  )
  const relevant = [
    ...new Map(
      [...carriedOver, ...reranked].map((candidate) => [
        candidate.chunkId,
        candidate,
      ])
    ).values(),
  ].slice(0, retrieval.rerankKeep)
  const answer = await answerQuestion(openRouter, {
    question: rewrite.question,
    sources: toSources(relevant, input.timezone),
    history: input.history,
  })
  return { ok: true, answer }
}
