import { env } from "cloudflare:workers"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { asDevice, connectDevice } from "./support/extension.js"
import { request, saveOpenRouterKey, signUp } from "./support/http.js"
import {
  stubOpenRouter,
  type OpenRouterStub,
} from "./support/openrouter-stub.js"
import { recordQueue, type QueueRecorder } from "./support/pipeline.js"

const pageText =
  "The yellow door bookshop in Alfama sells second-hand maps of Lisbon."

const neverFetch: typeof fetch = (input) =>
  Promise.reject(
    new Error(
      `the pipeline fetched ${new Request(input).url} for a browser page`
    )
  )

interface ItemBody {
  status: string
  rawText: string
  sourceUrl: string
  captureQuality: string
}

describe("indexing pages the extension captured", () => {
  let openRouter: OpenRouterStub
  let queue: QueueRecorder

  beforeEach(() => {
    openRouter = stubOpenRouter()
    queue = recordQueue({ fetchPage: neverFetch })
  })

  afterEach(() => {
    queue.restore()
    openRouter.restore()
  })

  async function storedPage() {
    const session = await signUp()
    await saveOpenRouterKey(session)
    const { token } = await connectDevice(session)
    await asDevice(token, "/settings", {
      method: "PUT",
      json: {
        passiveEnabled: true,
        passiveMode: "store",
        paused: false,
        blocklist: [],
      },
    })
    const response = await asDevice(token, "/captures", {
      method: "POST",
      json: {
        url: "https://news.example.com/members/lisbon",
        title: "Lisbon",
        text: pageText,
        trigger: "passive",
      },
    })
    const { id } = await response.json<{ id: string }>()
    return { session, token, id }
  }

  async function item(session: Awaited<ReturnType<typeof signUp>>, id: string) {
    return (await request(`/items/${id}`, { session })).json<ItemBody>()
  }

  it("does not queue a stored page until the user indexes it", async () => {
    await storedPage()

    expect(queue.messages).toHaveLength(0)
  })

  it("turns an indexed page into a searchable item without fetching its link", async () => {
    const { session, token, id } = await storedPage()

    await asDevice(token, `/stored/${id}/index`, { method: "POST" })
    const outcome = await queue.processLatest()

    expect(outcome).toMatchObject({ outcome: "ready" })
    expect(await item(session, id)).toMatchObject({
      status: "ready",
      rawText: pageText,
      captureQuality: "full",
    })
  })

  it("processes every page of a bulk index", async () => {
    const { token, id } = await storedPage()

    await asDevice(token, "/stored/index", {
      method: "POST",
      json: { ids: [id] },
    })
    const outcomes = await queue.processAll()

    expect(outcomes).toEqual([expect.objectContaining({ outcome: "ready" })])
  })

  it("keeps the browser's text when an indexed page is reprocessed", async () => {
    const { session, token, id } = await storedPage()
    await asDevice(token, `/stored/${id}/index`, { method: "POST" })
    await queue.processLatest()

    const response = await request(`/items/${id}/reprocess`, {
      method: "POST",
      session,
    })
    expect(response.status).toBe(200)
    const outcome = await queue.processLatest()

    expect(outcome).toMatchObject({ outcome: "ready" })
    expect((await item(session, id)).rawText).toBe(pageText)
  })

  it("keeps the browser's text when a failed page is retried", async () => {
    const session = await signUp()
    const { token } = await connectDevice(session)
    const response = await asDevice(token, "/captures", {
      method: "POST",
      json: {
        url: "https://news.example.com/members/lisbon",
        title: "Lisbon",
        text: pageText,
        trigger: "manual",
      },
    })
    const { id } = await response.json<{ id: string }>()
    expect(await queue.processLatest()).toMatchObject({ outcome: "failed" })

    await saveOpenRouterKey(session)
    const retry = await request(`/items/${id}/retry`, {
      method: "POST",
      session,
    })
    expect(retry.status).toBe(200)

    expect(await queue.processLatest()).toMatchObject({ outcome: "ready" })
    expect((await item(session, id)).rawText).toBe(pageText)
  })

  it("queues the page when indexing is repeated after the queue refused it", async () => {
    const { token, id } = await storedPage()
    queue.restore()
    const refusing = vi
      .spyOn(env.ITEMS_QUEUE, "sendBatch")
      .mockRejectedValueOnce(new Error("queue down"))
    const first = await asDevice(token, `/stored/${id}/index`, {
      method: "POST",
    })
    expect(first.status).toBe(503)
    refusing.mockRestore()
    queue = recordQueue({ fetchPage: neverFetch })

    const second = await asDevice(token, `/stored/${id}/index`, {
      method: "POST",
    })

    expect(second.status).toBe(200)
    expect(queue.messages).toHaveLength(1)
    expect(await queue.processLatest()).toMatchObject({ outcome: "ready" })
  })
})
