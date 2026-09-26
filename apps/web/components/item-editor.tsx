"use client"

import { useRef, useState, type KeyboardEvent, type SubmitEvent } from "react"

import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"

export function ItemEditor({
  initialText,
  pending,
  onSave,
  onCancel,
}: {
  initialText: string
  pending: boolean
  onSave: (text: string) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(initialText)
  const formRef = useRef<HTMLFormElement>(null)

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
        onSave(draft)
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
        onKeyDown={onKeyDown}
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
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
