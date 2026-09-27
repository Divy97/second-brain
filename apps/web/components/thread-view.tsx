"use client"

import { ArrowLeftIcon } from "@phosphor-icons/react"
import Link from "next/link"
import { useState } from "react"
import useSWR from "swr"

import { AskBox } from "@/components/ask-box"
import { AskError } from "@/components/ask-error"
import { DeleteThread } from "@/components/delete-thread"
import { PendingAnswer } from "@/components/pending-answer"
import { SourceCards } from "@/components/source-cards"
import { ApiError, fetchJson } from "@/lib/api"
import { describeApiError } from "@/lib/describe-api-error"
import {
  askInThread,
  threadPath,
  type ThreadDetail,
  type ThreadMessage,
} from "@/lib/threads-api"

const backLink = (
  <Link
    href="/threads"
    className="flex w-fit items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
  >
    <ArrowLeftIcon aria-hidden />
    All questions
  </Link>
)

function MessageView({ message }: { message: ThreadMessage }) {
  if (message.role === "user") {
    return (
      <p className="max-w-[85%] self-end bg-muted px-3 py-2 text-sm break-words whitespace-pre-wrap">
        {message.text}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="max-w-[65ch] text-base leading-relaxed break-words whitespace-pre-wrap md:text-sm">
        {message.text}
      </p>
      <SourceCards sources={message.sources} />
    </div>
  )
}

export function ThreadView({ id }: { id: string }) {
  const { data, error, isLoading, mutate } = useSWR<ThreadDetail, Error>(
    threadPath(id),
    fetchJson
  )
  const [asking, setAsking] = useState<string | null>(null)
  const [askError, setAskError] = useState<unknown>(null)

  async function ask(question: string): Promise<boolean> {
    setAsking(question)
    setAskError(null)
    try {
      await askInThread(id, question)
      await mutate()
      return true
    } catch (caught) {
      setAskError(caught)
      return false
    } finally {
      setAsking(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6" aria-busy aria-label="Loading">
        {backLink}
        <div className="h-6 w-2/3 animate-pulse bg-muted" />
        <div className="h-24 w-full animate-pulse bg-muted" />
      </div>
    )
  }

  if (error || !data) {
    const notFound = error instanceof ApiError && error.status === 404
    return (
      <div className="flex flex-col gap-6">
        {backLink}
        <h1 className="text-2xl font-medium tracking-tight">
          {notFound ? "Question not found" : "Could not load this question"}
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
    <div className="flex flex-col gap-8">
      {backLink}
      <h1 className="sr-only">{data.title || "New question"}</h1>
      <ol className="flex flex-col gap-6">
        {data.messages.map((message) => (
          <li key={message.id} className="flex flex-col">
            <MessageView message={message} />
          </li>
        ))}
      </ol>
      {asking !== null && <PendingAnswer question={asking} />}
      {askError !== null && <AskError error={askError} />}
      <AskBox
        label="Ask a follow-up"
        placeholder="Ask a follow-up"
        pending={asking !== null}
        onAsk={ask}
      />
      <DeleteThread id={id} />
    </div>
  )
}
