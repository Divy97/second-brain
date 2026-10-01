import { Hono } from "hono"

import { findUserEmail } from "@workspace/db"

import { apiError } from "../api-error.js"
import { createCapture } from "./captures.js"
import { requireDevice, type ExtensionEnv } from "./require-device.js"
import { readSettings, writeSettings } from "./settings.js"
import {
  deleteOneStored,
  indexManyStored,
  indexOneStored,
  listStored,
} from "./stored.js"

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

extensionRoutes.post(
  "/captures",
  requireDevice({ captures: ["create"] }),
  createCapture
)

extensionRoutes.get(
  "/settings",
  requireDevice({ captureSettings: ["read"] }),
  readSettings
)

extensionRoutes.put(
  "/settings",
  requireDevice({ captureSettings: ["write"] }),
  writeSettings
)

extensionRoutes.get("/stored", requireDevice({ stored: ["list"] }), listStored)

extensionRoutes.post(
  "/stored/index",
  requireDevice({ stored: ["index"] }),
  indexManyStored
)

extensionRoutes.post(
  "/stored/:id/index",
  requireDevice({ stored: ["index"] }),
  indexOneStored
)

extensionRoutes.delete(
  "/stored/:id",
  requireDevice({ stored: ["delete"] }),
  deleteOneStored
)
