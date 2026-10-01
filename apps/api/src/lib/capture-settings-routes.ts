import { Hono } from "hono"
import { z } from "zod"

import { findCaptureSettings, saveCaptureSettings } from "@workspace/db"

import { apiError } from "./api-error.js"

import type { AppEnv } from "./app-env.js"

const MAX_BLOCKLIST_ENTRIES = 500

const hostnameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(
    /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/,
    "Use a site name like example.com."
  )

const settingsBody = z.object({
  passiveEnabled: z.boolean(),
  passiveMode: z.enum(["index", "store"]),
  paused: z.boolean(),
  blocklist: z
    .array(hostnameSchema)
    .max(MAX_BLOCKLIST_ENTRIES)
    .transform((entries) => [...new Set(entries)]),
})

export const captureSettingsRoutes = new Hono<AppEnv>()

captureSettingsRoutes.get("/", async (c) => {
  return c.json(await findCaptureSettings(c.var.db, c.var.userId))
})

captureSettingsRoutes.put("/", async (c) => {
  const parsed = settingsBody.safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) {
    return apiError(
      c,
      400,
      "invalid_request",
      parsed.error.issues[0]?.message ?? "Invalid settings."
    )
  }
  return c.json(await saveCaptureSettings(c.var.db, c.var.userId, parsed.data))
})
