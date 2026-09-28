"use client"

import { WarningCircleIcon } from "@phosphor-icons/react"
import { useRef, useState, type KeyboardEvent, type SubmitEvent } from "react"

import { describeApiError, emptyNoteMessage } from "@/lib/describe-api-error"
import { saveItem, type ItemSummary } from "@/lib/items-api"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
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
      className="flex flex-col gap-4 rounded-xl bg-card p-5 sm:p-6"
    >
      <div className="flex items-center justify-between gap-3 text-sm">
        <label htmlFor="capture" className="font-semibold">
          New note
        </label>
        <span className="text-xs text-muted-foreground">Required</span>
      </div>
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
        className="max-h-[50dvh] min-h-28 resize-none border-0 bg-transparent px-0 py-0 font-sans text-base leading-relaxed placeholder:text-muted-foreground focus-visible:ring-0 sm:min-h-36 sm:text-lg"
      />
      {error && (
        <Alert variant="destructive" id="capture-error">
          <WarningCircleIcon aria-hidden />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="hidden text-xs text-muted-foreground sm:block">
          <kbd className="font-mono">Ctrl</kbd> or{" "}
          <kbd className="font-mono">⌘</kbd> +{" "}
          <kbd className="font-mono">Enter</kbd> saves
        </p>
        <Button
          type="submit"
          size="lg"
          disabled={pending}
          className="ml-auto bg-coral text-foreground hover:bg-coral/90"
        >
          {pending ? "Saving" : "Save this thought ↗"}
        </Button>
      </div>
    </form>
  )
}
