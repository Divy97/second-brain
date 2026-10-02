import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { testDb } from "./support/database.js"
import {
  request,
  saveOpenRouterKey,
  signUp,
  type Session,
} from "./support/http.js"
import {
  defaultRewrite,
  parseRewriteInput,
  stubOpenRouter,
  type OpenRouterStub,
} from "./support/openrouter-stub.js"
import { recordQueue, type QueueRecorder } from "./support/pipeline.js"

interface ItemDetail {
  id: string
  facts: { id: string; text: string }[]
}

interface ErrorBody {
  error: { code: string }
}

async function save(session: Session, text: string): Promise<string> {
  const response = await request("/items", {
    method: "POST",
    session,
    json: { text },
  })
  return (await response.json<{ id: string }>()).id
}

async function detail(session: Session, id: string): Promise<ItemDetail> {
  const response = await request(`/items/${id}`, { session })
  expect(response.status).toBe(200)
  return response.json<ItemDetail>()
}

describe("forgetting a fact", () => {
  let openRouter: OpenRouterStub
  let queue: QueueRecorder
  let session: Session

  beforeEach(async () => {
    openRouter = stubOpenRouter()
    queue = recordQueue()
    session = await signUp()
    await saveOpenRouterKey(session)
  })

  afterEach(() => {
    queue.restore()
    openRouter.restore()
  })

  async function saveWithFact(text: string): Promise<{
    itemId: string
    factId: string
  }> {
    openRouter.onChat("facts", () => ({ facts: [text] }))
    openRouter.onChat("fact_reconciliation", () => ({
      action: "ADD",
      existingFactId: null,
    }))
    const itemId = await save(session, text)
    await queue.processLatest()
    const [fact] = (await detail(session, itemId)).facts
    if (!fact) throw new Error("expected a fact to have been extracted")
    return { itemId, factId: fact.id }
  }

  it("lists the facts extracted from an item", async () => {
    const { itemId } = await saveWithFact("My dentist is Dr. Mehta.")

    expect(await detail(session, itemId)).toMatchObject({
      facts: [{ text: "My dentist is Dr. Mehta." }],
    })
  })

  it("lists no facts for an item that produced none", async () => {
    const itemId = await save(session, "a plain note with nothing extracted")
    await queue.processLatest()

    expect((await detail(session, itemId)).facts).toEqual([])
  })

  it("forgets a fact: it disappears from the item", async () => {
    const { itemId, factId } = await saveWithFact("My dentist is Dr. Mehta.")

    const response = await request(`/items/${itemId}/facts/${factId}`, {
      method: "DELETE",
      session,
    })

    expect(response.status).toBe(204)
    expect((await detail(session, itemId)).facts).toEqual([])
  })

  it("forgetting a fact never deletes its source item", async () => {
    const { itemId, factId } = await saveWithFact("My dentist is Dr. Mehta.")

    await request(`/items/${itemId}/facts/${factId}`, {
      method: "DELETE",
      session,
    })

    const item = await detail(session, itemId)
    expect(item.id).toBe(itemId)
  })

  it("404s forgetting another user's fact, and leaves it valid", async () => {
    const { itemId, factId } = await saveWithFact("My dentist is Dr. Mehta.")
    const other = await signUp()

    const response = await request(`/items/${itemId}/facts/${factId}`, {
      method: "DELETE",
      session: other,
    })

    expect(response.status).toBe(404)
    expect((await response.json<ErrorBody>()).error.code).toBe("not_found")
    expect(await detail(session, itemId)).toMatchObject({
      facts: [{ id: factId }],
    })
  })

  it("404s forgetting a fact through the wrong item", async () => {
    const { factId } = await saveWithFact("My dentist is Dr. Mehta.")
    const otherItemId = await save(session, "unrelated note")

    const response = await request(`/items/${otherItemId}/facts/${factId}`, {
      method: "DELETE",
      session,
    })

    expect(response.status).toBe(404)
  })

  it("404s forgetting an already-forgotten fact", async () => {
    const { itemId, factId } = await saveWithFact("My dentist is Dr. Mehta.")
    await request(`/items/${itemId}/facts/${factId}`, {
      method: "DELETE",
      session,
    })

    const response = await request(`/items/${itemId}/facts/${factId}`, {
      method: "DELETE",
      session,
    })

    expect(response.status).toBe(404)
  })

  it("404s forgetting a fact that doesn't exist", async () => {
    const itemId = await save(session, "unrelated note")

    const response = await request(
      `/items/${itemId}/facts/00000000-0000-0000-0000-000000000000`,
      { method: "DELETE", session }
    )

    expect(response.status).toBe(404)
  })

  it("stops a forgotten fact from surfacing in Ask", async () => {
    const { itemId } = await saveWithFact("My dentist is Dr. Mehta.")
    await testDb().execute(`delete from chunks where item_id = '${itemId}'`)
    const [fact] = (await detail(session, itemId)).facts
    if (!fact) throw new Error("expected a fact")

    await request(`/items/${itemId}/facts/${fact.id}`, {
      method: "DELETE",
      session,
    })

    openRouter.onChat("rewrite", (call) => ({
      ...defaultRewrite(parseRewriteInput(call).question),
      variants: ["dentist"],
      keywords: [],
    }))
    const thread = await request("/threads", {
      method: "POST",
      session,
      json: {},
    })
    const { id: threadId } = await thread.json<{ id: string }>()
    const response = await request(`/threads/${threadId}/messages`, {
      method: "POST",
      session,
      json: { question: "who is my dentist?", timezone: "Asia/Kolkata" },
    })
    const answer = await response.json<{
      text: string
      sources: { id: string }[]
    }>()
    expect(answer.text).toBe("I don't have anything saved about that.")
    expect(answer.sources).toEqual([])
  })

  it("still hides facts from Ask when their source item is deleted", async () => {
    const { itemId } = await saveWithFact("My dentist is Dr. Mehta.")
    await testDb().execute(`delete from chunks where item_id = '${itemId}'`)

    await request(`/items/${itemId}`, { method: "DELETE", session })

    openRouter.onChat("rewrite", (call) => ({
      ...defaultRewrite(parseRewriteInput(call).question),
      variants: ["dentist"],
      keywords: [],
    }))
    const thread = await request("/threads", {
      method: "POST",
      session,
      json: {},
    })
    const { id: threadId } = await thread.json<{ id: string }>()
    const response = await request(`/threads/${threadId}/messages`, {
      method: "POST",
      session,
      json: { question: "who is my dentist?", timezone: "Asia/Kolkata" },
    })
    const answer = await response.json<{
      text: string
      sources: { id: string }[]
    }>()
    expect(answer.text).toBe("I don't have anything saved about that.")
    expect(answer.sources).toEqual([])
  })
})
