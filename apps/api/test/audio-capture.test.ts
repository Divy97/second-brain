import { env } from "cloudflare:workers"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { listFileDeletions } from "@workspace/db"

import { testDb } from "./support/database.js"
import { request, saveOpenRouterKey, signUp } from "./support/http.js"
import { stubOpenRouter } from "./support/openrouter-stub.js"
import { recordQueue } from "./support/pipeline.js"
import { deletePendingFiles } from "../src/lib/items/delete-files.js"

const wavBytes = new Uint8Array([
  82, 73, 70, 70, 36, 0, 0, 0, 87, 65, 86, 69, 102, 109, 116, 32,
])

function upload(file: File, session: Awaited<ReturnType<typeof signUp>>) {
  const form = new FormData()
  form.set("file", file)
  return request("/items/audio", { method: "POST", session, body: form })
}

describe("audio capture", () => {
  beforeEach(() => vi.restoreAllMocks())

  it("stores an original before processing and serves it only to its owner", async () => {
    const owner = await signUp()
    const stranger = await signUp()
    const send = vi.spyOn(env.ITEMS_QUEUE, "send")
    const file = new File([wavBytes], "memo.wav", { type: "audio/wav" })

    const response = await upload(file, owner)

    expect(response.status).toBe(201)
    const item = await response.json<{
      id: string
      status: string
      type: string
    }>()
    expect(item).toMatchObject({ status: "pending", type: "voice" })
    expect(send).toHaveBeenCalledWith({ itemId: item.id, run: 0 })

    const source = await request(`/items/${item.id}/file`, { session: owner })
    expect(source.status).toBe(200)
    expect(source.headers.get("content-type")).toBe("audio/wav")
    expect(new Uint8Array(await source.arrayBuffer())).toEqual(wavBytes)
    expect(
      (await request(`/items/${item.id}/file`, { session: stranger })).status
    ).toBe(404)
    const edit = await request(`/items/${item.id}`, {
      method: "PATCH",
      session: owner,
      json: { text: "replace audio" },
    })
    expect(edit.status).toBe(409)

    const duplicate = await upload(file, owner)
    expect(duplicate.status).toBe(200)
    expect((await duplicate.json<{ id: string }>()).id).toBe(item.id)
  })

  it("rejects unsupported and empty files without creating an item", async () => {
    const session = await signUp()
    const unsupported = await upload(
      new File(["hello"], "note.txt", { type: "text/plain" }),
      session
    )
    const empty = await upload(
      new File([], "memo.wav", { type: "audio/wav" }),
      session
    )
    const spoofed = await upload(
      new File(["not a wave"], "memo.wav", { type: "audio/wav" }),
      session
    )
    const oversized = await upload(
      new File([new Uint8Array(25 * 1024 * 1024 + 1)], "huge.wav", {
        type: "audio/wav",
      }),
      session
    )

    expect(unsupported.status).toBe(400)
    expect(empty.status).toBe(400)
    expect(spoofed.status).toBe(400)
    expect(oversized.status).toBe(400)
    const list = await request("/items", { session })
    expect((await list.json<{ items: unknown[] }>()).items).toEqual([])
  })

  it("keeps failed audio for retry after a key is added, and deletes the private file", async () => {
    const model = stubOpenRouter()
    const queue = recordQueue()
    try {
      const session = await signUp()
      const response = await upload(
        new File([wavBytes], "retry.wav", { type: "audio/wav" }),
        session
      )
      const item = await response.json<{ id: string }>()
      expect(await queue.processLatest()).toMatchObject({
        outcome: "failed",
        reason: "missing_key",
      })
      expect(
        (await request(`/items/${item.id}/file`, { session })).status
      ).toBe(200)

      await saveOpenRouterKey(session)
      expect(
        (await request(`/items/${item.id}/retry`, { session, method: "POST" }))
          .status
      ).toBe(200)
      expect(await queue.processLatest()).toMatchObject({ outcome: "ready" })

      expect(
        (await request(`/items/${item.id}`, { session, method: "DELETE" }))
          .status
      ).toBe(204)
      expect(
        (await request(`/items/${item.id}/file`, { session })).status
      ).toBe(404)
      const objects = await env.ITEM_FILES.list({
        prefix: `${session.userId}/`,
      })
      expect(objects.objects).toEqual([])
    } finally {
      queue.restore()
      model.restore()
    }
  })

  it("retries private file deletion after storage fails", async () => {
    const session = await signUp()
    const response = await upload(
      new File([wavBytes], "remove.wav", { type: "audio/wav" }),
      session
    )
    const { id } = await response.json<{ id: string }>()
    const failedDelete = vi
      .spyOn(env.ITEM_FILES, "delete")
      .mockRejectedValueOnce(new Error("storage unavailable"))
    try {
      expect(
        (await request(`/items/${id}`, { method: "DELETE", session })).status
      ).toBe(204)
      expect(await listFileDeletions(testDb(), 10)).toHaveLength(1)
    } finally {
      failedDelete.mockRestore()
    }
    await deletePendingFiles(testDb(), env.ITEM_FILES)
    expect(await listFileDeletions(testDb(), 10)).toEqual([])
    expect(
      (await env.ITEM_FILES.list({ prefix: `${session.userId}/` })).objects
    ).toEqual([])
  })

  it("transcribes audio and indexes the words for recall", async () => {
    const model = stubOpenRouter()
    const queue = recordQueue()
    try {
      const session = await signUp()
      await saveOpenRouterKey(session)
      const response = await upload(
        new File([wavBytes], "tulips.wav", { type: "audio/wav" }),
        session
      )
      expect(response.status).toBe(201)
      const item = await response.json<{ id: string }>()

      expect(await queue.processLatest()).toMatchObject({ outcome: "ready" })
      const detail = await request(`/items/${item.id}`, { session })
      expect(await detail.json()).toMatchObject({
        status: "ready",
        rawText: "Remember to buy tulips on Friday.",
        captureQuality: "full",
        fileName: "tulips.wav",
      })
      expect(
        model.calls.some((call) => call.url.endsWith("/audio/transcriptions"))
      ).toBe(true)
      const thread = await request("/threads", {
        method: "POST",
        session,
        json: {},
      })
      const { id: threadId } = await thread.json<{ id: string }>()
      const answer = await request(`/threads/${threadId}/messages`, {
        method: "POST",
        session,
        json: { question: "When should I buy tulips?", timezone: "UTC" },
      })
      expect(answer.status).toBe(200)
      expect(await answer.json()).toMatchObject({
        text: "Remember to buy tulips on Friday.",
        sources: [{ id: item.id }],
      })
    } finally {
      queue.restore()
      model.restore()
    }
  })

  it("reuses a saved transcript when enrichment fails and is retried", async () => {
    const model = stubOpenRouter()
    const queue = recordQueue()
    try {
      const session = await signUp()
      await saveOpenRouterKey(session)
      const response = await upload(
        new File([wavBytes], "retry-enrich.wav", { type: "audio/wav" }),
        session
      )
      const { id } = await response.json<{ id: string }>()
      model.failChat(1)
      expect(await queue.processLatest()).toMatchObject({ outcome: "failed" })
      const transcriptionCalls = () =>
        model.calls.filter((call) => call.url.endsWith("/audio/transcriptions"))
      expect(transcriptionCalls()).toHaveLength(1)

      const retry = await request(`/items/${id}/retry`, {
        method: "POST",
        session,
      })
      expect(retry.status).toBe(200)
      expect(await queue.processLatest()).toMatchObject({ outcome: "ready" })
      expect(transcriptionCalls()).toHaveLength(1)
    } finally {
      queue.restore()
      model.restore()
    }
  })
})
