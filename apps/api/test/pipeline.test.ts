import { env } from "cloudflare:workers"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { connect } from "@workspace/db"

import {
  request,
  saveOpenRouterKey,
  signUp,
  type Session,
} from "./support/http.js"
import {
  defaultEnrichment,
  parseEnrichmentInput,
  stubOpenRouter,
  type OpenRouterStub,
} from "./support/openrouter-stub.js"
import { recordQueue, type QueueRecorder } from "./support/pipeline.js"

interface ItemDetail {
  id: string
  status: "pending" | "processing" | "ready" | "failed"
  kind: string | null
  title: string | null
  summary: string | null
  cleanText: string | null
  rawText: string
  language: string | null
  tags: string[]
  entities: { name: string; type: string }[]
  failureReason: string | null
  error: string | null
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

describe("processing a saved note", () => {
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

  it("turns a pending note ready with title, English summary, clean text, kind, tags, entities and language", async () => {
    openRouter.onChat("enrichment", () => ({
      title: "Dr. Mehta appointment",
      summary: "Meet Dr. Mehta tomorrow morning.",
      cleanText: "कल सुबह डॉक्टर मेहता से मिलना है",
      kind: "fact",
      language: "hi",
      tags: ["health", "appointments"],
      entities: [{ name: "Dr. Mehta", type: "person" }],
    }))
    const id = await save(session, "कल सुबह डॉक्टर मेहता से मिलना है")
    expect((await detail(session, id)).status).toBe("pending")

    const outcome = await queue.processLatest()

    expect(outcome).toMatchObject({ outcome: "ready", chunkCount: 1 })
    expect(await detail(session, id)).toMatchObject({
      status: "ready",
      title: "Dr. Mehta appointment",
      summary: "Meet Dr. Mehta tomorrow morning.",
      rawText: "कल सुबह डॉक्टर मेहता से मिलना है",
      kind: "fact",
      language: "hi",
      tags: ["health", "appointments"],
      entities: [{ name: "Dr. Mehta", type: "person" }],
      failureReason: null,
    })
    const list = await request("/items", { session })
    const [first] = (
      await list.json<{ items: { title: string; kind: string }[] }>()
    ).items
    expect(first).toMatchObject({
      title: "Dr. Mehta appointment",
      kind: "fact",
    })
  })

  it("keeps the raw text untouched while the clean text fixes a dictation error", async () => {
    openRouter.onChat("enrichment", (call) => ({
      ...defaultEnrichment(parseEnrichmentInput(call).note),
      cleanText: "I tried the new agentic browser today.",
    }))
    const id = await save(session, "I tried the new Asian tech browser today.")

    await queue.processLatest()

    const item = await detail(session, id)
    expect(item.rawText).toBe("I tried the new Asian tech browser today.")
    expect(item.cleanText).toBe("I tried the new agentic browser today.")
  })

  it("makes one chunk for a short note and several for a long one, each embedded with title and summary", async () => {
    await save(session, "Short thought about gardens.")
    const short = await queue.processLatest()
    const paragraph =
      "The history of printing spans many centuries and continents, beginning with woodblocks in East Asia and moving through movable type, the press, lithography and the digital era that followed. "
    const longText = Array.from(
      { length: 24 },
      (_, index) => `Section ${index + 1}. ${paragraph.repeat(2)}`
    ).join("\n\n")
    openRouter.embeddedInputs.length = 0
    await save(session, longText)
    const long = await queue.processLatest()

    expect(short).toMatchObject({ outcome: "ready", chunkCount: 1 })
    expect(long.outcome).toBe("ready")
    expect(long.outcome === "ready" && long.chunkCount).toBeGreaterThan(3)
    const chunkInputs = openRouter.embeddedInputs.slice(1)
    expect(chunkInputs).toHaveLength(
      long.outcome === "ready" ? long.chunkCount : 0
    )
    for (const input of chunkInputs) {
      expect(input).toMatch(
        /^Section 1 The history of printing — A note about /
      )
    }
  })

  it("records the embedding model and dimension on every chunk", async () => {
    const id = await save(session, "A note to index.")
    await queue.processLatest()

    const { db } = connect(env.HYPERDRIVE.connectionString)
    const rows = await db.execute<{
      embedding_model: string
      embedding_dimensions: number
    }>(
      `select embedding_model, embedding_dimensions from chunks where item_id = '${id}'`
    )

    expect(rows.length).toBe(1)
    expect(rows[0]).toEqual({
      embedding_model: "baai/bge-m3",
      embedding_dimensions: 1024,
    })
  })

  it("feeds the tags of similar existing notes into enrichment", async () => {
    openRouter.onChat("enrichment", (call) => ({
      ...defaultEnrichment(parseEnrichmentInput(call).note),
      tags: ["espresso", "coffee-gear"],
    }))
    await save(session, "Dialling in espresso grind size on the new grinder")
    await queue.processLatest()
    openRouter.onChat("enrichment", (call) =>
      defaultEnrichment(parseEnrichmentInput(call).note)
    )
    await save(session, "Tulips need cold weather before they bloom")
    await queue.processLatest()
    openRouter.chatCalls.length = 0

    await save(session, "Espresso grind size notes for the grinder")
    await queue.processLatest()

    const [enrichment] = openRouter.chatCalls
    expect(enrichment?.schemaName).toBe("enrichment")
    const input = enrichment ? parseEnrichmentInput(enrichment) : null
    expect(input?.neighbourTags).toEqual(
      expect.arrayContaining(["espresso", "coffee-gear"])
    )
  })

  it("fails with missing_key when no key is saved, and a retry after saving one succeeds", async () => {
    const keyless = await signUp()
    const id = await save(keyless, "A thought with nowhere to go")

    const outcome = await queue.processLatest()

    expect(outcome).toMatchObject({ outcome: "failed", reason: "missing_key" })
    expect(await detail(keyless, id)).toMatchObject({
      status: "failed",
      failureReason: "missing_key",
    })
    expect(openRouter.chatCalls).toHaveLength(0)

    await saveOpenRouterKey(keyless)
    const retry = await request(`/items/${id}/retry`, {
      method: "POST",
      session: keyless,
    })
    expect(retry.status).toBe(200)
    expect((await retry.json<ItemDetail>()).status).toBe("pending")
    await queue.processLatest()
    expect((await detail(keyless, id)).status).toBe("ready")
  })

  it("fails with the model's error visible, and retry runs the pipeline again", async () => {
    openRouter.failChat(10, 503)
    const id = await save(session, "Enrichment will fail for this one")

    const outcome = await queue.processLatest()

    expect(outcome).toMatchObject({ outcome: "failed", reason: "model_error" })
    const failed = await detail(session, id)
    expect(failed.status).toBe("failed")
    expect(failed.failureReason).toBe("model_error")
    expect(failed.error).toContain("Provider returned error")

    openRouter.failChat(0)
    await request(`/items/${id}/retry`, { method: "POST", session })
    await queue.processLatest()
    expect(await detail(session, id)).toMatchObject({
      status: "ready",
      failureReason: null,
      error: null,
    })
  })

  it("fails with invalid_key when OpenRouter rejects the saved key", async () => {
    const id = await save(session, "Key revoked after saving")
    openRouter.rejectKeys(["sk-or-v1-test-key-cafe1234"])

    const outcome = await queue.processLatest()

    expect(outcome).toMatchObject({ outcome: "failed", reason: "invalid_key" })
    expect((await detail(session, id)).failureReason).toBe("invalid_key")
  })

  it("reprocesses a ready note on demand and it stays ready", async () => {
    const id = await save(session, "Reprocess me later")
    await queue.processLatest()
    openRouter.chatCalls.length = 0

    const response = await request(`/items/${id}/reprocess`, {
      method: "POST",
      session,
    })
    expect(response.status).toBe(200)
    await queue.processLatest()

    expect(openRouter.chatCalls).toHaveLength(1)
    expect((await detail(session, id)).status).toBe("ready")
  })

  it("re-runs the pipeline after an edit and updates the derived fields", async () => {
    const id = await save(session, "Original wording about sailing")
    await queue.processLatest()

    await request(`/items/${id}`, {
      method: "PATCH",
      session,
      json: { text: "Rewritten wording about mountains" },
    })
    expect((await detail(session, id)).title).toBeNull()
    await queue.processLatest()

    expect(await detail(session, id)).toMatchObject({
      status: "ready",
      title: "Rewritten wording about mountains",
    })
  })

  it("skips a stale run superseded by an edit", async () => {
    const id = await save(session, "First version")
    const [staleRun] = queue.messages.splice(0)
    await request(`/items/${id}`, {
      method: "PATCH",
      session,
      json: { text: "Second version" },
    })
    queue.messages.unshift(staleRun ?? { itemId: id, run: 0 })

    const [stale, current] = await queue.processAll()

    expect(stale).toEqual({ outcome: "skipped" })
    expect(current).toMatchObject({ outcome: "ready" })
    expect((await detail(session, id)).title).toBe("Second version")
  })

  it("does not process a note deleted before its turn", async () => {
    const id = await save(session, "Gone before processing")
    await request(`/items/${id}`, { method: "DELETE", session })

    const outcome = await queue.processLatest()

    expect(outcome).toEqual({ outcome: "skipped" })
    expect(openRouter.chatCalls).toHaveLength(0)
  })

  it("refuses retry for a ready note and reprocess for one that is not settled", async () => {
    const id = await save(session, "Still pending")
    const readyId = await save(session, "Already ready")
    queue.messages.splice(0, 1)
    await queue.processLatest()

    const retry = await request(`/items/${readyId}/retry`, {
      method: "POST",
      session,
    })
    const reprocess = await request(`/items/${id}/reprocess`, {
      method: "POST",
      session,
    })

    expect(retry.status).toBe(409)
    expect(reprocess.status).toBe(409)
  })

  it("lets a note stuck in processing be retried once its run has stalled", async () => {
    const id = await save(session, "A run that died halfway")
    const [lostRun] = queue.messages.splice(0)
    const { db } = connect(env.HYPERDRIVE.connectionString)
    await db.execute(
      `update items set status = 'processing', updated_at = now() - interval '11 minutes' where id = '${id}'`
    )

    const retry = await request(`/items/${id}/retry`, {
      method: "POST",
      session,
    })

    expect(retry.status).toBe(200)
    expect(queue.messages[0]?.run).toBe((lostRun?.run ?? 0) + 1)
    await queue.processLatest()
    expect((await detail(session, id)).status).toBe("ready")
  })

  it("does not retry a note that is actively processing", async () => {
    const id = await save(session, "Busy right now")
    const { db } = connect(env.HYPERDRIVE.connectionString)
    await db.execute(
      `update items set status = 'processing' where id = '${id}'`
    )

    const retry = await request(`/items/${id}/retry`, {
      method: "POST",
      session,
    })

    expect(retry.status).toBe(409)
  })
})
