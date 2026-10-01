import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import * as schema from "./schema.js"

import type { Database } from "./database.js"

export type { Database }

export interface DatabaseConnection {
  db: Database
  close: () => Promise<void>
}

export interface DatabaseHealth {
  ok: true
  latencyMs: number
  serverVersion: string
  pgvectorVersion: string
}

// Hyperdrive guidance: few connections per Worker request, no type fetching round-trip,
// prepared statements so Hyperdrive can cache them.
export function connect(connectionString: string): DatabaseConnection {
  const client = postgres(connectionString, {
    max: 1,
    fetch_types: false,
    prepare: true,
  })
  return {
    db: drizzle({ client, schema }),
    close: () => client.end({ timeout: 5 }),
  }
}

export async function checkDatabaseHealth(
  db: Database
): Promise<DatabaseHealth> {
  const startedAt = performance.now()
  const [row] = await db.execute<{
    server_version: string
    pgvector_version: string | null
  }>(
    "select current_setting('server_version') as server_version, (select extversion from pg_extension where extname = 'vector') as pgvector_version"
  )
  const latencyMs = Math.round(performance.now() - startedAt)
  if (!row?.pgvector_version) {
    throw new Error("pgvector extension is not installed")
  }
  return {
    ok: true,
    latencyMs,
    serverVersion: row.server_version,
    pgvectorVersion: row.pgvector_version,
  }
}

export { schema }
export { generateId, type PartialReason } from "./schema.js"
export {
  spendPaidLookup,
  type PaidLookup,
  type PaidService,
} from "./queries/paid-lookups.js"
export {
  consumeAuthorizationCode,
  saveAuthorizationCode,
  type AuthorizationCode,
} from "./queries/extension-codes.js"
export {
  defaultCaptureSettings,
  findCaptureSettings,
  saveCaptureSettings,
  type CaptureSettings,
} from "./queries/capture-settings.js"
export {
  countStoredItems,
  deleteStoredItem,
  indexStoredItems,
} from "./queries/stored-items.js"
export { capturePageItem } from "./queries/page-captures.js"
export { findUserEmail } from "./queries/users.js"
export {
  deleteUserKey,
  findUserKey,
  saveUserKey,
  type KeyProvider,
  type StoredUserKey,
  type UserKeyRef,
} from "./queries/user-keys.js"
export {
  captureFileItem,
  captureTextItem,
  captureUrlItem,
  completeFileDeletion,
  findItem,
  findItemFile,
  InvalidCursorError,
  listItems,
  listFileDeletions,
  queueFileDeletion,
  replaceItemText,
  softDeleteItem,
  type CapturedItem,
  type ItemDetail,
  type ItemPage,
  type ItemSummary,
  type ListedItem,
  type ReplaceTextResult,
} from "./queries/items.js"
export type {
  EntityType,
  ItemEntity,
  ItemKind,
  ItemRef,
  ItemStatus,
} from "./queries/item-types.js"
export {
  claimItemRun,
  loadExtractedText,
  saveExtractedText,
  findNeighbourTags,
  markItemFailed,
  requeueItem,
  saveProcessedItem,
  type ClaimedItem,
  type Enrichment,
  type FailureReason,
  type IndexedChunk,
  type PipelineJob,
  type RequeueResult,
} from "./queries/pipeline.js"
export {
  appendExchange,
  createThread,
  findThread,
  listLiveItemIds,
  listRecentMessages,
  listSourceCards,
  listThreads,
  softDeleteThread,
  threadExists,
  type SourceCard,
  type ThreadMessage,
  type ThreadRef,
  type ThreadSummary,
} from "./queries/threads.js"
export {
  loadCandidates,
  loadItemChunks,
  searchChunks,
  type Candidate,
  type SearchInput,
  type TimeWindow,
} from "./queries/search.js"
export {
  findSimilarFacts,
  saveFactChanges,
  type FactChange,
  type SimilarFact,
} from "./queries/facts.js"
