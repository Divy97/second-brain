"use client"

import useSWRInfinite from "swr/infinite"

import { fetchJson } from "@/lib/api"
import { itemPagePath, type ItemPage, type ItemSummary } from "@/lib/items-api"

export function useItemFeed() {
  const feed = useSWRInfinite<ItemPage, Error>(
    (pageIndex, previous: ItemPage | null) => {
      if (pageIndex === 0) return itemPagePath(null)
      return previous?.nextCursor ? itemPagePath(previous.nextCursor) : null
    },
    fetchJson
  )

  const pages = feed.data ?? []
  const items = pages.flatMap((page) => page.items)
  const hasMore = Boolean(pages.at(-1)?.nextCursor)

  async function prepend(item: ItemSummary) {
    await feed.mutate(
      (current) => {
        const [first, ...rest] = current ?? []
        const withoutItem = (page: ItemPage): ItemPage => ({
          ...page,
          items: page.items.filter((entry) => entry.id !== item.id),
        })
        return [
          {
            nextCursor: first?.nextCursor ?? null,
            items: [item, ...(first ? withoutItem(first).items : [])],
          },
          ...rest.map(withoutItem),
        ]
      },
      { revalidate: false }
    )
  }

  return {
    items,
    hasMore,
    error: feed.error,
    isLoading: feed.isLoading,
    isLoadingMore: feed.isValidating && feed.size > pages.length,
    loadMore: () => feed.setSize(feed.size + 1),
    prepend,
  }
}
