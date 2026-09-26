"use client"

import { WarningCircleIcon } from "@phosphor-icons/react"

import { CaptureBox } from "@/components/capture-box"
import { ItemList } from "@/components/item-list"
import { KeyReminder } from "@/components/key-reminder"
import { useItemFeed } from "@/lib/use-item-feed"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"

export function HomeFeed() {
  const feed = useItemFeed()
  return (
    <div className="flex flex-col gap-8">
      <CaptureBox onSaved={feed.prepend} />
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
            <div key={row} className="h-16 w-full animate-pulse bg-muted" />
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
