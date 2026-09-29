import { describe, expect, it } from "vitest"

import { formatFileSize } from "./format-file-size"

describe("formatFileSize", () => {
  it("labels bytes, kilobytes, and megabytes the way a person reads them", () => {
    expect(formatFileSize(512)).toBe("512 B")
    expect(formatFileSize(68_000)).toBe("66 KB")
    expect(formatFileSize(3_400_000)).toBe("3.2 MB")
    expect(formatFileSize(25 * 1024 * 1024)).toBe("25 MB")
  })
})
