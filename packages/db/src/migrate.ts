import { fileURLToPath } from "node:url"

import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"

import * as schema from "./schema.js"

// Node-only entry point: migrations read files from disk and never run inside a Worker.

const migrationsFolder = fileURLToPath(
  new URL("../drizzle", import.meta.url).href
)

export function requireEnv(
  name: "DATABASE_URL" | "DATABASE_ADMIN_URL"
): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `${name} is not set; copy .env.example to .env and fill it in`
    )
  }
  return value
}

export async function runMigrations(connectionString: string): Promise<void> {
  const client = postgres(connectionString, { max: 1 })
  try {
    await migrate(drizzle({ client, schema }), { migrationsFolder })
  } finally {
    await client.end()
  }
}

export async function createFreshDatabase(
  name: string,
  adminUrl: string = requireEnv("DATABASE_ADMIN_URL")
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
