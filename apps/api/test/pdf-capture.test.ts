import { describe, expect, it } from "vitest"

import { request, saveOpenRouterKey, signUp } from "./support/http.js"
import { stubOpenRouter } from "./support/openrouter-stub.js"
import { recordQueue } from "./support/pipeline.js"

const pdf = new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF")

function upload(file: File, session: Awaited<ReturnType<typeof signUp>>) {
  const form = new FormData()
  form.set("file", file)
  return request("/items/pdf", { method: "POST", session, body: form })
}

describe("PDF capture", () => {
  it("saves the original privately and deduplicates repeated files", async () => {
    const owner = await signUp()
    const stranger = await signUp()
    const file = new File([pdf], "schedule.pdf", { type: "application/pdf" })
    const response = await upload(file, owner)
    expect(response.status).toBe(201)
    const item = await response.json<{ id: string; type: string }>()
    expect(item.type).toBe("pdf")
    const original = await request(`/items/${item.id}/file`, { session: owner })
    expect(original.status).toBe(200)
    expect(new Uint8Array(await original.arrayBuffer())).toEqual(pdf)
    expect(
      (await request(`/items/${item.id}/file`, { session: stranger })).status
    ).toBe(404)
    expect((await upload(file, owner)).status).toBe(200)
  })

  it("rejects unsupported, fake, and oversized PDFs", async () => {
    const session = await signUp()
    expect(
      (
        await upload(
          new File(["hello"], "a.txt", { type: "text/plain" }),
          session
        )
      ).status
    ).toBe(400)
    expect(
      (
        await upload(
          new File(["hello"], "fake.pdf", { type: "application/pdf" }),
          session
        )
      ).status
    ).toBe(400)
    expect(
      (
        await upload(
          new File([new Uint8Array(25 * 1024 * 1024 + 1)], "big.pdf", {
            type: "application/pdf",
          }),
          session
        )
      ).status
    ).toBe(400)
  })

  it("indexes extracted PDF text", async () => {
    const model = stubOpenRouter()
    model.onChat("pdf_extract", () => ({
      text: "Meeting in Kyoto on Tuesday.",
    }))
    const queue = recordQueue()
    try {
      const session = await signUp()
      await saveOpenRouterKey(session)
      const response = await upload(
        new File([pdf], "schedule.pdf", { type: "application/pdf" }),
        session
      )
      const { id } = await response.json<{ id: string }>()
      expect(await queue.processLatest()).toMatchObject({ outcome: "ready" })
      expect(
        await (await request(`/items/${id}`, { session })).json()
      ).toMatchObject({
        rawText: "Meeting in Kyoto on Tuesday.",
        captureQuality: "full",
      })
      expect(
        model.chatCalls.some((call) => call.schemaName === "pdf_extract")
      ).toBe(true)
    } finally {
      queue.restore()
      model.restore()
    }
  })

  it("keeps the PDF when extraction fails and extracts it on retry", async () => {
    const model = stubOpenRouter()
    model.onChat("pdf_extract", () => ({
      text: "Gate 12 boarding pass.",
    }))
    model.failChat(1)
    const queue = recordQueue()
    try {
      const session = await signUp()
      await saveOpenRouterKey(session)
      const response = await upload(
        new File([pdf], "boarding-pass.pdf", { type: "application/pdf" }),
        session
      )
      const { id } = await response.json<{ id: string }>()
      expect(await queue.processLatest()).toMatchObject({ outcome: "failed" })
      expect((await request(`/items/${id}/file`, { session })).status).toBe(200)
      expect(
        (await request(`/items/${id}/retry`, { session, method: "POST" }))
          .status
      ).toBe(200)
      expect(await queue.processLatest()).toMatchObject({ outcome: "ready" })
      expect(
        await (await request(`/items/${id}`, { session })).json()
      ).toMatchObject({
        rawText: "Gate 12 boarding pass.",
      })
    } finally {
      queue.restore()
      model.restore()
    }
  })
})
