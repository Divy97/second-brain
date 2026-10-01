import { storage } from "@wxt-dev/storage"

import { addToQueue } from "@/lib/queue"

type CaptureMessage = {
  type: "capture"
  trigger: "manual" | "passive"
}

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  async main() {
    browser.runtime.onMessage.addListener((message: CaptureMessage) => {
      if (message.type === "capture") {
        capturePage(message.trigger)
      }
    })
  },
})

async function capturePage(trigger: "manual" | "passive"): Promise<void> {
  const url = window.location.href

  if (shouldSkipUrl(url)) return

  const settings = await storage.getItem<{
    passiveEnabled: boolean
    passiveMode: "index" | "store"
    paused: boolean
    blocklist: string[]
  }>("local:settings")

  if (trigger === "passive") {
    if (!settings?.passiveEnabled || settings.paused) return

    const hostname = new URL(url).hostname
    if (settings.blocklist.includes(hostname)) return
    if (isDefaultBlockedSite(hostname)) return
  }

  const text = extractText()
  if (!text || text.length < 100) return

  const title = document.title || null

  await addToQueue({
    url,
    title: title ?? "",
    text,
    handling: trigger === "manual" ? "index" : (settings?.passiveMode ?? "store"),
    capturedAt: new Date().toISOString(),
  })

  if (trigger === "manual") {
    showConfirmation()
  }
}

function shouldSkipUrl(url: string): boolean {
  if (!url.startsWith("http://") && !url.startsWith("https://")) return true

  const hostname = new URL(url).hostname

  if (isVideoSite(hostname)) return true
  if (isPdfUrl(url)) return true

  return false
}

function isVideoSite(hostname: string): boolean {
  const videoSites = [
    "youtube.com",
    "www.youtube.com",
    "youtu.be",
    "instagram.com",
    "www.instagram.com",
    "vimeo.com",
    "www.vimeo.com",
    "twitch.tv",
    "www.twitch.tv",
  ]
  return videoSites.includes(hostname)
}

function isPdfUrl(url: string): boolean {
  return url.toLowerCase().endsWith(".pdf")
}

function isDefaultBlockedSite(hostname: string): boolean {
  const blockedPatterns = [
    /^(www\.)?.*bank.*\./,
    /^(www\.)?mail\./,
    /^(www\.)?.*\.google\.com$/,
    /^(www\.)?.*health.*\./,
    /^(www\.)?1password\./,
    /^(www\.)?lastpass\./,
    /^(www\.)?bitwarden\./,
  ]
  return blockedPatterns.some((pattern) => pattern.test(hostname))
}

function extractText(): string {
  const clone = document.body.cloneNode(true) as HTMLElement

  const removeSelectors = [
    "script",
    "style",
    "noscript",
    "iframe",
    "svg",
    "nav",
    "header",
    "footer",
    "aside",
    "[aria-hidden='true']",
    "[role='navigation']",
    "[role='banner']",
    "[role='contentinfo']",
    ".ad",
    ".advertisement",
    ".sidebar",
    ".comments",
  ]

  for (const selector of removeSelectors) {
    for (const element of clone.querySelectorAll(selector)) {
      element.remove()
    }
  }

  const main =
    clone.querySelector("main") ||
    clone.querySelector("article") ||
    clone.querySelector("[role='main']") ||
    clone

  return (main.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100_000)
}

function showConfirmation(): void {
  const toast = document.createElement("div")
  toast.textContent = "Saved to Second Brain"
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 20px;
    background: #7c3aed;
    color: white;
    border-radius: 8px;
    font-family: system-ui, sans-serif;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 999999;
    opacity: 0;
    transition: opacity 0.2s;
  `
  document.body.appendChild(toast)

  requestAnimationFrame(() => {
    toast.style.opacity = "1"
  })

  setTimeout(() => {
    toast.style.opacity = "0"
    setTimeout(() => toast.remove(), 200)
  }, 2000)
}
