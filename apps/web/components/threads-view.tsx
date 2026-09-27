"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import useSWR from "swr"

import { AskBox } from "@/components/ask-box"
import { AskError } from "@/components/ask-error"
import { PendingAnswer } from "@/components/pending-answer"
import { fetchJson } from "@/lib/api"
import { formatListDate } from "@/lib/format-date"
import {
  askInThread,
  startThread,
  threadsPath,
  type ThreadSummary,
} from "@/lib/threads-api"

export function ThreadsView() {
  const router = useRouter()
  const { data, isLoading, mutate } = useSWR<{ threads: ThreadSummary[] }>(
    threadsPath,
    fetchJson
  )
  const [asking, setAsking] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)

  async function ask(question: string): Promise<boolean> {
    setAsking(question)
    setError(null)
    try {
      const thread = await startThread()
      await askInThread(thread.id, question)
      await mutate()
      router.push(`/threads/${thread.id}`)
      return true
    } catch (caught) {
      setError(caught)
      setAsking(null)
      return false
    }
  }

  const threads = data?.threads ?? []
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-medium tracking-tight">Ask</h1>
        <AskBox
          label="Ask your notes"
          placeholder="What was that quote about attention?"
          pending={asking !== null}
          onAsk={ask}
        />
      </div>
      {asking !== null && <PendingAnswer question={asking} />}
      {error !== null && <AskError error={error} />}

      <section className="flex flex-col gap-3" aria-labelledby="past-heading">
        <h2 id="past-heading" className="text-sm font-medium">
          Past questions
        </h2>
        {isLoading ? (
          <div className="h-16 w-full animate-pulse bg-muted" aria-busy />
        ) : threads.length === 0 ? (
          <p className="border-t pt-4 text-sm text-muted-foreground">
            No questions yet. Ask anything you remember saving.
          </p>
        ) : (
          <ul className="flex flex-col border-t">
            {threads.map((thread) => (
              <li key={thread.id} className="border-b">
                <Link
                  href={`/threads/${thread.id}`}
                  className="flex items-baseline gap-4 py-3 outline-none hover:underline hover:underline-offset-4 focus-visible:bg-muted/50"
                >
                  <span className="line-clamp-2 flex-1 text-sm break-words">
                    {thread.title}
                  </span>
                  <time
                    dateTime={thread.createdAt}
                    className="shrink-0 font-mono text-xs text-muted-foreground"
                  >
                    {formatListDate(thread.createdAt)}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
