import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"

import { migrationsFolder } from "./lib/migrations-folder.js"
import * as schema from "./schema.js"

// Node-only entry point: migrations read files from disk and never run inside a Worker.

export async function runMigrations(connectionString: string): Promise<void> {
  const client = postgres(connectionString, { max: 1 })
  try {
    await migrate(drizzle({ client, schema }), { migrationsFolder })
  } finally {
    await client.end()
  }
}

// Drops and recreates `name` on the server `adminUrl` points at, migrates it, and returns its URL.
export async function createFreshDatabase(
  adminUrl: string,
  name: string
): Promise<string> {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`invalid database name: ${name}`)
  }
  const admin = postgres(adminUrl, { max: 1 })
  try {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
    await admin.unsafe(`CREATE DATABASE ${name}`)
  } finally {
    await admin.end()
  }
  const url = new URL(adminUrl)
  url.pathname = `/${name}`
  await runMigrations(url.toString())
  return url.toString()
}
