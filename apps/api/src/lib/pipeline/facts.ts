import { z } from "zod"

import { chatModel } from "../config.js"

import type { OpenRouter } from "@workspace/ai"
import type { SimilarFact } from "@workspace/db"

const factsSchema = z.object({
  facts: z.array(z.string()).describe("Atomic facts from the user's note."),
})

const reconciliationSchema = z.object({
  action: z.enum(["ADD", "UPDATE", "DELETE", "NOOP"]),
  existingFactId: z.string().nullable(),
})

const extractInstructions = `Extract atomic facts from the user's own saved note.
Only extract stable facts worth remembering. Use the user's wording where possible.
Do not extract facts about third-party article/video/image/PDF content.
Return JSON: { "facts": string[] }.
The input is JSON: { "note": string }.`

const reconcileInstructions = `Reconcile one new fact against existing valid facts.
Actions:
- ADD: new fact is not represented.
- UPDATE: new fact replaces an existing fact.
- DELETE: new fact says an existing fact should be forgotten or is no longer true.
- NOOP: existing facts already cover it.
Return JSON: { "action": "ADD"|"UPDATE"|"DELETE"|"NOOP", "existingFactId": string|null }.
Use an existingFactId only for UPDATE or DELETE.
The input is JSON: { "fact": string, "existing": [{ "id", "text" }] }.`

export function shouldExtractFacts(input: {
  type: string
  kind: string
}): boolean {
  if (input.type !== "text" && input.type !== "voice") return false
  if (input.type === "voice") return true
  return (
    input.kind === "thought" ||
    input.kind === "fact" ||
    input.kind === "meeting" ||
    input.kind === "quote"
  )
}

export async function extractFacts(
  openRouter: OpenRouter,
  note: string
): Promise<string[]> {
  const { content } = await openRouter.chat({
    model: chatModel,
    messages: [
      { role: "system", content: extractInstructions },
      { role: "user", content: JSON.stringify({ note }) },
    ],
    output: { name: "facts", schema: factsSchema },
  })
  return [...new Set(content.facts.map((fact) => fact.trim()).filter(Boolean))]
}

export async function reconcileFact(
  openRouter: OpenRouter,
  input: { fact: string; existing: SimilarFact[] }
) {
  const { content } = await openRouter.chat({
    model: chatModel,
    messages: [
      { role: "system", content: reconcileInstructions },
      { role: "user", content: JSON.stringify(input) },
    ],
    output: { name: "fact_reconciliation", schema: reconciliationSchema },
  })
  return content
}
