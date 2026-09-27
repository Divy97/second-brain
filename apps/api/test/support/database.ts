import { env } from "cloudflare:workers"

import { connect, type Database } from "@workspace/db"

let shared: Database | undefined

// One client per test file for code the tests call directly. Test code runs in a
// long-lived Durable Object, so a client per call would hold a Postgres connection each
// until the run ends.
export function testDb(): Database {
  shared ??= connect(env.HYPERDRIVE.connectionString).db
  return shared
}
