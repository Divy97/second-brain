import { storage } from "@wxt-dev/storage"

import { postCapture, type CapturePayload } from "./capture-api"

export interface QueuedCapture extends CapturePayload {
  id: string
  attempts: number
  nextRetry: number
}

const MAX_ATTEMPTS = 5
const BACKOFF_BASE_MS = 30_000

export async function addToQueue(capture: CapturePayload): Promise<void> {
  const queue = await getQueue()
  queue.push({
    ...capture,
    id: crypto.randomUUID(),
    attempts: 0,
    nextRetry: Date.now(),
  })
  await setQueue(queue)
}

export async function processQueue(): Promise<void> {
  const token = await storage.getItem<string>("local:token")
  if (!token) return

  const now = Date.now()
  const queue = await getQueue()
  const waiting = queue.filter((item) => item.nextRetry > now)
  const ready = queue.filter((item) => item.nextRetry <= now)
  if (ready.length === 0) return

  const kept: QueuedCapture[] = []
  for (const item of ready) {
    const outcome = await postCapture(token, toPayload(item))
    if (outcome.kind === "unauthorized") {
      await storage.removeItem("local:token")
      kept.push(item)
    } else if (outcome.kind === "retry") {
      if (item.attempts + 1 < MAX_ATTEMPTS) {
        kept.push({
          ...item,
          attempts: item.attempts + 1,
          nextRetry: now + backoffMs(item.attempts + 1),
        })
      }
    }
  }

  await setQueue([...waiting, ...kept])
}

function toPayload(item: QueuedCapture): CapturePayload {
  return {
    url: item.url,
    title: item.title,
    text: item.text,
    trigger: item.trigger,
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
