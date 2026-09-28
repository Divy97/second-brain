"use client"

import { ChatCircleTextIcon, WarningCircleIcon } from "@phosphor-icons/react"
import Link from "next/link"

import { CaptureBox } from "@/components/capture-box"
import { ItemList } from "@/components/item-list"
import { KeyReminder } from "@/components/key-reminder"
import { useItemFeed } from "@/lib/use-item-feed"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Skeleton } from "@workspace/ui/components/skeleton"

export function HomeFeed() {
  const feed = useItemFeed()
  return (
    <div className="flex flex-col gap-8">
      <CaptureBox onSaved={feed.prepend} />
      <Link
        href="/threads"
        className="flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChatCircleTextIcon aria-hidden />
        Ask your notes
      </Link>
      <KeyReminder />
      {feed.error && (
        <Alert variant="destructive">
          <WarningCircleIcon aria-hidden />
          <AlertDescription>
            Your notes could not be loaded. Refresh to try again.
          </AlertDescription>
        </Alert>
      )}
      {feed.isLoading ? (
        <div
          className="flex flex-col gap-3"
          aria-busy
          aria-label="Loading notes"
        >
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        !feed.error && (
          <ItemList
            items={feed.items}
            hasMore={feed.hasMore}
            isLoadingMore={feed.isLoadingMore}
            onLoadMore={() => {
              void feed.loadMore()
            }}
          />
        )
      )}
    </div>
  )
}
