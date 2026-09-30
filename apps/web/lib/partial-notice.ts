import type { ItemDetail } from "@/lib/items-api"

export function partialNotice(
  item: Pick<ItemDetail, "captureQuality" | "partialReason">
): string | null {
  if (item.captureQuality !== "partial") return null
  if (item.partialReason !== "allowance_used") return null
  return "Saved, but the transcript or article text was not captured because today's limit is used. Reprocess tomorrow to complete it. It is still searchable by its link, title and note."
}
