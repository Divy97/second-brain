import { request, type Session } from "./http.js"

export const chromeRedirectUri = "https://abcdefghijklmnop.chromiumapp.org/cb"

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "")
}

export async function pkcePair(): Promise<{
  verifier: string
  challenge: string
}> {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)))
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  )
  return { verifier, challenge: base64Url(new Uint8Array(digest)) }
}

export async function approveDevice(
  session: Session,
  input: { label?: string; challenge: string; redirectUri?: string }
): Promise<Response> {
  return request("/extension/authorize", {
    method: "POST",
    session,
    json: {
      label: input.label ?? "Chrome on MacBook",
      codeChallenge: input.challenge,
      redirectUri: input.redirectUri ?? chromeRedirectUri,
    },
  })
}

export function exchangeCode(
  code: string,
  verifier: string
): Promise<Response> {
  return request("/extension/token", {
    method: "POST",
    json: { code, codeVerifier: verifier },
  })
}

export function codeFrom(redirectTo: string): string {
  const code = new URL(redirectTo).searchParams.get("code")
  if (!code) throw new Error("redirect carried no code")
  return code
}

export async function connectDevice(
  session: Session,
  label?: string
): Promise<{ token: string }> {
  const { verifier, challenge } = await pkcePair()
  const approval = await approveDevice(session, { label, challenge })
  if (approval.status !== 200) {
    throw new Error(`approval failed: ${approval.status}`)
  }
  const { redirectTo } = await approval.json<{ redirectTo: string }>()
  const exchange = await exchangeCode(codeFrom(redirectTo), verifier)
  if (exchange.status !== 200) {
    throw new Error(`token exchange failed: ${exchange.status}`)
  }
  return exchange.json<{ token: string }>()
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
