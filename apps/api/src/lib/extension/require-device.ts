import { createMiddleware } from "hono/factory"

import { apiError } from "../api-error.js"

import type { ExtensionEnv } from "./extension-env.js"
import type { PermissionRequirement } from "./permissions.js"
import type { Context } from "hono"

export const reconnectRequired = (c: Context) =>
  apiError(c, 401, "unauthenticated", "Reconnect the extension.")

function bearerToken(header: string | undefined): string | null {
  const match = /^Bearer (\S+)$/.exec(header ?? "")
  return match?.[1] ?? null
}

// Verifies the device token exactly once per request: the plugin counts every verification
// against the token's rate limit.
export const requireDevice = (requirement: PermissionRequirement) =>
  createMiddleware<ExtensionEnv>(async (c, next) => {
    const token = bearerToken(c.req.header("authorization"))
    if (!token) return reconnectRequired(c)

    const verified = await c.var.auth.api.verifyApiKey({
      body: { key: token, permissions: requirement },
    })
    if (verified.error?.code === "RATE_LIMITED") {
      return apiError(c, 429, "rate_limited", "Too many requests. Slow down.")
    }
    if (!verified.valid || !verified.key) return reconnectRequired(c)

    c.set("userId", verified.key.referenceId)
    c.set("deviceLabel", verified.key.name ?? "")
    await next()
  })
