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
    max: 5,
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
export { generateId } from "./schema.js"
export {
  deleteUserKey,
  findUserKey,
  saveUserKey,
  type KeyProvider,
  type StoredUserKey,
  type UserKeyRef,
} from "./queries/user-keys.js"
export {
  captureTextItem,
  findItem,
  InvalidCursorError,
  listItems,
  replaceItemText,
  softDeleteItem,
  type CapturedItem,
  type ItemDetail,
  type ItemKind,
  type ItemPage,
  type ItemRef,
  type ItemStatus,
  type ItemSummary,
  type ReplaceTextResult,
} from "./queries/items.js"
