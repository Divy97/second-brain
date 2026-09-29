import { Hono, type Context } from "hono"
import { z } from "zod"

import {
  deleteUserKey,
  findUserKey,
  saveUserKey,
  type KeyProvider,
  type UserKeyRef,
} from "@workspace/db"

import { apiError } from "../api-error.js"
import { encryptApiKey } from "./encryption.js"
import {
  KeyProviderUnavailable,
  keyProviderNames,
  keyProviders,
} from "./providers.js"

import type { AppEnv } from "../app-env.js"

export type KeyStatus = { set: false } | { set: true; last4: string }

export type KeySettings = Record<KeyProvider, KeyStatus>

export const keyRef = (userId: string, provider: KeyProvider): UserKeyRef => ({
  userId,
  provider,
})

export const openRouterKeyRef = (userId: string): UserKeyRef =>
  keyRef(userId, "openrouter")

const saveKeyBody = z.object({ key: z.string().trim().min(1).max(512) })

async function keySettings(c: Context<AppEnv>): Promise<KeySettings> {
  const stored = await Promise.all(
    keyProviderNames.map((provider) =>
      findUserKey(c.var.db, keyRef(c.var.userId, provider))
    )
  )
  return Object.fromEntries(
    keyProviderNames.map((provider, index) => {
      const key = stored[index]
      return [provider, key ? { set: true, last4: key.last4 } : { set: false }]
    })
  ) as KeySettings
}

export const userKeyRoutes = new Hono<AppEnv>()

userKeyRoutes.get("/", async (c) => c.json(await keySettings(c)))

for (const provider of keyProviderNames) {
  const { label, verify } = keyProviders[provider]

  userKeyRoutes.put(`/${provider}`, async (c) => {
    const parsed = saveKeyBody.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) {
      return apiError(c, 400, "invalid_request", `Paste a ${label} API key.`)
    }
    const apiKey = parsed.data.key

    try {
      const verification = await verify(apiKey)
      if (!verification.valid) {
        return apiError(
          c,
          422,
          "invalid_key",
          `${label} rejected this key. Check it and try again.`
        )
      }
    } catch (error) {
      if (error instanceof KeyProviderUnavailable) {
        return apiError(
          c,
          502,
          "upstream_unavailable",
          `${label} could not be reached to check the key. Try again shortly.`
        )
      }
      throw error
    }

    await saveUserKey(c.var.db, keyRef(c.var.userId, provider), {
      encryptedKey: await encryptApiKey(
        c.env.KEY_ENCRYPTION_SECRET,
        apiKey,
        c.var.userId
      ),
      last4: apiKey.slice(-4),
    })
    return c.json(await keySettings(c))
  })

  userKeyRoutes.delete(`/${provider}`, async (c) => {
    await deleteUserKey(c.var.db, keyRef(c.var.userId, provider))
    return c.json(await keySettings(c))
  })
}
