import { schema } from "@workspace/db"

// Fixed per platform; changing the embedding model is a re-embed job, never a per-user choice.
export const embeddingModel = "baai/bge-m3"
export const embeddingDimensions = schema.EMBEDDING_DIMENSIONS

// Platform default for enrich, rewrite, rerank and answer until users pick their own.
// Deliberately cheap while every item is test data; supports structured outputs and is multilingual.
export const chatModel = "google/gemini-2.5-flash-lite"
