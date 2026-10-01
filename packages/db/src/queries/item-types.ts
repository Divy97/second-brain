import type { items } from "../schema.js"

type ItemRow = typeof items.$inferSelect

export type ItemStatus = ItemRow["status"]
export type ItemKind = NonNullable<ItemRow["kind"]>

export type EntityType =
  "person" | "product" | "book" | "place" | "organization" | "other"

export interface ItemEntity {
  name: string
  type: EntityType
}

export interface ItemRef {
  userId: string
  itemId: string
}

export interface ItemSummary {
  id: string
  type: "text" | "voice" | "image" | "pdf" | "url"
  status: ItemStatus
  captureQuality: "full" | "partial" | null
  kind: ItemKind | null
  title: string | null
  excerpt: string
  capturedAt: Date
}

export interface CapturedItem {
  item: ItemSummary & { rawText: string }
  created: boolean
  run: number
}
