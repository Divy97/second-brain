import type { ItemSummary } from "@/lib/items-api"

const fallbackTitles: Record<ItemSummary["type"], string> = {
  text: "Untitled note",
  voice: "Voice note",
  image: "Photo",
  pdf: "PDF",
  url: "Link",
}

const typeLabels: Record<ItemSummary["type"], string> = {
  text: "Note",
  voice: "Voice",
  image: "Photo",
  pdf: "PDF",
  url: "Link",
}

export function itemFallbackTitle(item: Pick<ItemSummary, "excerpt" | "type">) {
  if (item.excerpt) return item.excerpt
  return fallbackTitles[item.type]
}

export function itemTypeLabel(type: ItemSummary["type"]) {
  return typeLabels[type]
}
