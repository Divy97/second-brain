import { schema } from "@workspace/db"

// Fixed per platform; changing the embedding model is a re-embed job, never a per-user choice.
export const embeddingModel = "baai/bge-m3"
export const embeddingDimensions = schema.EMBEDDING_DIMENSIONS
