import type { CapturedItem, ItemKind, ItemStatus } from "./item-types.js"

export const EXCERPT_LENGTH = 200

export interface CaptureRow extends Record<string, unknown> {
  id: string
  type: "text" | "voice" | "image" | "pdf" | "url"
  status: ItemStatus
  capture_quality: "full" | "partial" | null
  kind: ItemKind | null
  title: string | null
  raw_text: string
  captured_at: Date
  created: boolean
  run: number
}

export function toCapturedItem(row: CaptureRow): CapturedItem {
  return {
    created: row.created,
    run: row.run,
    item: {
      id: row.id,
      type: row.type,
      status: row.status,
      captureQuality: row.capture_quality,
      kind: row.kind,
      title: row.title,
      excerpt: row.raw_text.slice(0, EXCERPT_LENGTH),
      rawText: row.raw_text,
      capturedAt: new Date(row.captured_at),
    },
  }
}
