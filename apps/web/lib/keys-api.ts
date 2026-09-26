import { apiRequest } from "@/lib/api"

export type KeyStatus = { set: false } | { set: true; last4: string }

export interface KeySettings {
  openrouter: KeyStatus
}

export const keySettingsPath = "/keys"

export const fetchKeySettings = () => apiRequest<KeySettings>(keySettingsPath)

export const saveOpenRouterKey = (key: string) =>
  apiRequest<KeySettings>("/keys/openrouter", { method: "PUT", json: { key } })

export const removeOpenRouterKey = () =>
  apiRequest<KeySettings>("/keys/openrouter", { method: "DELETE" })
