import { chunking } from "../config.js"

// Roughly one token per 4 characters of Latin text or per word, whichever is larger; dense
// scripts (Devanagari, CJK) have short or no word breaks, so the character term dominates.
export function estimateTokens(text: string): number {
  const words = text.match(/\S+/g)?.length ?? 0
  return Math.max(Math.ceil(text.length / 4), Math.ceil(words * 1.3))
}

function splitOversized(paragraph: string, limit: number): string[] {
  if (estimateTokens(paragraph) <= limit) return [paragraph]
  const sentences = paragraph.match(/[^.!?।。]+[.!?।。]*\s*/gu) ?? [paragraph]
  const pieces: string[] = []
  let current = ""
  for (const sentence of sentences) {
    if (current && estimateTokens(current + sentence) > limit) {
      pieces.push(current.trim())
      current = ""
    }
    if (estimateTokens(sentence) > limit) {
      const charLimit = limit * 4
      for (let start = 0; start < sentence.length; start += charLimit) {
        pieces.push(sentence.slice(start, start + charLimit).trim())
      }
      continue
    }
    current += sentence
  }
  if (current.trim()) pieces.push(current.trim())
  return pieces
}

function overlapTail(units: string[], budget: number): string[] {
  const tail: string[] = []
  let tokens = 0
  for (let index = units.length - 1; index >= 0; index -= 1) {
    const unit = units[index] ?? ""
    tokens += estimateTokens(unit)
    if (tokens > budget) break
    tail.unshift(unit)
  }
  return tail
}

export function chunkText(text: string): string[] {
  const trimmed = text.trim()
  if (estimateTokens(trimmed) <= chunking.singleChunkMaxTokens) return [trimmed]

  const units = trimmed
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .flatMap((paragraph) => splitOversized(paragraph, chunking.targetTokens))

  const overlapBudget = Math.floor(
    chunking.targetTokens * chunking.overlapRatio
  )
  const chunks: string[][] = []
  let current: string[] = []
  let currentTokens = 0
  let fresh = 0

  for (const unit of units) {
    const tokens = estimateTokens(unit)
    if (fresh > 0 && currentTokens + tokens > chunking.targetTokens) {
      chunks.push(current)
      current = overlapTail(current, overlapBudget)
      currentTokens = current.reduce(
        (sum, carried) => sum + estimateTokens(carried),
        0
      )
      fresh = 0
    }
    current.push(unit)
    currentTokens += tokens
    fresh += 1
  }

  const freshTokens = current
    .slice(current.length - fresh)
    .reduce((sum, unit) => sum + estimateTokens(unit), 0)
  const previous = chunks.at(-1)
  if (previous && fresh > 0 && freshTokens < chunking.minTrailingTokens) {
    previous.push(...current.slice(current.length - fresh))
  } else if (fresh > 0) {
    chunks.push(current)
  }
  return chunks.map((chunk) => chunk.join("\n\n"))
}
