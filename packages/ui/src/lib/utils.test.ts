import { describe, expect, it } from "vitest"

import { cn } from "@workspace/ui/lib/utils"

describe("cn", () => {
  it("joins class names and drops falsy values", () => {
    expect(cn("a", false, undefined, "b")).toBe("a b")
  })
})
