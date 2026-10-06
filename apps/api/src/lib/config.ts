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
  // The corrected question plus two variants.
  maxQueryStrings: 3,
  perListLimit: 20,
  rrfK: 60,
  rerankCandidates: 30,
  rerankKeep: 8,
  rerankFloor: 0.3,
  answerConfidenceFloor: 0.4,
  wholeItemMaxChars: 4000,
  historyMessages: 6,
  followUpItems: 3,
  followUpChunksPerItem: 3,
}

// Supadata bills reel audio per minute while the allowance counts calls, so length is
// bounded separately. Instagram caps a reel at 3 minutes; anything longer is not a reel.
export const reelAudio = { maxDurationSeconds: 180 }

// Operator-paid lookups each User may spend per UTC day, per service (ADR-0006).
export const paidLookupAllowance = {
  transcript: 2,
  reader: 2,
  // Billed per minute, so it is capped apart from the rest: sharing the transcript
  // allowance would halve how many reels a day a User can capture.
  reel_audio: 2,
} as const

export const backups = {
  retentionDays: 7,
}

export const nothingSavedReply = "I don't have anything saved about that."
