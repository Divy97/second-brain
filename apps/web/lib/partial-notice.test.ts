import { describe, expect, it } from "vitest"

import { partialNotice } from "./partial-notice"

describe("partialNotice", () => {
  it("explains a capture left partial by the daily limit and how to finish it", () => {
    expect(
      partialNotice({
        captureQuality: "partial",
        partialReason: "allowance_used",
      })
    ).toBe(
      "Saved, but the transcript or article text was not captured because today's limit is used. Reprocess tomorrow to complete it. It is still searchable by its link, title and note."
    )
  })

  it("says nothing for a partial capture with another cause", () => {
    expect(
      partialNotice({ captureQuality: "partial", partialReason: null })
    ).toBeNull()
  })

  it("says nothing for a full capture", () => {
    expect(
      partialNotice({ captureQuality: "full", partialReason: null })
    ).toBeNull()
  })
})
