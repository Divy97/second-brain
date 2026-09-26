import Link from "next/link"

import { StatusBadge } from "@/components/status-badge"
import { formatListDate } from "@/lib/format-date"
import { Button } from "@workspace/ui/components/button"

import type { ItemSummary } from "@/lib/api"

export function ItemList({
  items,
  hasMore,
  isLoadingMore,
  onLoadMore,
}: {
  items: ItemSummary[]
  hasMore: boolean
  isLoadingMore: boolean
  onLoadMore: () => void
}) {
  if (items.length === 0) {
    return (
      <p className="border-t pt-6 text-sm text-muted-foreground">
        Nothing saved yet. Your notes appear here, newest first.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col border-t">
        {items.map((item) => (
          <li key={item.id} className="border-b">
            <Link
              href={`/items/${item.id}`}
              className="group flex flex-col gap-2 py-4 outline-none focus-visible:bg-muted/50"
            >
              <span className="line-clamp-2 text-sm leading-relaxed break-words group-hover:underline group-hover:underline-offset-4">
                {item.title ?? item.excerpt}
              </span>
              <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <StatusBadge status={item.status} />
                {item.kind && <span className="capitalize">{item.kind}</span>}
                <time dateTime={item.capturedAt} className="ml-auto font-mono">
                  {formatListDate(item.capturedAt)}
                </time>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {hasMore && (
        <Button
          variant="outline"
          disabled={isLoadingMore}
          onClick={onLoadMore}
          className="self-start"
        >
          {isLoadingMore ? "Loading" : "Show older notes"}
        </Button>
      )}
    </div>
  )
}
