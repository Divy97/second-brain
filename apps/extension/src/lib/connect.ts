import { storage } from "@wxt-dev/storage"

import { apiOrigin } from "./config"

export type ConnectResult =
  | { ok: true; email: string }
  | { ok: false; reason: "empty" | "malformed" | "invalid" | "unreachable" }

const DEVICE_KEY_SHAPE = /^sbx_\S+$/

export async function connectWithKey(pasted: string): Promise<ConnectResult> {
  const key = pasted.trim()
  if (!key) return { ok: false, reason: "empty" }
  if (!DEVICE_KEY_SHAPE.test(key)) return { ok: false, reason: "malformed" }

  let response: Response
  try {
    response = await fetch(`${apiOrigin}/ext/me`, {
      headers: { authorization: `Bearer ${key}` },
    })
  } catch {
    return { ok: false, reason: "unreachable" }
  }

  if (response.status === 401) return { ok: false, reason: "invalid" }
  if (!response.ok) return { ok: false, reason: "unreachable" }

  const { email } = (await response.json()) as { email: string }
  await storage.setItem("local:token", key)
  return { ok: true, email }
}

export async function disconnect(): Promise<void> {
  await storage.removeItem("local:token")
  await storage.removeItem("local:settings")
}
