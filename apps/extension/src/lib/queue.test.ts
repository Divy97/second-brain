import { describe, expect, it } from "vitest"

describe("queue", () => {
  it("exports addToQueue", async () => {
    const { addToQueue } = await import("./queue")
    expect(typeof addToQueue).toBe("function")
  })

  it("exports processQueue", async () => {
    const { processQueue } = await import("./queue")
    expect(typeof processQueue).toBe("function")
  })
})
