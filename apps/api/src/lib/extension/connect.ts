import { Hono } from "hono"
import { z } from "zod"

import { consumeAuthorizationCode, saveAuthorizationCode } from "@workspace/db"

import { apiError } from "../api-error.js"
import { requireUser } from "../request-context.js"
import {
  hashAuthorizationCode,
  matchesChallenge,
  newAuthorizationCode,
} from "./crypto.js"
import { extensionPermissions } from "./permissions.js"

import type { AppEnv } from "../app-env.js"

const CODE_LIFETIME_MS = 5 * 60 * 1000

const authorizeBody = z.object({
  label: z.string().trim().min(1).max(80),
  codeChallenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  redirectUri: z.url(),
})

const tokenBody = z.object({
  code: z.string().min(1),
  codeVerifier: z.string().min(43).max(128),
})

function allowedRedirectUris(env: Env): string[] {
  return env.EXTENSION_REDIRECT_URIS.split(",")
    .map((uri) => uri.trim())
    .filter(Boolean)
}

export const extensionConnectRoutes = new Hono<AppEnv>()

extensionConnectRoutes.post("/authorize", requireUser, async (c) => {
  const parsed = authorizeBody.safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) {
    return apiError(c, 400, "invalid_request", "Invalid connection request.")
  }
  const { label, codeChallenge, redirectUri } = parsed.data
  if (!allowedRedirectUris(c.env).includes(redirectUri)) {
    return apiError(c, 400, "invalid_request", "Unknown extension.")
  }

  const code = newAuthorizationCode()
  await saveAuthorizationCode(c.var.db, {
    codeHash: await hashAuthorizationCode(code),
    expiresAt: new Date(Date.now() + CODE_LIFETIME_MS),
    userId: c.var.userId,
    codeChallenge,
    redirectUri,
    label,
  })

  const redirectTo = new URL(redirectUri)
  redirectTo.searchParams.set("code", code)
  return c.json({ redirectTo: redirectTo.toString() })
})

extensionConnectRoutes.post("/token", async (c) => {
  const parsed = tokenBody.safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) {
    return apiError(c, 400, "invalid_request", "Invalid token request.")
  }
  const { code, codeVerifier } = parsed.data

  // Consuming first means a wrong verifier burns the code, so it cannot be guessed at.
  const grant = await consumeAuthorizationCode(
    c.var.db,
    await hashAuthorizationCode(code)
  )
  if (!grant || !(await matchesChallenge(codeVerifier, grant.codeChallenge))) {
    return apiError(c, 400, "invalid_grant", "This code is invalid or expired.")
  }

  const created = await c.var.auth.api.createApiKey({
    body: {
      name: grant.label,
      userId: grant.userId,
      permissions: extensionPermissions,
    },
  })
  return c.json({ token: created.key })
})
