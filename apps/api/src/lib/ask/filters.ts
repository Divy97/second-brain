import type { Rewrite } from "./rewrite.js"
import type { TimeWindow } from "@workspace/db"

const DAY_MS = 24 * 60 * 60 * 1000
const calendarDate = /^(\d{4})-(\d{2})-(\d{2})$/

function zoneOffsetMs(instant: number, timezone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value])
  )
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  )
  return asUtc - instant
}

// Midnight at the start of a calendar date, as the user's clock reads it.
function startOfDay(date: string, timezone: string): Date | null {
  const match = calendarDate.exec(date)
  if (!match) return null
  const utcMidnight = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  )
  if (Number.isNaN(utcMidnight)) return null
  return new Date(utcMidnight - zoneOffsetMs(utcMidnight, timezone))
}

// The model only classifies the window; the arithmetic happens here, against the request
// time in the user's timezone. Unusable or inverted windows are dropped, not applied.
export function timeWindow(
  filters: Rewrite["filters"],
  now: Date,
  timezone: string
): TimeWindow {
  if (filters.lastDays !== null && filters.lastDays > 0) {
    return {
      from: new Date(now.getTime() - filters.lastDays * DAY_MS),
      to: null,
    }
  }
  const from = filters.from ? startOfDay(filters.from, timezone) : null
  const lastDay = filters.to ? startOfDay(filters.to, timezone) : null
  const to = lastDay ? new Date(lastDay.getTime() + DAY_MS) : null
  if (from && to && to <= from) return { from: null, to: null }
  return { from, to }
}
