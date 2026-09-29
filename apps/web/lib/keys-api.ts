import { apiRequest } from "@/lib/api"

export type KeyStatus = { set: false } | { set: true; last4: string }

export type KeyProvider = "openrouter" | "transcript" | "reader"

export type KeySettings = Record<KeyProvider, KeyStatus>

export const keySettingsPath = "/keys"

export const fetchKeySettings = () => apiRequest<KeySettings>(keySettingsPath)

export const saveKey = (provider: KeyProvider, key: string) =>
  apiRequest<KeySettings>(`/keys/${provider}`, { method: "PUT", json: { key } })

export const removeKey = (provider: KeyProvider) =>
  apiRequest<KeySettings>(`/keys/${provider}`, { method: "DELETE" })
