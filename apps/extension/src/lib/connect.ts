import { storage } from "@wxt-dev/storage"

import { apiOrigin, webOrigin } from "./config"

function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const hash = await crypto.subtle.digest("SHA-256", data)
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

function getDeviceLabel(): string {
  const ua = navigator.userAgent
  const browser = ua.includes("Firefox")
    ? "Firefox"
    : ua.includes("Edg")
      ? "Edge"
      : "Chrome"
  const os = ua.includes("Mac")
    ? "Mac"
    : ua.includes("Win")
      ? "Windows"
      : ua.includes("Linux")
        ? "Linux"
        : "Browser"
  return `${browser} on ${os}`
}

export async function startConnect(): Promise<void> {
  const verifier = generateCodeVerifier()
  const challenge = await generateCodeChallenge(verifier)
  const redirectUri = browser.identity.getRedirectURL("callback")

  await storage.setItem("local:pendingVerifier", verifier)

  const params = new URLSearchParams({
    label: getDeviceLabel(),
    code_challenge: challenge,
    redirect_uri: redirectUri,
  })

  const authUrl = `${webOrigin}/extension/authorize?${params}`

  try {
    const responseUrl = await browser.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true,
    })

    if (!responseUrl) {
      await storage.removeItem("local:pendingVerifier")
      return
    }

    const url = new URL(responseUrl)
    const code = url.searchParams.get("code")

    if (!code) {
      await storage.removeItem("local:pendingVerifier")
      return
    }

    await exchangeCode(code, verifier)
  } catch (error) {
    console.error("Connect failed:", error)
  } finally {
    await storage.removeItem("local:pendingVerifier")
  }
}

async function exchangeCode(code: string, verifier: string): Promise<void> {
  const response = await fetch(`${apiOrigin}/extension/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, codeVerifier: verifier }),
  })

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.status}`)
  }

  const { token } = (await response.json()) as { token: string }
  await storage.setItem("local:token", token)
}
