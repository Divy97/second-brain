import { apiRequest } from "@/lib/api"

export type ItemStatus = "pending" | "processing" | "ready" | "failed"

export type ItemKind =
  | "quote"
  | "fact"
  | "thought"
  | "meeting"
  | "link"
  | "video"
  | "article"
  | "image"
  | "pdf"
  | "other"

export interface ItemSummary {
  id: string
  status: ItemStatus
  kind: ItemKind | null
  title: string | null
  excerpt: string
  capturedAt: string
}

export interface ItemDetail extends ItemSummary {
  rawText: string
  cleanText: string | null
  summary: string | null
  language: string | null
  tags: string[]
  failureReason: string | null
  error: string | null
  captures: string[]
}

export interface ItemPage {
  items: ItemSummary[]
  nextCursor: string | null
}

export const itemPagePath = (cursor: string | null) =>
  cursor ? `/items?cursor=${encodeURIComponent(cursor)}` : "/items"

export const itemPath = (id: string) => `/items/${id}`

export const saveItem = (text: string) =>
  apiRequest<ItemSummary>("/items", { method: "POST", json: { text } })

export const editItem = (id: string, text: string) =>
  apiRequest<ItemDetail>(itemPath(id), { method: "PATCH", json: { text } })

export const deleteItem = (id: string) =>
  apiRequest<null>(itemPath(id), { method: "DELETE" })
