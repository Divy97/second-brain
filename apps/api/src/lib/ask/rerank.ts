import { z } from "zod"

import { chatModel, retrieval } from "../config.js"

import type { Rewrite } from "./rewrite.js"
import type { OpenRouter } from "@workspace/ai"
import type { Candidate } from "@workspace/db"

const rerankSchema = z.object({
  ranking: z.array(
    z.object({
      id: z.string(),
      score: z.number().describe("0 = unrelated, 1 = answers the question."),
    })
  ),
})

const instructions = `You judge which saved note excerpts can answer a question.
Score every candidate from 0 to 1: 1 = it directly answers the question, 0.5 = related and possibly what the user means, 0 = unrelated. Judge meaning, not shared words; notes may be in any language.
Return JSON: { "ranking": [{ "id", "score" }] } with one entry per candidate id.
The input is JSON: { "question": string, "variants": string[], "keywords": string[], "candidates": [{ "id", "text" }] }.`

export async function rerankCandidates(
  openRouter: OpenRouter,
  input: { rewrite: Rewrite; candidates: Candidate[] }
): Promise<Candidate[]> {
  if (input.candidates.length === 0) return []
  const { content } = await openRouter.chat({
    model: chatModel,
    messages: [
      { role: "system", content: instructions },
      {
        role: "user",
        content: JSON.stringify({
          question: input.rewrite.question,
          variants: input.rewrite.variants,
          keywords: input.rewrite.keywords,
          candidates: input.candidates.map((candidate) => ({
            id: candidate.chunkId,
            text: `${candidate.itemTitle ?? ""}\n${candidate.chunkText}`,
          })),
        }),
      },
    ],
    output: { name: "rerank", schema: rerankSchema },
  })
  const scores = new Map(
    content.ranking.map((entry) => [entry.id, entry.score])
  )
  return input.candidates
    .map((candidate) => ({
      candidate,
      score: scores.get(candidate.chunkId) ?? 0,
    }))
    .filter((entry) => entry.score >= retrieval.rerankFloor)
    .sort((a, b) => b.score - a.score)
    .slice(0, retrieval.rerankKeep)
    .map((entry) => entry.candidate)
}
