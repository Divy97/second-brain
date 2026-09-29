"use client"

import { LinkIcon, WarningCircleIcon } from "@phosphor-icons/react"
import { useState } from "react"

import { describeApiError } from "@/lib/describe-api-error"
import { saveUrl, type ItemSummary } from "@/lib/items-api"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"

export function UrlCapture({
  onSaved,
}: {
  onSaved: (item: ItemSummary) => Promise<void>
}) {
  const [url, setUrl] = useState("")
  const [note, setNote] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setPending(true)
    setError(null)
    try {
      const item = await saveUrl(url, note || undefined)
      setUrl("")
      setNote("")
      await onSaved(item)
    } catch (caught) {
      setError(describeApiError(caught))
    } finally {
      setPending(false)
    }
  }

  return (
    <section
      className="rounded-xl bg-card px-5 py-4 sm:px-6"
      aria-label="Link capture"
    >
      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <LinkIcon aria-hidden /> Save a link
        </label>
        <Input
          type="url"
          required
          placeholder="https://example.com/article"
          value={url}
          disabled={pending}
          onChange={(event) => {
            setUrl(event.target.value)
          }}
        />
        <Textarea
          placeholder="Optional note"
          value={note}
          disabled={pending}
          onChange={(event) => {
            setNote(event.target.value)
          }}
        />
        <Button
          type="button"
          disabled={pending || !url.trim()}
          onClick={() => void save()}
        >
          {pending ? "Saving" : "Save link"}
        </Button>
      </div>
      {error && (
        <Alert variant="destructive" className="mt-4">
          <WarningCircleIcon aria-hidden />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </section>
  )
}
