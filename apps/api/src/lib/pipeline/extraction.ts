export interface Extraction {
  text: string
  quality: "full" | "partial"
  partialReason?: "allowance_used"
}

export function assemble(parts: (string | null | undefined)[]): string {
  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join("\n\n")
}
