import { eq } from "drizzle-orm"

import { captureSettings } from "../schema.js"

import type { Database } from "../database.js"

export interface CaptureSettings {
  passiveEnabled: boolean
  passiveMode: "index" | "store"
  paused: boolean
  blocklist: string[]
}

export const defaultCaptureSettings: CaptureSettings = {
  passiveEnabled: false,
  passiveMode: "store",
  paused: false,
  blocklist: [],
}

export async function findCaptureSettings(
  db: Database,
  userId: string
): Promise<CaptureSettings> {
  const [row] = await db
    .select({
      passiveEnabled: captureSettings.passiveEnabled,
      passiveMode: captureSettings.passiveMode,
      paused: captureSettings.paused,
      blocklist: captureSettings.blocklist,
    })
    .from(captureSettings)
    .where(eq(captureSettings.userId, userId))
  return row ?? defaultCaptureSettings
}

export async function saveCaptureSettings(
  db: Database,
  userId: string,
  settings: CaptureSettings
): Promise<CaptureSettings> {
  await db
    .insert(captureSettings)
    .values({ userId, ...settings })
    .onConflictDoUpdate({ target: captureSettings.userId, set: settings })
  return settings
}
