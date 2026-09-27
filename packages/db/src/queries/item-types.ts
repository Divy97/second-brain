import type { items } from "../schema.js"

type ItemRow = typeof items.$inferSelect

export type ItemStatus = ItemRow["status"]
export type ItemKind = NonNullable<ItemRow["kind"]>

export interface ItemRef {
  userId: string
  itemId: string
}
