import { request, type Session } from "./http.js"

export function mintDeviceKey(
  session: Session,
  label?: string
): Promise<Response> {
  return request("/devices", {
    method: "POST",
    session,
    json: label === undefined ? {} : { label },
  })
}

export async function connectDevice(
  session: Session,
  label?: string
): Promise<{ token: string }> {
  const response = await mintDeviceKey(session, label)
  if (response.status !== 201) {
    throw new Error(`minting a device key failed: ${response.status}`)
  }
  const { key } = await response.json<{ key: string }>()
  return { token: key }
}

export function asDevice(
  token: string,
  path: string,
  init: RequestInit & { json?: unknown } = {}
): Promise<Response> {
  const { headers, ...rest } = init
  const merged = new Headers(headers)
  merged.set("authorization", `Bearer ${token}`)
  return request(`/ext${path}`, { ...rest, headers: merged })
}
