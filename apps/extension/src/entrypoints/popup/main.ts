import { storage } from "@wxt-dev/storage"

import { apiOrigin, webOrigin } from "@/lib/config"
import {
  connectWithKey,
  disconnect,
  type ConnectResult,
} from "@/lib/connect"

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T

const connectErrors: Record<
  Exclude<ConnectResult, { ok: true }>["reason"],
  string
> = {
  empty: "Paste your device key.",
  malformed: "That doesn't look like a device key. Keys start with sbx_.",
  invalid:
    "This key isn't valid or was disconnected. Create a new one in Settings.",
  unreachable: "Can't reach Second Brain. Check your connection and try again.",
}

function showConnectScreen(notice?: string) {
  $<HTMLDivElement>("not-connected").style.display = "block"
  $<HTMLAnchorElement>("settings-link").href = `${webOrigin}/settings`

  if (notice) {
    const noticeEl = $<HTMLParagraphElement>("connect-notice")
    noticeEl.textContent = notice
    noticeEl.hidden = false
  }

  const form = $<HTMLFormElement>("connect-form")
  const input = $<HTMLInputElement>("key-input")
  const button = $<HTMLButtonElement>("connect-btn")
  const errorEl = $<HTMLParagraphElement>("connect-error")

  form.addEventListener("submit", async (event) => {
    event.preventDefault()
    errorEl.hidden = true
    button.disabled = true
    button.textContent = "Checking key"

    const result = await connectWithKey(input.value)

    if (result.ok) {
      input.value = ""
      window.location.reload()
      return
    }
    errorEl.textContent = connectErrors[result.reason]
    errorEl.hidden = false
    button.disabled = false
    button.textContent = "Connect"
  })
}

async function init() {
  const token = await storage.getItem<string>("local:token")
  const loading = $<HTMLDivElement>("loading")
  const connected = $<HTMLDivElement>("connected")

  loading.style.display = "none"

  if (!token) {
    showConnectScreen()
    return
  }

  let response: Response
  try {
    response = await fetch(`${apiOrigin}/ext/me`, {
      headers: { authorization: `Bearer ${token}` },
    })
  } catch {
    showConnectedOffline(connected)
    return
  }

  if (response.status === 401) {
    await disconnect()
    showConnectScreen(
      "This device was disconnected. Create a new key in Settings to reconnect."
    )
    return
  }
  if (!response.ok) {
    showConnectedOffline(connected)
    return
  }

  const { email } = (await response.json()) as { email: string }
  connected.style.display = "block"
  $<HTMLParagraphElement>("email-status").textContent = email

  const settings = await fetchSettings(token)
  setupSettingsUI(settings, token)

  $<HTMLButtonElement>("capture-btn").addEventListener("click", async () => {
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    })
    if (tab?.id) {
      browser.tabs.sendMessage(tab.id, { type: "capture", trigger: "manual" })
      window.close()
    }
  })

  $<HTMLButtonElement>("disconnect-btn").addEventListener("click", async () => {
    await disconnect()
    window.location.reload()
  })
}

function showConnectedOffline(connected: HTMLDivElement) {
  connected.style.display = "block"
  $<HTMLParagraphElement>("email-status").textContent =
    "Connected. Second Brain can't be reached right now."
  $<HTMLButtonElement>("capture-btn").hidden = true
  $<HTMLButtonElement>("disconnect-btn").addEventListener("click", async () => {
    await disconnect()
    window.location.reload()
  })
}

interface Settings {
  passiveEnabled: boolean
  passiveMode: "index" | "store"
  paused: boolean
  blocklist: string[]
}

async function fetchSettings(token: string): Promise<Settings> {
  const cached = await storage.getItem<Settings>("local:settings")
  if (cached) return cached

  try {
    const response = await fetch(`${apiOrigin}/ext/settings`, {
      headers: { authorization: `Bearer ${token}` },
    })
    if (response.ok) {
      const settings = (await response.json()) as Settings
      await storage.setItem("local:settings", settings)
      return settings
    }
  } catch {
    // Use defaults
  }

  return {
    passiveEnabled: false,
    passiveMode: "store",
    paused: false,
    blocklist: [],
  }
}

function setupSettingsUI(settings: Settings, token: string) {
  const passiveToggle = $<HTMLInputElement>("passive-toggle")
  const pauseToggle = $<HTMLInputElement>("pause-toggle")
  const pauseRow = $<HTMLDivElement>("pause-row")

  passiveToggle.checked = settings.passiveEnabled
  pauseToggle.checked = settings.paused
  pauseRow.style.display = settings.passiveEnabled ? "flex" : "none"

  passiveToggle.addEventListener("change", async () => {
    const newSettings = { ...settings, passiveEnabled: passiveToggle.checked }
    await updateSettings(token, newSettings)
    pauseRow.style.display = passiveToggle.checked ? "flex" : "none"

    if (passiveToggle.checked) {
      const granted = await browser.permissions.request({
        origins: ["<all_urls>"],
      })
      if (!granted) {
        passiveToggle.checked = false
        await updateSettings(token, { ...settings, passiveEnabled: false })
        pauseRow.style.display = "none"
      }
    }
  })

  pauseToggle.addEventListener("change", async () => {
    await updateSettings(token, { ...settings, paused: pauseToggle.checked })
  })
}

async function updateSettings(token: string, settings: Settings) {
  await storage.setItem("local:settings", settings)
  try {
    await fetch(`${apiOrigin}/ext/settings`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(settings),
    })
  } catch {
    // Settings will sync on next load
  }
}

init()
