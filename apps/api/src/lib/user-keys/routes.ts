import { Hono, type Context } from "hono"
import { z } from "zod"

import { createOpenRouter, OpenRouterError } from "@workspace/ai"
import {
  deleteUserKey,
  findUserKey,
  saveUserKey,
  type UserKeyRef,
} from "@workspace/db"

import { apiError } from "../api-error.js"
import { encryptApiKey } from "./encryption.js"

import type { AppEnv } from "../app-env.js"

export type KeyStatus = { set: false } | { set: true; last4: string }

export interface KeySettings {
  openrouter: KeyStatus
}

export const openRouterKeyRef = (userId: string): UserKeyRef => ({
  userId,
  provider: "openrouter",
})

const saveKeyBody = z.object({ key: z.string().trim().min(1).max(512) })

async function keySettings(c: Context<AppEnv>): Promise<KeySettings> {
  const stored = await findUserKey(c.var.db, openRouterKeyRef(c.var.userId))
  return {
    openrouter: stored ? { set: true, last4: stored.last4 } : { set: false },
  }
}

export const userKeyRoutes = new Hono<AppEnv>()

userKeyRoutes.get("/", async (c) => c.json(await keySettings(c)))

userKeyRoutes.put("/openrouter", async (c) => {
  const parsed = saveKeyBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return apiError(c, 400, "invalid_request", "Paste an OpenRouter API key.")
  }
  const apiKey = parsed.data.key

  try {
    const verification = await createOpenRouter({ apiKey }).verifyKey()
    if (!verification.valid) {
      return apiError(
        c,
        422,
        "invalid_key",
        "OpenRouter rejected this key. Check it and try again."
      )
    }
  } catch (error) {
    if (error instanceof OpenRouterError) {
      return apiError(
        c,
        502,
        "upstream_unavailable",
        "OpenRouter could not be reached to check the key. Try again shortly."
      )
    }
    throw error
  }

  await saveUserKey(c.var.db, openRouterKeyRef(c.var.userId), {
    encryptedKey: await encryptApiKey(
      c.env.KEY_ENCRYPTION_SECRET,
      apiKey,
      c.var.userId
    ),
    last4: apiKey.slice(-4),
  })
  return c.json(await keySettings(c))
})

userKeyRoutes.delete("/openrouter", async (c) => {
  await deleteUserKey(c.var.db, openRouterKeyRef(c.var.userId))
  return c.json(await keySettings(c))
})
