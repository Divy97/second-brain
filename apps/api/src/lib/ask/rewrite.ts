import { z } from "zod"

import { chatModel } from "../config.js"

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
    from: z
      .string()
      .nullable()
      .describe("ISO 8601 start of the time window, or null."),
    to: z
      .string()
      .nullable()
      .describe("ISO 8601 end of the time window, or null."),
    kind: z.enum(["quote", "fact", "thought", "meeting", "other"]).nullable(),
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
- filters: from/to as ISO 8601 timestamps in UTC when the question limits time, resolved against "now" in the user's timezone ("recently" = last 30 days, "a few days ago" = last 14 days, "last week" = the previous calendar week); kind when the question asks for a quote, fact, thought or meeting note. Otherwise null.
- followUp: true when the question refers back to the previous answer ("that one", "which book was that from?").
The input is JSON: { "question": string, "now": string, "timezone": string, "history": [{ "role", "text" }] }.`

export async function rewriteQuestion(
  openRouter: OpenRouter,
  input: {
    question: string
    now: Date
    timezone: string
    history: { role: string; text: string }[]
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
          history: input.history,
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
  ].slice(0, 4)
  return {
    ...content,
    question: content.question.trim() || input.question,
    variants: variants.length > 0 ? variants : [input.question],
    keywords: content.keywords.map((keyword) => keyword.trim()).filter(Boolean),
  }
}
