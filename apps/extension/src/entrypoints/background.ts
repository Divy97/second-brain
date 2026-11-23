import { storage } from "@wxt-dev/storage"

import { processQueue } from "@/lib/queue"
import {
  cachedCaptureSettings,
  getCaptureSettings,
} from "@/lib/capture-settings"
import { extractPageText } from "@/lib/extract-page-text"
import { decidePassiveCapture } from "@/lib/passive-capture"
import {
  capturePage,
  savePage,
  type SaveOptions,
  type SaveResult,
} from "@/lib/save-page"

const BADGE_VISIBLE_MS = 2500
const SETTINGS_REFRESH_ALARM = "refresh-capture-settings"
const VISITS_KEY = "local:passive-visits"
const RECENT_KEY = "local:passive-recent"

interface PendingVisit {
  url: string
  visitedAt: number
  incognito: boolean
}

export default defineBackground(() => {
  browser.alarms.create("process-queue", { periodInMinutes: 1 })
  browser.alarms.create(SETTINGS_REFRESH_ALARM, { periodInMinutes: 5 })
  void refreshSettings()

  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "process-queue") {
      await processQueue()
    } else if (alarm.name === SETTINGS_REFRESH_ALARM) {
      await refreshSettings()
    } else if (alarm.name.startsWith("passive:")) {
      const tabId = Number(alarm.name.slice("passive:".length))
      if (Number.isInteger(tabId)) await captureIfStillOpen(tabId)
    }
  })

  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.create({
      id: "save-page",
      title: "Save to Second Brain",
      contexts: ["page", "selection", "link"],
    })
  })

  browser.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId === 0) void observePage(details.tabId, details.url)
  })
  browser.webNavigation.onHistoryStateUpdated.addListener((details) => {
    if (details.frameId === 0) void observePage(details.tabId, details.url)
  })
  browser.tabs.onRemoved.addListener((tabId) => {
    void forgetVisit(tabId)
  })

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (isSettingsUpdatedRequest(message)) {
      void activeTab().then((tab) => {
        if (tab?.id && tab.url) void observePage(tab.id, tab.url)
      })
      return false
    }
    if (!isSavePageRequest(message)) return false
    void saveActiveTab().then(sendResponse)
    return true
  })

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== "save-page" || !tab?.id) return
    await saveWithBadge(
      {
        id: tab.id,
        url: info.linkUrl ?? tab.url,
        title: info.selectionText || tab.title,
      },
      { text: info.selectionText, linkOnly: Boolean(info.linkUrl) }
    )
  })

  browser.commands.onCommand.addListener(async (command) => {
    if (command !== "save-page") return
    const tab = await activeTab()
    if (tab) await saveWithBadge(tab)
  })
})

async function observePage(tabId: number, url: string) {
  const tab = await browser.tabs.get(tabId).catch(() => null)
  if (!tab) return
  const visitedAt = Date.now()
  const visits = await readStorage<Record<string, PendingVisit>>(VISITS_KEY, {})
  visits[String(tabId)] = {
    url,
    visitedAt,
    incognito: Boolean(tab.incognito),
  }
  await storage.setItem(VISITS_KEY, visits)
  const settings = await cachedCaptureSettings()
  if (!settings.passiveEnabled || settings.paused) {
    delete visits[String(tabId)]
    await storage.setItem(VISITS_KEY, visits)
    await refreshSettings()
    return
  }
  await browser.alarms.create(`passive:${tabId}`, {
    when: visitedAt + 15_000,
  })
}

async function captureIfStillOpen(tabId: number) {
  const visits = await readStorage<Record<string, PendingVisit>>(VISITS_KEY, {})
  const visit = visits[String(tabId)]
  if (!visit) return
  const tab = await browser.tabs.get(tabId).catch(() => null)
  if (!tab) {
    delete visits[String(tabId)]
    await storage.setItem(VISITS_KEY, visits)
    return
  }
  const settings = await cachedCaptureSettings()
  const text = await readPageText(tabId)
  const recent = await readStorage<Record<string, number>>(RECENT_KEY, {})
  const decision = decidePassiveCapture(
    { ...visit, lastCapturedAt: recent[visit.url], text },
    settings
  )
  if (decision.kind !== "capture") {
    delete visits[String(tabId)]
    await storage.setItem(VISITS_KEY, visits)
    return
  }
  const result = await capturePage(
    { id: tabId, url: visit.url, title: tab.title, incognito: tab.incognito },
    "passive",
    { handling: settings.passiveMode, text }
  )
  if (result.status === "saved" || result.status === "queued") {
    const now = Date.now()
    const nextRecent = Object.fromEntries(
      Object.entries(recent).filter(
        ([, capturedAt]) => now - capturedAt < 30 * 60_000
      )
    )
    nextRecent[visit.url] = now
    await storage.setItem(RECENT_KEY, nextRecent)
    delete visits[String(tabId)]
    await storage.setItem(VISITS_KEY, visits)
  } else {
    delete visits[String(tabId)]
    await storage.setItem(VISITS_KEY, visits)
  }
}

async function forgetVisit(tabId: number) {
  const visits = await readStorage<Record<string, PendingVisit>>(VISITS_KEY, {})
  if (!visits[String(tabId)]) return
  delete visits[String(tabId)]
  await storage.setItem(VISITS_KEY, visits)
  await browser.alarms.clear(`passive:${tabId}`)
}

async function readPageText(tabId: number): Promise<string | undefined> {
  try {
    const [injection] = await browser.scripting.executeScript({
      target: { tabId },
      func: extractPageText,
    })
    return typeof injection?.result === "string" ? injection.result : undefined
  } catch {
    return undefined
  }
}

async function refreshSettings() {
  const token = await storage.getItem<string>("local:token")
  if (!token) return
  await getCaptureSettings(token).catch(() => undefined)
}

async function readStorage<T>(key: `local:${string}`, fallback: T): Promise<T> {
  return (await storage.getItem<T>(key)) ?? fallback
}

function isSavePageRequest(message: unknown): boolean {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "save-page"
  )
}

function isSettingsUpdatedRequest(message: unknown): boolean {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "settings-updated"
  )
}

async function activeTab() {
  const [tab] = await browser.tabs.query({
    active: true,
    lastFocusedWindow: true,
  })
  if (!tab?.id) return null
  return { id: tab.id, url: tab.url, title: tab.title }
}

async function saveActiveTab(): Promise<SaveResult> {
  const tab = await activeTab()
  return tab ? savePage(tab) : { status: "unsupported" }
}

async function saveWithBadge(
  tab: NonNullable<Awaited<ReturnType<typeof activeTab>>>,
  options: SaveOptions = {}
) {
  const result = await savePage(tab, options)
  await showBadge(result)
  if (result.status === "not-connected") {
    await browser.action.openPopup().catch(() => undefined)
  }
}

async function showBadge(result: SaveResult) {
  const worked = result.status === "saved" || result.status === "queued"
  await browser.action.setBadgeBackgroundColor({
    color: worked ? "#533c51" : "#ac3f44",
  })
  await browser.action.setBadgeText({ text: worked ? "OK" : "!" })
  setTimeout(() => {
    void browser.action.setBadgeText({ text: "" })
  }, BADGE_VISIBLE_MS)
}
