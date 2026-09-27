import Link from "next/link"

import { formatListDate } from "@/lib/format-date"

import type { SourceCard } from "@/lib/threads-api"

export function SourceCards({ sources }: { sources: SourceCard[] }) {
  if (sources.length === 0) return null
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Sources">
      {sources.map((source) => (
        <li key={source.id}>
          <Link
            href={`/items/${source.id}`}
            className="flex h-full flex-col gap-1 border p-3 transition-colors outline-none hover:bg-muted/50 focus-visible:ring-1 focus-visible:ring-ring"
          >
            <span className="line-clamp-2 text-sm break-words">
              {source.title ?? "Untitled note"}
            </span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              {source.kind && <span className="capitalize">{source.kind}</span>}
              <time dateTime={source.capturedAt} className="ml-auto font-mono">
                {formatListDate(source.capturedAt)}
              </time>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
