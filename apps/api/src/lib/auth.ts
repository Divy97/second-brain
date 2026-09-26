import { drizzleAdapter } from "@better-auth/drizzle-adapter"
import { betterAuth } from "better-auth"

import { generateId, schema, type Database } from "@workspace/db"

// Built per request: the adapter captures the request's database client, and Hyperdrive
// wants a fresh client per request. Options are explicit because Better Auth cannot detect
// production on Workers and would otherwise fall back to insecure defaults.
export function createAuth(env: Env, db: Database) {
  return betterAuth({
    baseURL: env.API_ORIGIN,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.WEB_ORIGIN],
    database: drizzleAdapter(db, { provider: "pg", schema, usePlural: true }),
    emailAndPassword: { enabled: true },
    rateLimit: { enabled: env.AUTH_RATE_LIMIT === "on", window: 10, max: 100 },
    advanced: {
      database: { generateId: () => generateId() },
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
