import type { PartialReason } from "@workspace/db"

export interface Extraction {
  text: string
  quality: "full" | "partial"
  partialReason?: PartialReason
}

export function assemble(parts: (string | null | undefined)[]): string {
  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join("\n\n")
}
