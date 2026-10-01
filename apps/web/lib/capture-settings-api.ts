import { apiRequest } from "@/lib/api"

export interface CaptureSettings {
  passiveEnabled: boolean
  passiveMode: "index" | "store"
  paused: boolean
  blocklist: string[]
}

export const captureSettingsPath = "/capture-settings"

export const fetchCaptureSettings = () =>
  apiRequest<CaptureSettings>(captureSettingsPath)

export const saveCaptureSettings = (settings: CaptureSettings) =>
  apiRequest<CaptureSettings>(captureSettingsPath, {
    method: "PUT",
    json: settings,
  })
