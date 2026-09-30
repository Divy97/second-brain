"use client"

import {
  ArrowUpRightIcon,
  InstagramLogoIcon,
  YoutubeLogoIcon,
} from "@phosphor-icons/react"
import { useState } from "react"

const examples = [
  {
    question: "What was that focus tip?",
    answer:
      "Put your phone in another room and give one task your full attention for 25 minutes.",
    source: "YouTube transcript",
    title: "A calmer way to get things done",
    icon: YoutubeLogoIcon,
  },
  {
    question: "What went in that recipe?",
    answer:
      "White beans, cherry tomatoes, garlic and olive oil. Finish with fresh basil and a squeeze of lemon.",
    source: "Instagram caption",
    title: "The ten-minute lunch worth saving",
    icon: InstagramLogoIcon,
  },
]

export function VideoMemoryDemo() {
  const [selected, setSelected] = useState<number | null>(null)
  const example = selected === null ? null : examples[selected]
  return (
    <div className="relative rounded-2xl border border-primary/15 bg-card p-5 shadow-[0_20px_60px_-30px_rgb(83_60_81/0.25)] sm:p-7">
      <p className="mb-5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Try a sample question
      </p>
      <div className="grid gap-3">
        {examples.map(({ question, icon: Icon }, index) => (
          <button
            key={question}
            type="button"
            aria-pressed={selected === index}
            aria-controls="video-demo-answer"
            onClick={() => {
              setSelected(index)
            }}
            className="group flex min-h-14 items-center gap-3 rounded-xl border border-border px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-accent aria-pressed:border-primary aria-pressed:bg-accent"
          >
            <Icon size={23} className="shrink-0 text-coral-ink" aria-hidden />
            <span className="flex-1">{question}</span>
            <ArrowUpRightIcon aria-hidden className="shrink-0" />
          </button>
        ))}
      </div>
      <div
        id="video-demo-answer"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="mt-5 min-h-64 rounded-xl bg-background p-5 sm:min-h-56"
      >
        {example ? (
          <div key={selected} className="content-enter">
            <p className="text-base leading-relaxed">{example.answer}</p>
            <div className="mt-5 border-t border-border pt-4">
              <p className="text-xs font-semibold text-coral-ink">
                {example.source}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {example.title}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex min-h-52 flex-col justify-center sm:min-h-44">
            <p className="text-xl font-semibold tracking-tight">
              “Wait, where did I see that?”
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Pick a question above. See how a saved video becomes something you
              can use.
            </p>
          </div>
        )}
      </div>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Illustrative examples. Your answers come from your own saved sources.
      </p>
    </div>
  )
}
