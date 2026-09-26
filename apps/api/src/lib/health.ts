import { Hono } from "hono"

import { checkDatabaseHealth, connect } from "@workspace/db"

export const healthRoutes = new Hono<{ Bindings: Env }>()

// Hyperdrive owns the connection pool; per-request clients are cheap and are not
// closed explicitly (postgres.js's end() rejects inside workerd; Cloudflare's examples omit it).
healthRoutes.get("/", async (c) => {
  const { db } = connect(c.env.HYPERDRIVE.connectionString)
  try {
    const database = await checkDatabaseHealth(db)
    return c.json({ ok: true, version: c.env.API_VERSION, database })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "database unreachable"
    return c.json(
      {
        ok: false,
        version: c.env.API_VERSION,
        database: { ok: false, error: message },
      },
      503
    )
  }
})
