"use client"

import { ArrowUpIcon } from "@phosphor-icons/react"
import { useRef, useState, type KeyboardEvent, type SubmitEvent } from "react"

import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"

export function AskBox({
  label,
  placeholder,
  pending,
  onAsk,
}: {
  label: string
  placeholder: string
  pending: boolean
  onAsk: (question: string) => Promise<boolean>
}) {
  const [question, setQuestion] = useState("")
  const [empty, setEmpty] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  async function submit() {
    if (!question.trim()) {
      setEmpty(true)
      return
    }
    if (await onAsk(question.trim())) setQuestion("")
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
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
      className="flex flex-col gap-2"
    >
      <label htmlFor="question" className="sr-only">
        {label}
      </label>
      <div className="flex items-end gap-2">
        <Textarea
          id="question"
          value={question}
          onChange={(event) => {
            setQuestion(event.target.value)
            if (empty) setEmpty(false)
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={pending}
          aria-invalid={empty ? true : undefined}
          rows={1}
          className="max-h-40 min-h-11 flex-1 text-base leading-relaxed md:text-sm"
        />
        <Button
          type="submit"
          size="icon-lg"
          disabled={pending}
          aria-label="Ask"
          className="size-11 shrink-0"
        >
          <ArrowUpIcon aria-hidden />
        </Button>
      </div>
      {empty && (
        <p className="text-xs text-destructive">Type a question first.</p>
      )}
    </form>
  )
}
