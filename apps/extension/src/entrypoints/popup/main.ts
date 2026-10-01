import { storage } from "@wxt-dev/storage"

import { apiOrigin, webOrigin } from "@/lib/config"
import { startConnect } from "@/lib/connect"

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T

async function init() {
  const token = await storage.getItem<string>("local:token")
  const loading = $<HTMLDivElement>("loading")
  const notConnected = $<HTMLDivElement>("not-connected")
  const connected = $<HTMLDivElement>("connected")

  loading.style.display = "none"

  if (!token) {
    notConnected.style.display = "block"
    $<HTMLButtonElement>("connect-btn").addEventListener("click", () => {
      startConnect()
      window.close()
    })
    return
  }

  try {
    const response = await fetch(`${apiOrigin}/ext/me`, {
      headers: { authorization: `Bearer ${token}` },
    })

    if (!response.ok) {
      if (response.status === 401) {
        await storage.removeItem("local:token")
        notConnected.style.display = "block"
        $<HTMLButtonElement>("connect-btn").addEventListener("click", () => {
          startConnect()
          window.close()
        })
        return
      }
      throw new Error("Failed to fetch")
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
      await storage.removeItem("local:token")
      await storage.removeItem("local:settings")
      window.location.reload()
    })
  } catch {
    notConnected.style.display = "block"
    $<HTMLButtonElement>("connect-btn").addEventListener("click", () => {
      browser.tabs.create({ url: `${webOrigin}/sign-in` })
      window.close()
    })
  }
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
