"use client"

import {
  ArchiveBoxIcon,
  ArrowsClockwiseIcon,
  CheckIcon,
  TrashIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react"
import { useState } from "react"
import useSWR from "swr"

import { describeApiError } from "@/lib/describe-api-error"
import { formatRelativeDate } from "@/lib/format-date"
import {
  deleteStoredItem,
  fetchStoredItems,
  indexManyStoredItems,
  indexStoredItem,
  storedPath,
  type StoredItem,
  type StoredItemsPage,
} from "@/lib/stored-api"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

export function StoredList() {
  const { data, error, isLoading, mutate } = useSWR<StoredItemsPage, Error>(
    storedPath,
    () => fetchStoredItems()
  )
  const [processing, setProcessing] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [actionError, setActionError] = useState<string | null>(null)

  const items = data?.items ?? []
  const waiting = data?.waiting ?? 0

  async function handleIndex(item: StoredItem) {
    setProcessing(item.id)
    setActionError(null)
    try {
      await indexStoredItem(item.id)
      await mutate()
    } catch (err) {
      setActionError(
        err instanceof Error ? describeApiError(err) : "Failed to index"
      )
    } finally {
      setProcessing(null)
    }
  }

  async function handleDelete(item: StoredItem) {
    setProcessing(item.id)
    setActionError(null)
    try {
      await deleteStoredItem(item.id)
      await mutate()
    } catch (err) {
      setActionError(
        err instanceof Error ? describeApiError(err) : "Failed to delete"
      )
    } finally {
      setProcessing(null)
    }
  }

  async function handleIndexSelected() {
    if (selected.size === 0) return
    setProcessing("bulk")
    setActionError(null)
    try {
      await indexManyStoredItems([...selected])
      setSelected(new Set())
      await mutate()
    } catch (err) {
      setActionError(
        err instanceof Error ? describeApiError(err) : "Failed to index"
      )
    } finally {
      setProcessing(null)
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(items.map((i) => i.id)))
  }

  function selectNone() {
    setSelected(new Set())
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ArchiveBoxIcon size={28} className="text-primary" aria-hidden />
          <h1 className="font-heading text-2xl tracking-tight sm:text-3xl">
            Stored
          </h1>
          {waiting > 0 && (
            <span className="rounded-full bg-primary px-2.5 py-0.5 text-sm font-semibold text-primary-foreground">
              {waiting}
            </span>
          )}
        </div>
        {items.length > 0 && selected.size > 0 && (
          <Button
            onClick={() => {
              void handleIndexSelected()
            }}
            disabled={processing === "bulk"}
          >
            {processing === "bulk" ? (
              "Indexing…"
            ) : (
              <>
                <ArrowsClockwiseIcon aria-hidden />
                Index {selected.size} selected
              </>
            )}
          </Button>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        Pages saved by passive capture. Index them to make them searchable in
        Ask, or delete pages you don&apos;t want.
      </p>

      {isLoading && (
        <div
          role="status"
          aria-label="Loading stored items"
          aria-busy
          className="animate-pulse space-y-3"
        >
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-24 rounded-xl bg-muted" />
          ))}
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <WarningCircleIcon aria-hidden />
          <AlertDescription>{describeApiError(error)}</AlertDescription>
        </Alert>
      )}

      {actionError && (
        <Alert variant="destructive">
          <WarningCircleIcon aria-hidden />
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      {data && items.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No stored pages. Turn on passive capture in the browser extension to
            start recording.
          </CardContent>
        </Card>
      )}

      {data && items.length > 0 && (
        <>
          <div className="flex gap-2 text-sm">
            <button
              onClick={selectAll}
              className="text-primary hover:underline"
            >
              Select all
            </button>
            <span className="text-muted-foreground">·</span>
            <button
              onClick={selectNone}
              className="text-primary hover:underline"
            >
              Select none
            </button>
          </div>

          <div className="flex flex-col gap-3">
            {items.map((item) => (
              <Card key={item.id} size="sm">
                <CardHeader className="flex-row items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => {
                      toggleSelect(item.id)
                    }}
                    className="mt-1 size-4 accent-primary"
                    aria-label={`Select ${item.title ?? item.host}`}
                  />
                  <div className="min-w-0 flex-1">
                    <CardTitle className="truncate">
                      {item.title ?? item.host}
                    </CardTitle>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.host}
                      {item.capturedAt && (
                        <>
                          {" · "}
                          {formatRelativeDate(new Date(item.capturedAt))}
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => {
                        void handleIndex(item)
                      }}
                      disabled={processing === item.id}
                      aria-label={`Index ${item.title ?? item.host}`}
                    >
                      {processing === item.id ? (
                        "Indexing…"
                      ) : (
                        <>
                          <CheckIcon aria-hidden />
                          Index
                        </>
                      )}
                    </Button>
                    <Button
                      variant="destructive"
                      size="xs"
                      onClick={() => {
                        void handleDelete(item)
                      }}
                      disabled={processing === item.id}
                      aria-label={`Delete ${item.title ?? item.host}`}
                    >
                      <TrashIcon aria-hidden />
                    </Button>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
