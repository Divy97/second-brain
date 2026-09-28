"use client"

import { ArrowUpRightIcon, WarningCircleIcon } from "@phosphor-icons/react"
import Link from "next/link"

import { CaptureBox } from "@/components/capture-box"
import { ItemList } from "@/components/item-list"
import { KeyReminder } from "@/components/key-reminder"
import { useItemFeed } from "@/lib/use-item-feed"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"

export function HomeFeed() {
  const feed = useItemFeed()
  return (
    <div className="flex flex-col gap-14">
      <section className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:gap-16">
        <div>
          <p className="mb-5 w-fit rotate-[-3deg] rounded-full bg-butter px-4 py-2 text-xs font-bold tracking-widest uppercase">
            Your space to think
          </p>
          <h1 className="max-w-xl font-heading text-5xl leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
            What&apos;s on your <em className="text-coral-ink">mind?</em>
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground">
            Save the thought before it slips away. You can make sense of it
            later.
          </p>
          <Link
            href="/threads"
            className="mt-7 inline-flex items-center gap-2 font-semibold hover:underline"
          >
            Or ask your notes <ArrowUpRightIcon aria-hidden />
          </Link>
        </div>
        <div className="rounded-[2.25rem] bg-lilac p-4 shadow-[0_20px_60px_#533c5110] sm:p-6">
          <CaptureBox onSaved={feed.prepend} />
        </div>
      </section>
      <KeyReminder />
      <section aria-labelledby="notes-heading">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-bold tracking-[0.15em] text-muted-foreground uppercase">
              Your collection
            </p>
            <h2
              id="notes-heading"
              className="font-heading text-4xl tracking-tight sm:text-5xl"
            >
              The things you kept.
            </h2>
          </div>
          <span className="rounded-full bg-butter px-4 py-2 text-sm font-semibold">
            Newest first
          </span>
        </div>
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
            className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
            aria-busy
            aria-label="Loading notes"
          >
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                className="h-52 animate-pulse rounded-[1.75rem] bg-muted"
              />
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
      </section>
    </div>
  )
}
