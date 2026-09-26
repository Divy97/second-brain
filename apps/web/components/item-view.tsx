"use client"

import { ArrowLeftIcon, WarningCircleIcon } from "@phosphor-icons/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, type SubmitEvent } from "react"
import useSWR from "swr"

import { StatusBadge } from "@/components/status-badge"
import {
  ApiError,
  deleteItem,
  editItem,
  fetchJson,
  itemPath,
  type ItemDetail,
} from "@/lib/api"
import { formatDateTime } from "@/lib/format-date"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"

function describeError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "The API could not be reached. Check your connection and try again."
}

export function ItemView({ id }: { id: string }) {
  const router = useRouter()
  const {
    data: item,
    error,
    isLoading,
    mutate,
  } = useSWR<ItemDetail, Error>(itemPath(id), fetchJson)
  const [draft, setDraft] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [pending, setPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function saveEdit(text: string) {
    if (!text.trim()) {
      setActionError("Write something before saving.")
      return
    }
    setPending(true)
    setActionError(null)
    try {
      await mutate(await editItem(id, text), { revalidate: false })
      setDraft(null)
    } catch (caught) {
      setActionError(describeError(caught))
    } finally {
      setPending(false)
    }
  }

  async function remove() {
    setPending(true)
    setActionError(null)
    try {
      await deleteItem(id)
      router.replace("/")
    } catch (caught) {
      setActionError(describeError(caught))
      setPending(false)
    }
  }

  const back = (
    <Link
      href="/"
      className="flex w-fit items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
    >
      <ArrowLeftIcon aria-hidden />
      All notes
    </Link>
  )

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6" aria-busy aria-label="Loading note">
        {back}
        <div className="h-6 w-48 animate-pulse bg-muted" />
        <div className="h-32 w-full animate-pulse bg-muted" />
      </div>
    )
  }

  if (error || !item) {
    const notFound = error instanceof ApiError && error.status === 404
    return (
      <div className="flex flex-col gap-6">
        {back}
        <h1 className="text-2xl font-medium tracking-tight">
          {notFound ? "Note not found" : "Note could not be loaded"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {notFound
            ? "It may have been deleted, or the link is wrong."
            : describeError(error)}
        </p>
      </div>
    )
  }

  return (
    <article className="flex flex-col gap-8">
      {back}
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-medium tracking-tight break-words">
          {item.title ?? "Untitled note"}
        </h1>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <StatusBadge status={item.status} />
          {item.kind && <span className="capitalize">{item.kind}</span>}
        </div>
      </header>

      <section
        className="flex flex-col gap-3"
        aria-labelledby="original-heading"
      >
        <h2 id="original-heading" className="text-sm font-medium">
          Original
        </h2>
        {draft === null ? (
          <p className="text-base leading-relaxed break-words whitespace-pre-wrap md:text-sm">
            {item.rawText}
          </p>
        ) : (
          <form
            onSubmit={(event: SubmitEvent<HTMLFormElement>) => {
              event.preventDefault()
              void saveEdit(draft)
            }}
            className="flex flex-col gap-3"
          >
            <label htmlFor="edit-text" className="sr-only">
              Note text
            </label>
            <Textarea
              id="edit-text"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value)
              }}
              autoFocus
              className="max-h-[60dvh] min-h-40 text-base leading-relaxed md:text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Saving replaces the original and processes the note again.
            </p>
            <div className="flex gap-2">
              <Button type="submit" size="lg" disabled={pending}>
                {pending ? "Saving" : "Save changes"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="lg"
                disabled={pending}
                onClick={() => {
                  setDraft(null)
                  setActionError(null)
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </section>

      {actionError && (
        <Alert variant="destructive">
          <WarningCircleIcon aria-hidden />
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      <section
        className="flex flex-col gap-3"
        aria-labelledby="captures-heading"
      >
        <h2 id="captures-heading" className="text-sm font-medium">
          {item.captures.length === 1
            ? "Saved once"
            : `Saved ${item.captures.length} times`}
        </h2>
        <ul className="flex flex-col gap-1 font-mono text-xs text-muted-foreground">
          {item.captures.map((capturedAt) => (
            <li key={capturedAt}>
              <time dateTime={capturedAt}>{formatDateTime(capturedAt)}</time>
            </li>
          ))}
        </ul>
      </section>

      {draft === null && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-6">
          {confirmingDelete ? (
            <>
              <p className="text-sm">Delete this note?</p>
              <div className="ml-auto flex gap-2">
                <Button
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    setConfirmingDelete(false)
                  }}
                >
                  Keep note
                </Button>
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() => {
                    void remove()
                  }}
                >
                  {pending ? "Deleting" : "Delete note"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setDraft(item.rawText)
                }}
              >
                Edit
              </Button>
              <Button
                variant="destructive"
                className="ml-auto"
                onClick={() => {
                  setConfirmingDelete(true)
                }}
              >
                Delete
              </Button>
            </>
          )}
        </div>
      )}
    </article>
  )
}
