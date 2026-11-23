import { storage } from "@wxt-dev/storage"

import { apiOrigin } from "./config"

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

export async function getCaptureSettings(
  token: string
): Promise<CaptureSettings> {
  const response = await fetch(`${apiOrigin}/ext/settings`, {
    headers: { authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error("Could not load capture settings.")
  const settings = (await response.json()) as CaptureSettings
  await storage.setItem("local:settings", settings)
  return settings
}

export async function cachedCaptureSettings(): Promise<CaptureSettings> {
  return (
    (await storage.getItem<CaptureSettings>("local:settings")) ??
    defaultCaptureSettings
  )
}

export async function saveCaptureSettings(
  token: string,
  settings: CaptureSettings
): Promise<CaptureSettings> {
  const response = await fetch(`${apiOrigin}/ext/settings`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(settings),
  })
  if (response.status === 401) throw new Error("Reconnect the extension.")
  if (!response.ok) throw new Error("Could not save capture settings.")
  const saved = (await response.json()) as CaptureSettings
  await storage.setItem("local:settings", saved)
  return saved
}
