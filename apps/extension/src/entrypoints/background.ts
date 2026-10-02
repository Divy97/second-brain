import { processQueue } from "@/lib/queue"
import { savePage, type SaveResult } from "@/lib/save-page"

const BADGE_VISIBLE_MS = 2500

export default defineBackground(() => {
  browser.alarms.create("process-queue", { periodInMinutes: 1 })

  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "process-queue") {
      await processQueue()
    }
  })

  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.create({
      id: "save-page",
      title: "Save to Second Brain",
      contexts: ["page", "selection", "link"],
    })
  })

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isSavePageRequest(message)) return false
    void saveActiveTab().then(sendResponse)
    return true
  })

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== "save-page" || !tab?.id) return
    await saveWithBadge({ id: tab.id, url: tab.url, title: tab.title })
  })

  browser.commands.onCommand.addListener(async (command) => {
    if (command !== "save-page") return
    const tab = await activeTab()
    if (tab) await saveWithBadge(tab)
  })
})

function isSavePageRequest(message: unknown): boolean {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "save-page"
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
  tab: NonNullable<Awaited<ReturnType<typeof activeTab>>>
) {
  const result = await savePage(tab)
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
