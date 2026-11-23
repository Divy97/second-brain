import "@fontsource-variable/geist"
import "./style.css"

import { storage } from "@wxt-dev/storage"

import {
  getCaptureSettings,
  saveCaptureSettings,
  type CaptureSettings,
} from "@/lib/capture-settings"
import { webOrigin } from "@/lib/config"
import { DEFAULT_BLOCKLIST } from "@/lib/passive-capture"
import {
  checkKey,
  connectWithKey,
  disconnect,
  type ConnectFailureReason,
} from "@/lib/connect"
import type { SaveResult } from "@/lib/save-page"
import {
  hasPassivePermissions,
  requestPassivePermissions,
} from "@/lib/permissions"

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T

const connectErrors: Record<ConnectFailureReason, string> = {
  empty: "Paste your device key.",
  malformed: "That doesn't look like a device key. Keys start with sbx_.",
  invalid:
    "This key isn't valid or was disconnected. Create a new one in Settings.",
  unreachable: "Can't reach Second Brain. Check your connection and try again.",
}

const RECONNECT_NOTICE =
  "This device was disconnected. Create a new key in Settings to reconnect."

interface SaveMessage {
  title: string
  detail: string
  tone: "good" | "problem"
}

function describeSave(result: SaveResult): SaveMessage {
  switch (result.status) {
    case "saved":
      return {
        title: result.alreadySaved
          ? "Already in your Second Brain"
          : "Saved to Second Brain",
        detail: result.title,
        tone: "good",
      }
    case "queued":
      return {
        title: "Couldn't reach Second Brain",
        detail: "This page is kept here and will be sent shortly.",
        tone: "good",
      }
    case "unsupported":
      return {
        title: "This page can't be saved",
        detail: "Open a regular website and try again.",
        tone: "problem",
      }
    case "rejected":
      return {
        title: "This page wasn't saved",
        detail: result.message,
        tone: "problem",
      }
    case "not-connected":
      return {
        title: "This device was disconnected",
        detail: "Create a new key in Settings to reconnect.",
        tone: "problem",
      }
  }
}

function showResult(message: SaveMessage) {
  const result = $<HTMLDivElement>("save-result")
  $<HTMLParagraphElement>("save-result-title").textContent = message.title
  $<HTMLParagraphElement>("save-result-detail").textContent = message.detail
  result.dataset.tone = message.tone
  result.hidden = false
}

function showConnectScreen(notice?: string) {
  $<HTMLElement>("loading").hidden = true
  $<HTMLElement>("not-connected").hidden = false
  $<HTMLAnchorElement>("settings-link").href = `${webOrigin}/settings`

  if (notice) {
    const noticeEl = $<HTMLParagraphElement>("connect-notice")
    noticeEl.textContent = notice
    noticeEl.hidden = false
  }

  const input = $<HTMLInputElement>("key-input")
  const button = $<HTMLButtonElement>("connect-btn")
  const errorEl = $<HTMLParagraphElement>("connect-error")

  $<HTMLFormElement>("connect-form").addEventListener(
    "submit",
    async (event) => {
      event.preventDefault()
      errorEl.hidden = true
      input.removeAttribute("aria-invalid")
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
      input.setAttribute("aria-invalid", "true")
      button.disabled = false
      button.textContent = "Connect"
    }
  )
}

function showConnectedScreen(account: string) {
  $<HTMLElement>("loading").hidden = true
  $<HTMLElement>("connected").hidden = false
  $<HTMLSpanElement>("email-status").textContent = account
  void showQueueError()

  const saveButton = $<HTMLButtonElement>("save-btn")
  saveButton.addEventListener("click", async () => {
    saveButton.disabled = true
    saveButton.textContent = "Saving"
    $<HTMLDivElement>("save-result").hidden = true

    try {
      const result = (await browser.runtime.sendMessage({
        type: "save-page",
      })) as SaveResult
      if (result.status === "not-connected") {
        showConnectScreenAfterRevoke()
        return
      }
      showResult(describeSave(result))
    } catch {
      showResult({
        title: "Something went wrong",
        detail: "Try saving the page again.",
        tone: "problem",
      })
    }
    saveButton.disabled = false
    saveButton.textContent = "Save this page"
  })

  $<HTMLButtonElement>("disconnect-btn").addEventListener("click", async () => {
    await disconnect()
    window.location.reload()
  })

  void loadCaptureSettings()
}

async function showQueueError() {
  const error = await storage.getItem<{ title: string; message: string }>(
    "local:queue-error"
  )
  if (!error) return
  const element = $<HTMLDivElement>("queue-error")
  element.textContent = `${error.title}: ${error.message}`
  element.hidden = false
}

async function loadCaptureSettings() {
  const token = await storage.getItem<string>("local:token")
  if (!token) return
  let settings: CaptureSettings
  try {
    settings = await getCaptureSettings(token)
  } catch {
    return
  }

  const enabled = $<HTMLInputElement>("passive-enabled")
  const paused = $<HTMLInputElement>("passive-paused")
  const mode = $<HTMLSelectElement>("passive-mode")
  const disclosure = $<HTMLElement>("passive-disclosure")
  const disclosureSeen = await storage.getItem<boolean>(
    "local:passive-disclosure-seen"
  )
  disclosure.hidden = Boolean(disclosureSeen)
  $<HTMLButtonElement>("dismiss-disclosure").addEventListener(
    "click",
    async () => {
      await storage.setItem("local:passive-disclosure-seen", true)
      disclosure.hidden = true
    }
  )
  enabled.checked = settings.passiveEnabled
  paused.checked = settings.paused
  mode.value = settings.passiveMode
  setPassiveControls(settings.passiveEnabled)
  renderBlocklist(settings.blocklist)
  renderDefaultBlocklist()

  if (settings.passiveEnabled && !(await hasPassivePermissions())) {
    $<HTMLElement>("permission-warning").hidden = false
    $<HTMLButtonElement>("grant-permissions").addEventListener(
      "click",
      async () => {
        if (await requestPassivePermissions()) {
          $<HTMLElement>("permission-warning").hidden = true
          await browser.runtime.sendMessage({ type: "settings-updated" })
        }
      }
    )
  }

  enabled.addEventListener("change", async () => {
    if (enabled.checked) {
      const consented = window.confirm(
        "Second Brain will read text from pages you visit after 15 seconds and send it to your account. Continue?"
      )
      if (!consented || !(await requestPassivePermissions())) {
        enabled.checked = false
        return
      }
    }
    settings = await updateCaptureSettings(token, settings, {
      passiveEnabled: enabled.checked,
    })
    setPassiveControls(settings.passiveEnabled)
  })
  paused.addEventListener("change", async () => {
    settings = await updateCaptureSettings(token, settings, {
      paused: paused.checked,
    })
  })
  mode.addEventListener("change", async () => {
    settings = await updateCaptureSettings(token, settings, {
      passiveMode: mode.value as CaptureSettings["passiveMode"],
    })
  })
  $<HTMLFormElement>("blocklist-form").addEventListener(
    "submit",
    async (event) => {
      event.preventDefault()
      const input = $<HTMLInputElement>("blocklist-input")
      const hostname = input.value.trim().toLowerCase()
      if (!hostname || settings.blocklist.includes(hostname)) return
      settings = await updateCaptureSettings(token, settings, {
        blocklist: [...settings.blocklist, hostname],
      })
      input.value = ""
      renderBlocklist(settings.blocklist)
    }
  )
  $<HTMLDivElement>("blocklist-items").addEventListener(
    "click",
    async (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
        "button[data-host]"
      )
      if (!button) return
      settings = await updateCaptureSettings(token, settings, {
        blocklist: settings.blocklist.filter(
          (hostname) => hostname !== button.dataset.host
        ),
      })
      renderBlocklist(settings.blocklist)
    }
  )
}

function setPassiveControls(enabled: boolean) {
  $<HTMLElement>("passive-options").hidden = !enabled
}

function renderBlocklist(entries: string[]) {
  $<HTMLDivElement>("blocklist-items").replaceChildren(
    ...entries.map((hostname) => {
      const row = document.createElement("span")
      row.className = "blocklist-item"
      row.textContent = hostname
      const remove = document.createElement("button")
      remove.type = "button"
      remove.dataset.host = hostname
      remove.textContent = "×"
      remove.setAttribute("aria-label", `Remove ${hostname}`)
      row.append(remove)
      return row
    })
  )
}

function renderDefaultBlocklist() {
  $<HTMLDivElement>("default-blocklist-items").replaceChildren(
    ...DEFAULT_BLOCKLIST.map((hostname) => {
      const row = document.createElement("span")
      row.className = "blocklist-item"
      row.textContent = hostname
      return row
    })
  )
}

async function updateCaptureSettings(
  token: string,
  current: CaptureSettings,
  updates: Partial<CaptureSettings>
): Promise<CaptureSettings> {
  try {
    const saved = await saveCaptureSettings(token, { ...current, ...updates })
    await browser.runtime
      .sendMessage({ type: "settings-updated" })
      .catch(() => undefined)
    return saved
  } catch {
    return current
  }
}

function showConnectScreenAfterRevoke() {
  $<HTMLElement>("connected").hidden = true
  showConnectScreen(RECONNECT_NOTICE)
}

async function init() {
  const token = await storage.getItem<string>("local:token")
  if (!token) {
    showConnectScreen()
    return
  }

  const check = await checkKey(token)
  if (check.state === "invalid") {
    await disconnect()
    showConnectScreen(RECONNECT_NOTICE)
    return
  }
  showConnectedScreen(
    check.state === "valid" ? check.email : "Offline, saves will be sent later"
  )
}

void init()
