import { Hono } from "hono"

import { findUserEmail } from "@workspace/db"

import { createCapture } from "./captures.js"
import { needs } from "./permissions.js"
import { reconnectRequired, requireDevice } from "./require-device.js"
import { getCaptureSettings, putCaptureSettings } from "./settings.js"
import {
  indexManyStoredItems,
  indexStoredItem,
  listStoredItems,
  removeStoredItem,
} from "./stored.js"

import type { ExtensionEnv } from "./extension-env.js"

export const extensionRoutes = new Hono<ExtensionEnv>()

extensionRoutes.get(
  "/me",
  requireDevice(needs("connection", "read")),
  async (c) => {
    const email = await findUserEmail(c.var.db, c.var.userId)
    if (!email) return reconnectRequired(c)
    return c.json({ email, deviceLabel: c.var.deviceLabel })
  }
)

extensionRoutes.post(
  "/captures",
  requireDevice(needs("captures", "create")),
  createCapture
)

extensionRoutes.get(
  "/settings",
  requireDevice(needs("captureSettings", "read")),
  getCaptureSettings
)

extensionRoutes.put(
  "/settings",
  requireDevice(needs("captureSettings", "write")),
  putCaptureSettings
)

extensionRoutes.get(
  "/stored",
  requireDevice(needs("stored", "list")),
  listStoredItems
)

extensionRoutes.post(
  "/stored/index",
  requireDevice(needs("stored", "index")),
  indexManyStoredItems
)

extensionRoutes.post(
  "/stored/:id/index",
  requireDevice(needs("stored", "index")),
  indexStoredItem
)

extensionRoutes.delete(
  "/stored/:id",
  requireDevice(needs("stored", "delete")),
  removeStoredItem
)
