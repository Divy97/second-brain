import { z } from "zod"

import { chatModel, retrieval } from "../config.js"

import type { HistoryTurn } from "./history.js"
import type { OpenRouter } from "@workspace/ai"

const rewriteSchema = z.object({
  question: z
    .string()
    .describe("The question with typos and dictation errors fixed."),
  variants: z
    .array(z.string())
    .describe(
      "2-3 rephrasings that expand vague wording into likely saved words."
    ),
  keywords: z
    .array(z.string())
    .describe(
      "Distinctive words to match exactly: names, products, rare terms."
    ),
  filters: z.object({
    lastDays: z
      .number()
      .nullable()
      .describe(
        "For windows reaching up to now: how many days back. Else null."
      ),
    from: z
      .string()
      .nullable()
      .describe("First calendar day (YYYY-MM-DD) of a past period, or null."),
    to: z
      .string()
      .nullable()
      .describe(
        "Last calendar day (YYYY-MM-DD, inclusive) of a past period, or null."
      ),
    kind: z
      .enum(["quote", "fact", "thought", "meeting"])
      .nullable()
      .describe(
        "Only when the question explicitly asks for that kind of note."
      ),
  }),
  followUp: z
    .boolean()
    .describe("True when the question refers to the previous answer."),
})

export type Rewrite = z.infer<typeof rewriteSchema>

const instructions = `You prepare a question for searching the user's personal notes.
Return JSON matching the schema.
- question: the question with typos, dictation and transliteration errors fixed (e.g. "Asian tech browser" -> "agentic browser"). Keep its meaning.
- variants: 2-3 short rephrasings that expand vague wording into the words the note itself likely contains ("that browser that browses for you" -> "agentic browser"). Write at least one variant in English.
- keywords: distinctive words worth matching exactly (names of people, products, books, places; rare terms). Leave out common words. May be empty.
- filters, when the question limits time:
  - a window reaching up to now sets lastDays ("recently" = 30, "a few days ago" = 14, "this week" = 7, "today" = 1) and leaves from/to null;
  - a closed past period sets from/to as calendar dates in the user's timezone, to inclusive ("last week" = the previous Monday to Sunday, "in August" = August 1 to 31), using "now" and "timezone" from the input;
  - kind only when the question explicitly asks for a quote, fact, thought or meeting note; otherwise null.
  Everything else null.
- followUp: true when the question refers back to the previous answer ("that one", "which book was that from?").
The input is JSON: { "question": string, "now": string, "timezone": string, "history": [{ "role", "text" }] }.`

export async function rewriteQuestion(
  openRouter: OpenRouter,
  input: {
    question: string
    now: Date
    timezone: string
    history: HistoryTurn[]
  }
): Promise<Rewrite> {
  const { content } = await openRouter.chat({
    model: chatModel,
    messages: [
      { role: "system", content: instructions },
      {
        role: "user",
        content: JSON.stringify({
          question: input.question,
          now: input.now.toISOString(),
          timezone: input.timezone,
          history: input.history.map(({ role, text }) => ({ role, text })),
        }),
      },
    ],
    output: { name: "rewrite", schema: rewriteSchema },
  })
  const variants = [
    ...new Set(
      [content.question, ...content.variants]
        .map((variant) => variant.trim())
        .filter(Boolean)
    ),
  ].slice(0, retrieval.maxQueryStrings)
  return {
    ...content,
    question: content.question.trim() || input.question,
    variants: variants.length > 0 ? variants : [input.question],
    keywords: content.keywords.map((keyword) => keyword.trim()).filter(Boolean),
  }
}
