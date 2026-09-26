import { runMigrations } from "../migrate.js"

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/second_brain"

await runMigrations(databaseUrl)
console.log(`migrated ${new URL(databaseUrl).pathname.slice(1)}`)
