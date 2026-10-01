import { apiKey } from "@better-auth/api-key"
import { drizzleAdapter } from "@better-auth/drizzle-adapter"
import { betterAuth } from "better-auth"

import { generateId, schema, type Database } from "@workspace/db"

import { extensionPermissions } from "./extension/permissions.js"

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
    socialProviders: googleProvider(env),
    // Device tokens are minted only by the extension connect route, which sets their
    // permissions. The stock create route would let a user mint a token with any permissions.
    disabledPaths: ["/api-key/create"],
    plugins: [
      apiKey({
        defaultPrefix: "sbx_",
        enableSessionForAPIKeys: false,
        // The plugin defaults to 10 requests a day, which would break passive capture.
        rateLimit: { enabled: true, timeWindow: 60_000, maxRequests: 120 },
        permissions: { defaultPermissions: extensionPermissions },
      }),
    ],
    onAPIError: { errorURL: `${env.WEB_ORIGIN}/sign-in` },
    rateLimit: { enabled: env.AUTH_RATE_LIMIT === "on", window: 10, max: 100 },
    advanced: {
      database: { generateId: () => generateId() },
      ipAddress: { ipAddressHeaders: [env.AUTH_CLIENT_IP_HEADER] },
    },
  })
}

function googleProvider(env: Env) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return {}
  return {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
  }
}

export type Auth = ReturnType<typeof createAuth>
