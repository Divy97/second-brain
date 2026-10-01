import { storage } from "@wxt-dev/storage"

import { apiOrigin } from "./config"

export interface QueuedCapture {
  id: string
  url: string
  title: string
  text: string
  handling: "index" | "store"
  capturedAt: string
  attempts: number
  nextRetry: number
}

const MAX_ATTEMPTS = 5
const BACKOFF_BASE_MS = 30_000

export async function addToQueue(capture: Omit<QueuedCapture, "id" | "attempts" | "nextRetry">): Promise<void> {
  const queue = await getQueue()
  const item: QueuedCapture = {
    ...capture,
    id: crypto.randomUUID(),
    attempts: 0,
    nextRetry: Date.now(),
  }
  queue.push(item)
  await setQueue(queue)
}

export async function processQueue(): Promise<void> {
  const token = await storage.getItem<string>("local:token")
  if (!token) return

  const queue = await getQueue()
  const now = Date.now()
  const ready = queue.filter((item) => item.nextRetry <= now)
  const waiting = queue.filter((item) => item.nextRetry > now)

  if (ready.length === 0) return

  const results = await Promise.allSettled(
    ready.map((item) => sendCapture(token, item))
  )

  const failed: QueuedCapture[] = []

  for (let i = 0; i < results.length; i++) {
    const result = results[i]!
    const item = ready[i]!

    if (result.status === "rejected") {
      if (item.attempts + 1 < MAX_ATTEMPTS) {
        failed.push({
          ...item,
          attempts: item.attempts + 1,
          nextRetry: now + backoffMs(item.attempts + 1),
        })
      } else {
        console.error(`Giving up on capture after ${MAX_ATTEMPTS} attempts:`, item.url)
      }
    }
  }

  await setQueue([...waiting, ...failed])
}

async function sendCapture(token: string, item: QueuedCapture): Promise<void> {
  const response = await fetch(`${apiOrigin}/ext/captures`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      url: item.url,
      title: item.title,
      text: item.text,
      handling: item.handling,
      capturedAt: item.capturedAt,
    }),
  })

  if (!response.ok) {
    if (response.status === 401) {
      await storage.removeItem("local:token")
    }
    throw new Error(`Capture failed: ${response.status}`)
  }
}

function backoffMs(attempt: number): number {
  return BACKOFF_BASE_MS * Math.pow(2, attempt - 1)
}

async function getQueue(): Promise<QueuedCapture[]> {
  return (await storage.getItem<QueuedCapture[]>("local:queue")) ?? []
}

async function setQueue(queue: QueuedCapture[]): Promise<void> {
  await storage.setItem("local:queue", queue)
}

export async function getQueueStats(): Promise<{ pending: number; failed: number }> {
  const queue = await getQueue()
  const now = Date.now()
  return {
    pending: queue.filter((item) => item.attempts < MAX_ATTEMPTS).length,
    failed: queue.filter((item) => item.attempts >= MAX_ATTEMPTS).length,
  }
}
