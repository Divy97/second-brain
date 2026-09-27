import type { Rewrite } from "./rewrite.js"
import type { TimeWindow } from "@workspace/db"

function parseInstant(value: string | null): Date | null {
  if (!value) return null
  const instant = new Date(value)
  return Number.isNaN(instant.getTime()) ? null : instant
}

// The model's window is advice: unparseable bounds are dropped, and an inverted window
// (to before from) is discarded rather than matching nothing.
export function timeWindow(filters: Rewrite["filters"]): TimeWindow {
  const from = parseInstant(filters.from)
  const to = parseInstant(filters.to)
  if (from && to && to <= from) return { from: null, to: null }
  return { from, to }
}
