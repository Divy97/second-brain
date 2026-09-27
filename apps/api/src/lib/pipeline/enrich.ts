import { z } from "zod"

import { chatModel, enrichment as limits } from "../config.js"

import type { OpenRouter } from "@workspace/ai"
import type { Enrichment } from "@workspace/db"

const enrichmentSchema = z.object({
  title: z.string().describe("A short, specific title, at most 8 words."),
  summary: z
    .string()
    .describe(
      "2-3 sentences, always in English, whatever the note's language."
    ),
  cleanText: z
    .string()
    .describe(
      "The note with obvious dictation, OCR and typing errors corrected in context. Same language, same wording otherwise."
    ),
  kind: z.enum(["quote", "fact", "thought", "meeting", "other"]),
  language: z
    .string()
    .describe("ISO 639-1 code of the note's main language, e.g. en, hi."),
  tags: z.array(z.string()).describe("5-10 lowercase topical tags."),
  entities: z.array(
    z.object({
      name: z.string(),
      type: z.enum([
        "person",
        "product",
        "book",
        "place",
        "organization",
        "other",
      ]),
    })
  ),
})

const instructions = `You enrich one saved note for a personal memory app.
Return JSON matching the schema.
- title: short and specific.
- summary: 2-3 sentences in English, even when the note is in another language.
- cleanText: fix only obvious dictation, OCR and typing errors using context (e.g. "Asian tech browser" -> "agentic browser"). Keep the note's language and wording; never add content.
- kind: quote (someone's words, or text in quotation marks), fact (a statement of fact to remember), thought (the user's own idea, reflection, plan, reminder or to-do), meeting (notes from a meeting or call), other (anything else).
- language: ISO 639-1 code of the note's main language.
- tags: 5-10 lowercase topical tags. Reuse tags from neighbourTags whenever they fit, so the vocabulary stays consistent.
- entities: people, products, books, places and organizations named in the note.
The input is JSON: { "note": string, "neighbourTags": string[] }.`

function normalizeTags(tags: string[]): string[] {
  const normalized = tags
    .map((tag) => tag.trim().toLowerCase().replace(/\s+/g, "-"))
    .filter(Boolean)
  return [...new Set(normalized)].slice(0, limits.maxTags)
}

export async function enrichNote(
  openRouter: OpenRouter,
  input: { note: string; neighbourTags: string[] }
): Promise<Enrichment> {
  const { content } = await openRouter.chat({
    model: chatModel,
    messages: [
      { role: "system", content: instructions },
      { role: "user", content: JSON.stringify(input) },
    ],
    output: { name: "enrichment", schema: enrichmentSchema },
  })
  return {
    title: content.title.trim().slice(0, limits.maxTitleLength),
    summary: content.summary.trim(),
    cleanText: content.cleanText.trim() || input.note,
    kind: content.kind,
    language: content.language.trim().toLowerCase(),
    tags: normalizeTags(content.tags),
    entities: content.entities.filter((entity) => entity.name.trim()),
  }
}
