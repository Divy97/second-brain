import { storage } from "@wxt-dev/storage"

import { processQueue } from "@/lib/queue"

export default defineBackground(() => {
  browser.alarms.create("process-queue", { periodInMinutes: 1 })

  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "process-queue") {
      await processQueue()
    }
  })

  browser.contextMenus.create({
    id: "save-page",
    title: "Save to Second Brain",
    contexts: ["page", "selection", "link"],
  })

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "save-page" && tab?.id) {
      const token = await storage.getItem<string>("local:token")
      if (!token) {
        browser.tabs.create({ url: browser.runtime.getURL("/popup.html") })
        return
      }
      browser.tabs.sendMessage(tab.id, { type: "capture", trigger: "manual" })
    }
  })

  browser.commands.onCommand.addListener(async (command) => {
    if (command === "save-page") {
      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      })
      if (!tab?.id) return
      const token = await storage.getItem<string>("local:token")
      if (!token) {
        browser.tabs.create({ url: browser.runtime.getURL("/popup.html") })
        return
      }
      browser.tabs.sendMessage(tab.id, { type: "capture", trigger: "manual" })
    }
  })
})
