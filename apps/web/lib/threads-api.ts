import { apiRequest } from "@/lib/api"

import type { ItemKind } from "@/lib/items-api"

export interface SourceCard {
  id: string
  title: string | null
  kind: ItemKind | null
  capturedAt: string
}

export interface ThreadMessage {
  id: string
  role: "user" | "assistant"
  text: string
  createdAt: string
  sources: SourceCard[]
}

export interface ThreadSummary {
  id: string
  title: string
  createdAt: string
}

export interface ThreadDetail extends ThreadSummary {
  messages: ThreadMessage[]
}

export const threadsPath = "/threads"

export const threadPath = (id: string) => `/threads/${id}`

export const startThread = () =>
  apiRequest<ThreadSummary>(threadsPath, { method: "POST", json: {} })

export const askInThread = (id: string, question: string) =>
  apiRequest<ThreadMessage>(`${threadPath(id)}/messages`, {
    method: "POST",
    json: {
      question,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  })
