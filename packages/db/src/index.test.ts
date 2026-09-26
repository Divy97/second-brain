import { describe, expect, it } from "vitest"

import { checkDatabaseHealth, connect } from "./index.js"
import { createFreshDatabase, runMigrations } from "./migrate.js"

describe("database", () => {
  it("creates a fresh, fully migrated database and stays idempotent on re-migration", async () => {
    const url = await createFreshDatabase("second_brain_db_test")
    await runMigrations(url)

    const connection = connect(url)
    const tables = await connection.db.execute<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name"
    )
    await connection.close()

    expect(tables.map((row) => row.table_name)).toEqual(
      expect.arrayContaining([
        "users",
        "user_keys",
        "items",
        "item_captures",
        "chunks",
        "entities",
        "item_entities",
        "threads",
        "messages",
      ])
    )
  })

  it("reports a healthy round-trip with pgvector installed", async () => {
    const url = await createFreshDatabase("second_brain_db_test")
    const connection = connect(url)
    const health = await checkDatabaseHealth(connection.db)
    await connection.close()

    expect(health.ok).toBe(true)
    expect(health.latencyMs).toBeGreaterThanOrEqual(0)
    expect(health.serverVersion).toMatch(/^17\./)
    expect(health.pgvectorVersion).toMatch(/^\d+\.\d+/)
  })

  it("rejects unsafe database names", async () => {
    await expect(createFreshDatabase("bad; drop table users")).rejects.toThrow(
      /invalid database name/
    )
  })
})
