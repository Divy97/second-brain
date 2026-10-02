import "@fontsource-variable/geist"
import "./style.css"

import { storage } from "@wxt-dev/storage"

import { webOrigin } from "@/lib/config"
import {
  checkKey,
  connectWithKey,
  disconnect,
  type ConnectFailureReason,
} from "@/lib/connect"
import type { SaveResult } from "@/lib/save-page"

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

  $<HTMLFormElement>("connect-form").addEventListener("submit", async (event) => {
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
  })
}

function showConnectedScreen(account: string) {
  $<HTMLElement>("loading").hidden = true
  $<HTMLElement>("connected").hidden = false
  $<HTMLSpanElement>("email-status").textContent = account

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
