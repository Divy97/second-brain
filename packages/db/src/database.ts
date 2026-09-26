import type * as schema from "./schema.js"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

export type Database = PostgresJsDatabase<typeof schema>
