import { createMiddleware } from "hono/factory"

import { apiError } from "../api-error.js"

import type { AppEnv } from "../app-env.js"
import type { ExtensionPermissions } from "./permissions.js"

export interface ExtensionEnv extends AppEnv {
  Variables: AppEnv["Variables"] & { deviceLabel: string }
}

function bearerToken(header: string | undefined): string | null {
  const match = /^Bearer (\S+)$/.exec(header ?? "")
  return match?.[1] ?? null
}

// Verifies the device token exactly once per request: the plugin counts every verification
// against the token's rate limit.
export const requireDevice = (permissions: ExtensionPermissions) =>
  createMiddleware<ExtensionEnv>(async (c, next) => {
    const token = bearerToken(c.req.header("authorization"))
    if (!token) {
      return apiError(c, 401, "unauthenticated", "Reconnect the extension.")
    }
    const verified = await c.var.auth.api.verifyApiKey({
      body: { key: token, permissions },
    })
    if (!verified.valid || !verified.key) {
      return apiError(c, 401, "unauthenticated", "Reconnect the extension.")
    }
    c.set("userId", verified.key.referenceId)
    c.set("deviceLabel", verified.key.name ?? "")
    await next()
  })
