import { formatDateTime } from "@/lib/format-date"

export function CaptureHistory({ captures }: { captures: string[] }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="captures-heading">
      <h2 id="captures-heading" className="text-sm font-medium">
        {captures.length === 1
          ? "Saved once"
          : `Saved ${captures.length} times`}
      </h2>
      <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
        {captures.map((capturedAt) => (
          <li key={capturedAt}>
            <time dateTime={capturedAt}>{formatDateTime(capturedAt)}</time>
          </li>
        ))}
      </ul>
    </section>
  )
}
