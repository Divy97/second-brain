import { chunking } from "../config.js"

// Roughly one token per 4 characters of Latin text or per word, whichever is larger; dense
// scripts (Devanagari, CJK) have short or no word breaks, so the character term dominates.
export function estimateTokens(text: string): number {
  const words = text.match(/\S+/g)?.length ?? 0
  return Math.max(Math.ceil(text.length / 4), Math.ceil(words * 1.3))
}

const sumTokens = (units: string[]) =>
  units.reduce((sum, unit) => sum + estimateTokens(unit), 0)

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?।。])\s+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

function splitByWords(text: string, limit: number): string[] {
  const pieces: string[] = []
  let current = ""
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word
    if (current && estimateTokens(candidate) > limit) {
      pieces.push(current)
      current = word
    } else {
      current = candidate
    }
    while (estimateTokens(current) > limit) {
      pieces.push(current.slice(0, limit * 4))
      current = current.slice(limit * 4)
    }
  }
  if (current) pieces.push(current)
  return pieces
}

// Paragraphs, then sentences, then words: every unit fits the target on its own.
function toUnits(paragraph: string, limit: number): string[] {
  if (estimateTokens(paragraph) <= limit) return [paragraph]
  return splitSentences(paragraph).flatMap((sentence) =>
    estimateTokens(sentence) <= limit
      ? [sentence]
      : splitByWords(sentence, limit)
  )
}

// The overlap is the tail of the previous chunk, taken sentence by sentence.
function overlapFrom(units: string[], budget: number): string[] {
  const sentences = splitSentences(units.join(" "))
  const tail: string[] = []
  for (let index = sentences.length - 1; index > 0; index -= 1) {
    const sentence = sentences[index] ?? ""
    if (sumTokens([...tail, sentence]) > budget) break
    tail.unshift(sentence)
  }
  return tail.length > 0 ? [tail.join(" ")] : []
}

const isHeading = (unit: string) => /^#{1,6}\s/.test(unit)

export function chunkText(text: string): string[] {
  const trimmed = text.trim()
  if (estimateTokens(trimmed) <= chunking.singleChunkMaxTokens) return [trimmed]

  const units = trimmed
    .split(/\n\s*\n|\n(?=#{1,6}\s)/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .flatMap((paragraph) => toUnits(paragraph, chunking.targetTokens))

  const overlapBudget = Math.floor(
    chunking.targetTokens * chunking.overlapRatio
  )
  const chunks: { carried: string[]; fresh: string[] }[] = []
  let carried: string[] = []
  let fresh: string[] = []

  for (const unit of units) {
    const full = sumTokens([...carried, ...fresh, unit]) > chunking.targetTokens
    const headingBreak =
      isHeading(unit) && sumTokens(fresh) >= chunking.minTrailingTokens
    if (fresh.length > 0 && (full || headingBreak)) {
      chunks.push({ carried, fresh })
      carried = headingBreak ? [] : overlapFrom(fresh, overlapBudget)
      fresh = []
    }
    fresh.push(unit)
  }

  const previous = chunks.at(-1)
  if (previous && sumTokens(fresh) < chunking.minTrailingTokens) {
    previous.fresh.push(...fresh)
  } else if (fresh.length > 0) {
    chunks.push({ carried, fresh })
  }
  return chunks.map((chunk) => [...chunk.carried, ...chunk.fresh].join("\n\n"))
}
