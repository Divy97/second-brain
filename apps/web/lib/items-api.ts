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
  failureReason: FailureReason | null
  error: string | null
  entities: { name: string; type: string }[]
  captures: string[]
}

export type FailureReason =
  | "missing_key"
  | "invalid_key"
  | "insufficient_credits"
  | "model_error"
  | "processing_error"

export const isSettling = (status: ItemStatus) =>
  status === "pending" || status === "processing"

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

export const retryItem = (id: string) =>
  apiRequest<ItemDetail>(`${itemPath(id)}/retry`, { method: "POST" })

export const reprocessItem = (id: string) =>
  apiRequest<ItemDetail>(`${itemPath(id)}/reprocess`, { method: "POST" })
