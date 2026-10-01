import { Hono } from "hono"
import { z } from "zod"

import { countDeviceKeys } from "@workspace/db"

import { apiError } from "../api-error.js"
import { extensionPermissions } from "./permissions.js"

import type { AppEnv } from "../app-env.js"

const MAX_DEVICE_KEYS = 20
const DEFAULT_LABEL = "Browser extension"

const mintBody = z.object({
  label: z.string().trim().min(1).max(80).optional(),
})

export const deviceRoutes = new Hono<AppEnv>()

deviceRoutes.post("/", async (c) => {
  const parsed = mintBody.safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) {
    return apiError(
      c,
      400,
      "invalid_request",
      "Use a label of 1 to 80 characters."
    )
  }
  if ((await countDeviceKeys(c.var.db, c.var.userId)) >= MAX_DEVICE_KEYS) {
    return apiError(
      c,
      409,
      "device_limit",
      "You have reached the device limit. Disconnect one you no longer use."
    )
  }

  const created = await c.var.auth.api.createApiKey({
    body: {
      name: parsed.data.label ?? DEFAULT_LABEL,
      userId: c.var.userId,
      permissions: extensionPermissions,
    },
  })
  return c.json({ key: created.key, id: created.id, name: created.name }, 201)
})
