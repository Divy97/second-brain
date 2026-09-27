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
