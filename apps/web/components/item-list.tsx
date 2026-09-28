import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"

import { StatusBadge } from "@/components/status-badge"
import { formatListDate } from "@/lib/format-date"
import { Button } from "@workspace/ui/components/button"

import type { ItemSummary } from "@/lib/items-api"

const colors = ["bg-card", "bg-butter", "bg-mint", "bg-lilac", "bg-accent"]

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
  if (items.length === 0)
    return (
      <div className="rounded-[2rem] border border-dashed border-primary/30 bg-card px-8 py-16 text-center">
        <span aria-hidden className="text-5xl text-coral-ink">
          ✳
        </span>
        <h3 className="mt-4 font-heading text-3xl">
          Your first thought goes here.
        </h3>
        <p className="mt-2 text-muted-foreground">
          Write anything above. We&apos;ll keep it safe.
        </p>
      </div>
    )
  return (
    <div className="flex flex-col gap-8">
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, index) => (
          <li key={item.id}>
            <Link
              href={`/items/${item.id}`}
              className={`group flex h-full min-h-56 flex-col justify-between rounded-[1.75rem] p-6 transition-transform hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-ring ${colors[index % colors.length]}`}
            >
              <div className="flex items-start justify-between gap-3">
                <StatusBadge status={item.status} />
                <ArrowUpRightIcon
                  size={20}
                  className="shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  aria-hidden
                />
              </div>
              <h3 className="my-6 line-clamp-4 font-heading text-2xl leading-tight break-words">
                {item.title ?? item.excerpt}
              </h3>
              <div className="flex items-center justify-between gap-2 border-t border-foreground/15 pt-4 text-xs font-medium text-muted-foreground">
                <span className="capitalize">{item.kind ?? "Note"}</span>
                <time dateTime={item.capturedAt}>
                  {formatListDate(item.capturedAt)}
                </time>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {hasMore && (
        <Button
          variant="outline"
          disabled={isLoadingMore}
          onClick={onLoadMore}
          className="self-center"
        >
          {isLoadingMore ? "Loading" : "Show older notes"}
        </Button>
      )}
    </div>
  )
}
