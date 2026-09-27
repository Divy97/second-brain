import { describe, expect, it } from "vitest"

import { fuseRankings } from "../src/lib/ask/rrf.js"

describe("reciprocal rank fusion", () => {
  it("scores each document as the sum of 1 / (k + rank) over the lists it appears in", () => {
    const fused = fuseRankings([
      ["a", "b", "c"],
      ["b", "a"],
    ])

    expect(fused.map((entry) => entry.id)).toEqual(["a", "b", "c"])
    expect(fused[0]?.score).toBeCloseTo(1 / 61 + 1 / 62, 12)
    expect(fused[1]?.score).toBeCloseTo(1 / 62 + 1 / 61, 12)
    expect(fused[2]?.score).toBeCloseTo(1 / 63, 12)
  })

  it("lets agreement across lists beat a single top rank", () => {
    const fused = fuseRankings([
      ["solo", "shared"],
      ["other", "shared"],
      ["x", "shared"],
    ])

    expect(fused[0]?.id).toBe("shared")
  })

  it("breaks exact ties by id so the order is stable", () => {
    const swapped = fuseRankings([["q", "p"], ["p", "q"], ["r"]])
    expect(swapped.map((entry) => entry.id)).toEqual(["p", "q", "r"])

    const separate = fuseRankings([["m"], ["l"]])
    expect(separate.map((entry) => entry.id)).toEqual(["l", "m"])
  })

  it("counts a document once per list, at its first position, even if a list repeats it", () => {
    const fused = fuseRankings([["a", "a", "b"]])

    expect(fused.find((entry) => entry.id === "a")?.score).toBeCloseTo(
      1 / 61,
      12
    )
    expect(fused.find((entry) => entry.id === "b")?.score).toBeCloseTo(
      1 / 62,
      12
    )
  })

  it("uses the k it is given and returns nothing for no lists", () => {
    expect(fuseRankings([["a"]], 10)[0]?.score).toBeCloseTo(1 / 11, 12)
    expect(fuseRankings([])).toEqual([])
  })
})
