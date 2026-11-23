import { storage } from "@wxt-dev/storage"

import { postCapture, type CapturePayload } from "./capture-api"
import { disconnect } from "./connect"
import { extractPageText } from "./extract-page-text"
import { addToQueue } from "./queue"

export interface SavableTab {
  id: number
  url?: string
  title?: string
  incognito?: boolean
}

export type SaveResult =
  | { status: "saved"; title: string; alreadySaved: boolean }
  | { status: "queued" }
  | { status: "unsupported" }
  | { status: "rejected"; message: string }
  | { status: "not-connected" }

export interface SaveOptions {
  text?: string
  linkOnly?: boolean
  handling?: "index" | "store"
}

export async function savePage(
  tab: SavableTab,
  options: SaveOptions = {}
): Promise<SaveResult> {
  return capturePage(tab, "manual", options)
}

export async function capturePage(
  tab: SavableTab,
  trigger: "manual" | "passive",
  options: SaveOptions = {}
): Promise<SaveResult> {
  if (!tab.url || !/^https?:\/\//i.test(tab.url)) {
    return { status: "unsupported" }
  }

  const token = await storage.getItem<string>("local:token")
  if (!token) return { status: "not-connected" }

  const payload: CapturePayload = {
    url: tab.url,
    title: tab.title || tab.url,
    text:
      options.text ??
      (options.linkOnly ? undefined : await readPageText(tab.id)),
    trigger,
    capturedAt: new Date().toISOString(),
    handling: options.handling ?? (trigger === "manual" ? "index" : "store"),
    linkOnly: options.linkOnly,
  }

  const outcome = await postCapture(token, payload)
  switch (outcome.kind) {
    case "accepted":
      return {
        status: "saved",
        title: payload.title,
        alreadySaved: !outcome.created,
      }
    case "unauthorized":
      await disconnect()
      return { status: "not-connected" }
    case "rejected":
      return { status: "rejected", message: outcome.message }
    case "retry":
      await addToQueue(payload)
      return { status: "queued" }
  }
}

// A page the extension cannot script (a PDF viewer, a store page) still has a link worth saving.
async function readPageText(tabId: number): Promise<string | undefined> {
  try {
    const [injection] = await browser.scripting.executeScript({
      target: { tabId },
      func: extractPageText,
    })
    const text: unknown = injection?.result
    return typeof text === "string" && text ? text : undefined
  } catch {
    return undefined
  }
}
