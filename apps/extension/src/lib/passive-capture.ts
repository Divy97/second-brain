import type { CaptureSettings } from "./capture-settings"

export const PASSIVE_DWELL_MS = 15_000
export const PASSIVE_COOLDOWN_MS = 30 * 60_000

export const DEFAULT_BLOCKLIST = [
  "accounts.google.com",
  "bankofamerica.com",
  "chase.com",
  "gmail.com",
  "healthcare.gov",
  "lastpass.com",
  "mail.google.com",
  "paypal.com",
  "proton.me",
  "usesecondbrain.vercel.app",
]

export interface PassiveVisit {
  url: string
  incognito: boolean
  visitedAt: number
  text?: string
  lastCapturedAt?: number
}

export type PassiveDecision =
  | { kind: "capture"; trigger: "passive" }
  | { kind: "wait"; until: number }
  | { kind: "skip"; reason: string }

export function decidePassiveCapture(
  visit: PassiveVisit,
  settings: CaptureSettings,
  now = Date.now()
): PassiveDecision {
  if (!settings.passiveEnabled || settings.paused) {
    return { kind: "skip", reason: "disabled" }
  }
  if (visit.incognito) return { kind: "skip", reason: "incognito" }

  const url = parseWebUrl(visit.url)
  if (!url) return { kind: "skip", reason: "unsupported-url" }
  if (isLinkOnlyPage(url)) return { kind: "skip", reason: "link-only" }
  if (
    isBlockedHostname(url.hostname, [
      ...DEFAULT_BLOCKLIST,
      ...settings.blocklist,
    ])
  ) {
    return { kind: "skip", reason: "blocked" }
  }

  const dwellUntil = visit.visitedAt + PASSIVE_DWELL_MS
  if (now < dwellUntil) return { kind: "wait", until: dwellUntil }
  if (
    visit.lastCapturedAt !== undefined &&
    now - visit.lastCapturedAt < PASSIVE_COOLDOWN_MS
  ) {
    return { kind: "skip", reason: "recently-captured" }
  }
  if (!visit.text?.trim()) return { kind: "skip", reason: "no-readable-text" }
  return { kind: "capture", trigger: "passive" }
}

export function isBlockedHostname(
  hostname: string,
  entries: string[]
): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "")
  return entries.some((entry) => {
    const normalized = entry.toLowerCase().replace(/^\.+|\.+$/g, "")
    return host === normalized || host.endsWith(`.${normalized}`)
  })
}

function parseWebUrl(value: string): URL | null {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:" ? url : null
  } catch {
    return null
  }
}

function isLinkOnlyPage(url: URL): boolean {
  const host = url.hostname.toLowerCase()
  return (
    host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    host === "youtu.be" ||
    host === "instagram.com" ||
    host.endsWith(".instagram.com") ||
    url.pathname.toLowerCase().endsWith(".pdf")
  )
}
