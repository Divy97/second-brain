import Link from "next/link"

import { formatDateTime } from "@/lib/format-date"

import type { SourceCard } from "@/lib/threads-api"

export function SourceCards({ sources }: { sources: SourceCard[] }) {
  if (sources.length === 0) return null
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Sources">
      {sources.map((source) => (
        <li key={source.id}>
          <Link
            href={`/items/${source.id}`}
            className="flex h-full flex-col gap-2 rounded-2xl bg-butter p-5 transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="line-clamp-2 text-sm break-words">
              {source.title ?? "Untitled note"}
            </span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              {source.kind && <span className="capitalize">{source.kind}</span>}
              <time dateTime={source.capturedAt} className="ml-auto">
                {formatDateTime(source.capturedAt)}
              </time>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
