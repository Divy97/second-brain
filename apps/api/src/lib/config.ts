import { schema } from "@workspace/db"

// Fixed per platform; changing the embedding model is a re-embed job, never a per-user choice.
export const embeddingModel = "baai/bge-m3"
export const embeddingDimensions = schema.EMBEDDING_DIMENSIONS

// Platform default for enrich, rewrite, rerank and answer until users pick their own.
// Deliberately cheap while every item is test data; supports structured outputs and is multilingual.
export const chatModel = "google/gemini-2.5-flash-lite"

export const enrichment = {
  neighbourCount: 5,
  maxTags: 10,
  maxTitleLength: 120,
}

// Token counts are estimated, not tokenised: no bge-m3 tokenizer runs on Workers, and the
// spec's sizes are approximate. See pipeline/chunk-text.ts for the estimate.
export const chunking = {
  singleChunkMaxTokens: 500,
  targetTokens: 400,
  overlapRatio: 0.15,
  minTrailingTokens: 80,
}

// A run that has not moved an item for this long is presumed dead and may be retried.
export const stalledRunAfterMs = 10 * 60 * 1000

export const pipelineStep = {
  retries: { limit: 3, delay: "10 seconds", backoff: "exponential" },
  timeout: "5 minutes",
} as const

export const retrieval = {
  perListLimit: 20,
  rrfK: 60,
  rerankCandidates: 30,
  rerankKeep: 8,
  rerankFloor: 0.3,
  answerConfidenceFloor: 0.4,
  wholeItemMaxChars: 4000,
}

export const nothingSavedReply = "I don't have anything saved about that."
