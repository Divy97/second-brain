const dateTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
})

const time = new Intl.DateTimeFormat(undefined, { timeStyle: "short" })

const dayMonth = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
})

function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString()
}

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso))
}

export function formatListDate(iso: string, now = new Date()): string {
  const date = new Date(iso)
  if (isSameDay(date, now)) return time.format(date)
  return date.getFullYear() === now.getFullYear()
    ? dayMonth.format(date)
    : dateTime.format(date)
}

const relativeTime = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })

export function formatRelativeDate(date: Date, now = new Date()): string {
  const diffMs = date.getTime() - now.getTime()
  const diffSec = Math.round(diffMs / 1000)
  const diffMin = Math.round(diffSec / 60)
  const diffHour = Math.round(diffMin / 60)
  const diffDay = Math.round(diffHour / 24)

  if (Math.abs(diffSec) < 60) return relativeTime.format(diffSec, "second")
  if (Math.abs(diffMin) < 60) return relativeTime.format(diffMin, "minute")
  if (Math.abs(diffHour) < 24) return relativeTime.format(diffHour, "hour")
  if (Math.abs(diffDay) < 30) return relativeTime.format(diffDay, "day")
  return dayMonth.format(date)
}
