export interface FusedResult {
  id: string
  score: number
}

// Reciprocal Rank Fusion (Cormack, Clarke & Büttcher 2009): Σ 1 / (k + rank), rank from 1.
// Exact ties only occur for identical rank multisets, so the id breaks them.
export function fuseRankings(lists: string[][], k = 60): FusedResult[] {
  const scores = new Map<string, number>()
  for (const list of lists) {
    const distinct = [...new Set(list)]
    distinct.forEach((id, index) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1))
    })
  }
  return [...scores]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1))
}
