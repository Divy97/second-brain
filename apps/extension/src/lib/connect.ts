import { storage } from "@wxt-dev/storage"

import { apiOrigin } from "./config"

export type ConnectFailureReason =
  | "empty"
  | "malformed"
  | "invalid"
  | "unreachable"

export type ConnectResult =
  | { ok: true; email: string }
  | { ok: false; reason: ConnectFailureReason }

export type KeyCheck =
  | { state: "valid"; email: string }
  | { state: "invalid" }
  | { state: "unreachable" }

const DEVICE_KEY_SHAPE = /^sbx_\S+$/

export async function checkKey(key: string): Promise<KeyCheck> {
  let response: Response
  try {
    response = await fetch(`${apiOrigin}/ext/me`, {
      headers: { authorization: `Bearer ${key}` },
    })
  } catch {
    return { state: "unreachable" }
  }

  if (response.status === 401) return { state: "invalid" }
  if (!response.ok) return { state: "unreachable" }

  const { email } = (await response.json()) as { email: string }
  return { state: "valid", email }
}

export async function connectWithKey(pasted: string): Promise<ConnectResult> {
  const key = pasted.trim()
  if (!key) return { ok: false, reason: "empty" }
  if (!DEVICE_KEY_SHAPE.test(key)) return { ok: false, reason: "malformed" }

  const check = await checkKey(key)
  if (check.state !== "valid") return { ok: false, reason: check.state }

  await storage.setItem("local:token", key)
  return { ok: true, email: check.email }
}

export async function disconnect(): Promise<void> {
  await storage.removeItem("local:token")
  await storage.removeItem("local:settings")
}
