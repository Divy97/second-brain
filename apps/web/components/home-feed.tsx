"use client"

import { ArrowUpRightIcon, WarningCircleIcon } from "@phosphor-icons/react"
import Link from "next/link"

import { AudioCapture } from "@/components/audio-capture"
import { CaptureBox } from "@/components/capture-box"
import { ImageCapture } from "@/components/image-capture"
import { ItemList } from "@/components/item-list"
import { KeyReminder } from "@/components/key-reminder"
import { PdfCapture } from "@/components/pdf-capture"
import { useItemFeed } from "@/lib/use-item-feed"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"

export function HomeFeed() {
  const feed = useItemFeed()
  return (
    <div className="flex flex-col gap-10">
      <section className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:gap-10">
        <div>
          <p className="mb-4 w-fit rounded-full bg-butter px-3 py-1.5 text-xs font-bold tracking-wide uppercase">
            Your space to think
          </p>
          <h1 className="max-w-xl font-heading text-3xl leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            What&apos;s on your <em className="text-coral-ink">mind?</em>
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
            Save the thought before it slips away. You can make sense of it
            later.
          </p>
          <Link
            href="/threads"
            className="mt-5 inline-flex items-center gap-2 font-semibold hover:underline"
          >
            Or ask your notes <ArrowUpRightIcon aria-hidden />
          </Link>
        </div>
        <div className="rounded-2xl bg-lilac p-3 sm:p-5">
          <CaptureBox onSaved={feed.prepend} />
          <div className="mt-3">
            <AudioCapture onSaved={feed.prepend} />
          </div>
          <div className="mt-3">
            <ImageCapture onSaved={feed.prepend} />
          </div>
          <div className="mt-3">
            <PdfCapture onSaved={feed.prepend} />
          </div>
        </div>
      </section>
      <KeyReminder />
      <section aria-labelledby="notes-heading">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-bold tracking-wide text-muted-foreground uppercase">
              Your collection
            </p>
            <h2
              id="notes-heading"
              className="font-heading text-3xl tracking-tight sm:text-4xl"
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
