import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"
import { describe, expect, it } from "vitest"

import { requireEnv, runMigrations } from "./migrate.js"

const drizzleFolder = fileURLToPath(new URL("../drizzle", import.meta.url))
const migrationUnderTest = "0009_operator_paid_fallbacks"

async function migrationsBefore(tag: string): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "migrations-"))
  await cp(drizzleFolder, folder, { recursive: true })
  const journalPath = join(folder, "meta", "_journal.json")
  const journal = JSON.parse(await readFile(journalPath, "utf8")) as {
    entries: { tag: string }[]
  }
  journal.entries = journal.entries.slice(
    0,
    journal.entries.findIndex((entry) => entry.tag === tag)
  )
  await writeFile(journalPath, JSON.stringify(journal))
  return folder
}

async function emptyDatabase(name: string): Promise<string> {
  const adminUrl = requireEnv("DATABASE_ADMIN_URL")
  const admin = postgres(adminUrl, { max: 1 })
  try {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
    await admin.unsafe(`CREATE DATABASE ${name}`)
  } finally {
    await admin.end()
  }
  const url = new URL(adminUrl)
  url.pathname = `/${name}`
  return url.toString()
}

describe("operator-paid fallbacks migration", () => {
  it("deletes saved transcript and reader keys and keeps OpenRouter keys", async () => {
    const url = await emptyDatabase("second_brain_migration_test")
    const folder = await migrationsBefore(migrationUnderTest)
    const client = postgres(url, { max: 1 })
    try {
      await migrate(drizzle({ client }), { migrationsFolder: folder })
      const [user] = await client<{ id: string }[]>`
        insert into users (id, email, name)
        values (gen_random_uuid(), 'keys@example.test', 'keys')
        returning id`
      for (const provider of ["openrouter", "transcript", "reader"]) {
        await client`
          insert into user_keys (user_id, provider, encrypted_key, last4)
          values (${user?.id ?? ""}, ${provider}, 'ciphertext', '1234')`
      }

      await runMigrations(url)

      const remaining = await client<{ provider: string }[]>`
        select provider::text from user_keys order by provider`
      expect(remaining.map((row) => row.provider)).toEqual(["openrouter"])
      await expect(
        client`insert into user_keys (user_id, provider, encrypted_key, last4)
               values (${user?.id ?? ""}, 'transcript', 'x', '1')`
      ).rejects.toThrow()
    } finally {
      await client.end()
      await rm(folder, { recursive: true, force: true })
    }
  })
})
