"use client"

import { ArrowLeftIcon, WarningCircleIcon } from "@phosphor-icons/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import useSWR from "swr"

import { CaptureHistory } from "@/components/capture-history"
import { ItemActions } from "@/components/item-actions"
import { ItemEditor } from "@/components/item-editor"
import { ItemFailure } from "@/components/item-failure"
import { ItemInsights } from "@/components/item-insights"
import { StatusBadge } from "@/components/status-badge"
import { ApiError, fetchJson } from "@/lib/api"
import { describeApiError, emptyNoteMessage } from "@/lib/describe-api-error"
import {
  deleteItem,
  editItem,
  isSettling,
  isStalled,
  itemPath,
  reprocessItem,
  retryItem,
  type ItemDetail,
} from "@/lib/items-api"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"

const SETTLING_POLL_MS = 3000

const backLink = (
  <Link
    href="/"
    className="flex w-fit items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
  >
    <ArrowLeftIcon aria-hidden />
    All notes
  </Link>
)

export function ItemView({ id }: { id: string }) {
  const router = useRouter()
  const {
    data: item,
    error,
    isLoading,
    mutate,
  } = useSWR<ItemDetail, Error>(itemPath(id), fetchJson, {
    refreshInterval: (latest) =>
      latest && isSettling(latest.status) ? SETTLING_POLL_MS : 0,
  })
  const [editing, setEditing] = useState(false)
  const [pending, setPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function runAction(action: () => Promise<void>) {
    setPending(true)
    setActionError(null)
    try {
      await action()
    } catch (caught) {
      setActionError(describeApiError(caught))
    } finally {
      setPending(false)
    }
  }

  function saveEdit(text: string) {
    if (!text.trim()) {
      setActionError(emptyNoteMessage)
      return
    }
    void runAction(async () => {
      await mutate(await editItem(id, text), { revalidate: false })
      setEditing(false)
    })
  }

  function requeue(action: (itemId: string) => Promise<ItemDetail>) {
    void runAction(async () => {
      await mutate(await action(id), { revalidate: false })
    })
  }

  function remove() {
    void runAction(async () => {
      await deleteItem(id)
      router.replace("/")
    })
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6" aria-busy aria-label="Loading note">
        {backLink}
        <div className="h-6 w-48 animate-pulse bg-muted" />
        <div className="h-32 w-full animate-pulse bg-muted" />
      </div>
    )
  }

  if (error || !item) {
    const notFound = error instanceof ApiError && error.status === 404
    return (
      <div className="flex flex-col gap-6">
        {backLink}
        <h1 className="text-2xl font-medium tracking-tight">
          {notFound ? "Note not found" : "Note could not be loaded"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {notFound
            ? "It may have been deleted, or the link is wrong."
            : describeApiError(error)}
        </p>
      </div>
    )
  }

  return (
    <article className="flex flex-col gap-8">
      {backLink}
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-medium tracking-tight break-words">
          {item.title ?? "Untitled note"}
        </h1>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <StatusBadge status={item.status} />
          {item.kind && <span className="capitalize">{item.kind}</span>}
        </div>
      </header>

      {isStalled(item) && (
        <Alert>
          <WarningCircleIcon aria-hidden />
          <AlertDescription className="flex flex-col gap-3">
            <p>
              Processing is taking much longer than it should. Your note is
              saved; retry to start processing again.
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              className="self-start"
              onClick={() => {
                requeue(retryItem)
              }}
            >
              {pending ? "Retrying" : "Retry"}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {item.status === "failed" && (
        <ItemFailure
          reason={item.failureReason}
          error={item.error}
          pending={pending}
          onRetry={() => {
            requeue(retryItem)
          }}
        />
      )}

      <section
        className="flex flex-col gap-3"
        aria-labelledby="original-heading"
      >
        <h2 id="original-heading" className="text-sm font-medium">
          Original
        </h2>
        {editing ? (
          <ItemEditor
            initialText={item.rawText}
            pending={pending}
            onSave={saveEdit}
            onCancel={() => {
              setEditing(false)
              setActionError(null)
            }}
          />
        ) : (
          <p className="text-base leading-relaxed break-words whitespace-pre-wrap md:text-sm">
            {item.rawText}
          </p>
        )}
      </section>

      {actionError && (
        <Alert variant="destructive">
          <WarningCircleIcon aria-hidden />
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      {!editing && <ItemInsights item={item} />}

      <CaptureHistory captures={item.captures} />

      {!editing && (
        <ItemActions
          pending={pending}
          canReprocess={item.status === "ready"}
          onEdit={() => {
            setEditing(true)
          }}
          onReprocess={() => {
            requeue(reprocessItem)
          }}
          onDelete={remove}
        />
      )}
    </article>
  )
}
