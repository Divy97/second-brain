"use client"

import { ArrowUpRightIcon } from "@phosphor-icons/react"
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
    <div className="mx-auto max-w-4xl">
      <section className="rounded-[2.25rem] bg-mint px-6 py-12 text-center sm:px-12 sm:py-20">
        <p className="mb-5 text-xs font-bold tracking-[0.15em] uppercase">
          Your memories, on call
        </p>
        <h1 className="mx-auto max-w-xl font-heading text-5xl leading-[1.03] tracking-tight sm:text-7xl">
          Ask what your brain <em className="text-coral-ink">kept.</em>
        </h1>
        <p className="mx-auto mt-5 max-w-md text-muted-foreground">
          A name, a date, that one detail. Ask naturally and see where the
          answer came from.
        </p>
        <div className="mx-auto mt-9 max-w-xl rounded-[1.75rem] bg-card p-3 shadow-[0_16px_45px_#533c5112]">
          <AskBox
            label="Ask your notes"
            placeholder="What did I save about..."
            pending={asking !== null}
            onAsk={ask}
          />
        </div>
      </section>
      {asking !== null && (
        <div className="mt-8">
          <PendingAnswer question={asking} />
        </div>
      )}
      {error !== null && (
        <div className="mt-8">
          <AskError error={error} />
        </div>
      )}
      <section className="mt-14" aria-labelledby="past-heading">
        <div className="mb-6 flex items-end justify-between">
          <h2 id="past-heading" className="font-heading text-4xl">
            Past questions
          </h2>
          <span className="text-sm text-muted-foreground">
            Pick up a thought
          </span>
        </div>
        {isLoading ? (
          <div className="h-24 animate-pulse rounded-2xl bg-muted" aria-busy />
        ) : threads.length === 0 ? (
          <div className="rounded-[1.75rem] bg-card p-10 text-center">
            <p className="font-heading text-2xl">Start with a question.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Your conversations will live here.
            </p>
          </div>
        ) : (
          <ul className="grid gap-3">
            {threads.map((thread) => (
              <li key={thread.id}>
                <Link
                  href={`/threads/${thread.id}`}
                  className="group flex items-center gap-4 rounded-2xl bg-card p-5 transition-transform hover:-translate-y-0.5"
                >
                  <span className="line-clamp-2 flex-1 font-medium break-words">
                    {thread.title}
                  </span>
                  <time
                    dateTime={thread.createdAt}
                    className="shrink-0 text-xs text-muted-foreground"
                  >
                    {formatListDate(thread.createdAt)}
                  </time>
                  <ArrowUpRightIcon aria-hidden className="shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
