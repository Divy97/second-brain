import { describe, expect, it } from "vitest"

import { safeNextPath } from "./safe-next-path"

describe("safeNextPath", () => {
  it("defaults to the notes home and preserves safe deep links", () => {
    expect(safeNextPath(null)).toBe("/home")
    expect(safeNextPath("https://example.com")).toBe("/home")
    expect(safeNextPath("//example.com")).toBe("/home")
    expect(safeNextPath("/items/123?from=ask#original")).toBe(
      "/items/123?from=ask#original"
    )
  })
})
