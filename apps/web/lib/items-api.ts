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
  type: "text" | "voice" | "image" | "pdf" | "url"
  status: ItemStatus
  captureQuality: "full" | "partial" | null
  kind: ItemKind | null
  title: string | null
  excerpt: string
  capturedAt: string
}

export interface ItemDetail extends ItemSummary {
  fileName: string | null
  mimeType: string | null
  fileSize: number | null
  sourceUrl: string | null
  sourceNote: string | null
  rawText: string
  cleanText: string | null
  summary: string | null
  language: string | null
  tags: string[]
  failureReason: FailureReason | null
  partialReason: "allowance_used" | null
  error: string | null
  updatedAt: string
  entities: { name: string; type: string }[]
  facts: { id: string; text: string }[]
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

const STALLED_AFTER_MS = 10 * 60 * 1000

export const isStalled = (item: ItemDetail, now = Date.now()) =>
  item.status === "processing" &&
  now - new Date(item.updatedAt).getTime() > STALLED_AFTER_MS

export interface ItemPage {
  items: ItemSummary[]
  nextCursor: string | null
}

export const itemPagePath = (cursor: string | null) =>
  cursor ? `/items?cursor=${encodeURIComponent(cursor)}` : "/items"

export const itemPath = (id: string) => `/items/${id}`

export const saveItem = (text: string) =>
  apiRequest<ItemSummary>("/items", { method: "POST", json: { text } })

export const saveAudio = (file: File) => {
  const body = new FormData()
  body.set("file", file)
  return apiRequest<ItemSummary>("/items/audio", { method: "POST", body })
}

export const saveImage = (file: File) => {
  const body = new FormData()
  body.set("file", file)
  return apiRequest<ItemSummary>("/items/image", { method: "POST", body })
}

export const savePdf = (file: File) => {
  const body = new FormData()
  body.set("file", file)
  return apiRequest<ItemSummary>("/items/pdf", { method: "POST", body })
}

export const saveUrl = (url: string, note?: string) =>
  apiRequest<ItemSummary>("/items/url", {
    method: "POST",
    json: { url, note },
  })

export const editItem = (id: string, text: string) =>
  apiRequest<ItemDetail>(itemPath(id), { method: "PATCH", json: { text } })

export const deleteItem = (id: string) =>
  apiRequest<null>(itemPath(id), { method: "DELETE" })

export const retryItem = (id: string) =>
  apiRequest<ItemDetail>(`${itemPath(id)}/retry`, { method: "POST" })

export const reprocessItem = (id: string) =>
  apiRequest<ItemDetail>(`${itemPath(id)}/reprocess`, { method: "POST" })

export const forgetFact = (itemId: string, factId: string) =>
  apiRequest<null>(`${itemPath(itemId)}/facts/${factId}`, {
    method: "DELETE",
  })
