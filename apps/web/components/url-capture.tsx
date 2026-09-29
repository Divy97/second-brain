"use client"

import { useState, type SubmitEvent } from "react"

import { CaptureError } from "@/components/capture-error"
import { CaptureFooter } from "@/components/capture-footer"
import { describeApiError } from "@/lib/describe-api-error"
import { saveUrl, type ItemSummary } from "@/lib/items-api"
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
    <form
      className="flex flex-1 flex-col gap-4"
      onSubmit={(event: SubmitEvent<HTMLFormElement>) => {
        event.preventDefault()
        void save()
      }}
    >
      <div className="flex flex-col gap-2">
        <label htmlFor="capture-url" className="text-sm font-semibold">
          Link
        </label>
        <Input
          id="capture-url"
          type="url"
          required
          placeholder="https://example.com/article"
          value={url}
          disabled={pending}
          onChange={(event) => {
            setUrl(event.target.value)
          }}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="capture-url-note" className="text-sm font-semibold">
          Why you&apos;re saving it{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <Textarea
          id="capture-url-note"
          placeholder="A line of context for later"
          value={note}
          disabled={pending}
          onChange={(event) => {
            setNote(event.target.value)
          }}
          className="min-h-20 resize-none"
        />
      </div>
      {error && <CaptureError message={error} />}
      <CaptureFooter hint="The page's text is saved with your note">
        <Button type="submit" disabled={pending || !url.trim()}>
          {pending ? "Saving" : "Save link"}
        </Button>
      </CaptureFooter>
    </form>
  )
}
