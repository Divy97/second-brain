import { Hono } from "hono"

import { findUserEmail } from "@workspace/db"

import { apiError } from "../api-error.js"
import { requireDevice, type ExtensionEnv } from "./require-device.js"

export const extensionRoutes = new Hono<ExtensionEnv>()

extensionRoutes.get(
  "/me",
  requireDevice({ connection: ["read"] }),
  async (c) => {
    const email = await findUserEmail(c.var.db, c.var.userId)
    if (!email)
      return apiError(c, 401, "unauthenticated", "Reconnect the extension.")
    return c.json({ email, deviceLabel: c.var.deviceLabel })
  }
)
