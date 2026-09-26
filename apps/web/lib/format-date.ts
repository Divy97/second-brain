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
