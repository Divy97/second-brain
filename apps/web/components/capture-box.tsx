"use client"

import { useRef, useState, type KeyboardEvent, type SubmitEvent } from "react"

import { CaptureError } from "@/components/capture-error"
import { CaptureFooter } from "@/components/capture-footer"
import { describeApiError, emptyNoteMessage } from "@/lib/describe-api-error"
import { saveItem, type ItemSummary } from "@/lib/items-api"
import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"

export function CaptureBox({
  onSaved,
}: {
  onSaved: (item: ItemSummary) => Promise<void>
}) {
  const [text, setText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  async function submit() {
    if (!text.trim()) {
      setError(emptyNoteMessage)
      return
    }
    setPending(true)
    setError(null)
    let saved: ItemSummary
    try {
      saved = await saveItem(text)
    } catch (caught) {
      setError(describeApiError(caught))
      setPending(false)
      return
    }
    setText("")
    setPending(false)
    await onSaved(saved)
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      formRef.current?.requestSubmit()
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={(event: SubmitEvent<HTMLFormElement>) => {
        event.preventDefault()
        void submit()
      }}
      className="flex flex-1 flex-col gap-4"
    >
      <label htmlFor="capture" className="sr-only">
        Note
      </label>
      <Textarea
        id="capture"
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          if (error) setError(null)
        }}
        onKeyDown={onKeyDown}
        placeholder="Write a thought, quote, or detail..."
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "capture-error" : undefined}
        required
        onInvalid={(event) => {
          event.preventDefault()
          setError(emptyNoteMessage)
        }}
        className="max-h-[50dvh] min-h-36 flex-1 resize-none rounded-none border-0 bg-transparent px-0 py-0 font-sans text-base leading-relaxed placeholder:text-muted-foreground focus-visible:ring-0 sm:text-lg"
      />
      {error && <CaptureError id="capture-error" message={error} />}
      <CaptureFooter
        hint={
          <span className="hidden sm:inline">
            <kbd className="font-mono">⌘</kbd> or{" "}
            <kbd className="font-mono">Ctrl</kbd> +{" "}
            <kbd className="font-mono">Enter</kbd> to save
          </span>
        }
      >
        <Button type="submit" disabled={pending || !text.trim()}>
          {pending ? "Saving" : "Save note"}
        </Button>
      </CaptureFooter>
    </form>
  )
}
