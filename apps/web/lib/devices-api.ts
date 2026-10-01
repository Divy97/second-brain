import { apiRequest } from "@/lib/api"

export interface Device {
  id: string
  name: string | null
  start: string | null
  createdAt: string
  lastRequest: string | null
  enabled: boolean
}

export interface DevicesResponse {
  apiKeys: Device[]
}

export interface MintedDevice {
  key: string
  id: string
  name: string
}

export const devicesPath = "/auth/api-key/list"

export const fetchDevices = () => apiRequest<DevicesResponse>(devicesPath)

export const revokeDevice = (keyId: string) =>
  apiRequest<null>("/auth/api-key/delete", {
    method: "POST",
    json: { keyId },
  })

export const mintDevice = (label: string) =>
  apiRequest<MintedDevice>("/devices", {
    method: "POST",
    json: label ? { label } : {},
  })
