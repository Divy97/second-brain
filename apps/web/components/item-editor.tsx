"use client"

import { useState, type SubmitEvent } from "react"

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
  return (
    <form
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
