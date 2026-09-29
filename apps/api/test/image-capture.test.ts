import { beforeEach, describe, expect, it, vi } from "vitest"

import { request, saveOpenRouterKey, signUp } from "./support/http.js"
import { stubOpenRouter } from "./support/openrouter-stub.js"
import { recordQueue } from "./support/pipeline.js"

const png = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9n0XcAAAAASUVORK5CYII="
  ),
  (character) => character.charCodeAt(0)
)

function upload(file: File, session: Awaited<ReturnType<typeof signUp>>) {
  const form = new FormData()
  form.set("file", file)
  return request("/items/image", { method: "POST", session, body: form })
}

describe("image capture", () => {
  beforeEach(() => vi.restoreAllMocks())

  it("saves a private image and reuses the item when the same bytes return", async () => {
    const owner = await signUp()
    const stranger = await signUp()
    const file = new File([png], "receipt.png", { type: "image/png" })

    const first = await upload(file, owner)
    expect(first.status).toBe(201)
    const item = await first.json<{
      id: string
      type: string
      status: string
    }>()
    expect(item).toMatchObject({ type: "image", status: "pending" })

    const source = await request(`/items/${item.id}/file`, { session: owner })
    expect(source.status).toBe(200)
    expect(source.headers.get("content-type")).toBe("image/png")
    expect(new Uint8Array(await source.arrayBuffer())).toEqual(png)
    expect(
      (await request(`/items/${item.id}/file`, { session: stranger })).status
    ).toBe(404)

    const duplicate = await upload(file, owner)
    expect(duplicate.status).toBe(200)
    expect((await duplicate.json<{ id: string }>()).id).toBe(item.id)
  })

  it("rejects invalid image content and oversized uploads", async () => {
    const session = await signUp()
    expect(
      (
        await upload(
          new File(["hello"], "fake.png", { type: "image/png" }),
          session
        )
      ).status
    ).toBe(400)
    expect(
      (
        await upload(
          new File([png], "wrong.gif", { type: "image/gif" }),
          session
        )
      ).status
    ).toBe(400)
    expect(
      (
        await upload(
          new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.png", {
            type: "image/png",
          }),
          session
        )
      ).status
    ).toBe(400)
  })

  it("extracts visible words and scene context for recall", async () => {
    const model = stubOpenRouter()
    const queue = recordQueue()
    try {
      model.onChat("image_extract", () => ({
        visibleText: "Take bus 28 to Alfama",
        description: "A handwritten Lisbon itinerary on yellow paper.",
      }))
      const session = await signUp()
      await saveOpenRouterKey(session)
      const response = await upload(
        new File([png], "itinerary.png", { type: "image/png" }),
        session
      )
      const { id } = await response.json<{ id: string }>()

      expect(await queue.processLatest()).toMatchObject({ outcome: "ready" })
      const detail = await request(`/items/${id}`, { session })
      expect(await detail.json()).toMatchObject({
        type: "image",
        captureQuality: "full",
        rawText:
          "Take bus 28 to Alfama\n\nA handwritten Lisbon itinerary on yellow paper.",
      })
      const imageCall = model.chatCalls.find(
        (call) => call.schemaName === "image_extract"
      )
      const sent = JSON.stringify(imageCall?.messages.at(-1)?.content)
      expect(sent).toContain('"type":"text"')
      expect(sent).toContain('"type":"image_url"')
      expect(sent).toMatch(/data:image\/png;base64,/)
      const thread = await request("/threads", {
        method: "POST",
        session,
        json: {},
      })
      const { id: threadId } = await thread.json<{ id: string }>()
      const answer = await request(`/threads/${threadId}/messages`, {
        method: "POST",
        session,
        json: { question: "Where do I take bus 28?", timezone: "UTC" },
      })
      expect(answer.status).toBe(200)
      expect(await answer.json()).toMatchObject({ sources: [{ id }] })
    } finally {
      queue.restore()
      model.restore()
    }
  })

  it("keeps the photo when vision fails and extracts it on retry", async () => {
    const model = stubOpenRouter()
    const queue = recordQueue()
    try {
      model.onChat("image_extract", () => ({
        visibleText: "Gate 12",
        description: "A boarding pass.",
      }))
      model.failChat(1)
      const session = await signUp()
      await saveOpenRouterKey(session)
      const response = await upload(
        new File([png], "pass.png", { type: "image/png" }),
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
        rawText: "Gate 12\n\nA boarding pass.",
      })
    } finally {
      queue.restore()
      model.restore()
    }
  })
})
