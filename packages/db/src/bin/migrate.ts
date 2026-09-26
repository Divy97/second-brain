import { requireEnv, runMigrations } from "../migrate.js"

const databaseUrl = requireEnv("DATABASE_URL")
await runMigrations(databaseUrl)
console.log(`migrated ${new URL(databaseUrl).pathname.slice(1)}`)
