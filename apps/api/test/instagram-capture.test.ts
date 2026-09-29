import { describe, expect, it } from "vitest"

import {
  stubExtractionProviders,
  testTranscriptKey,
} from "./support/extraction-stub.js"
import {
  request,
  saveOpenRouterKey,
  signUp,
  type Session,
} from "./support/http.js"
import { stubOpenRouter } from "./support/openrouter-stub.js"
import { recordQueue } from "./support/pipeline.js"

const shortcode = "C1a2B3c4D5e"
const reel = `https://www.instagram.com/reel/${shortcode}/`

interface ItemBody {
  id: string
  status: string
  sourceUrl: string | null
  captureQuality: string | null
  rawText: string
  captures: string[]
}

const caption = {
  title: null,
  description: "Three minutes on why sourdough starter stalls in winter.",
  author: "Bench Notes",
  tags: ["sourdough", "baking"],
}

function saveUrl(session: Session, url: string, note?: string) {
  return request("/items/url", { method: "POST", session, json: { url, note } })
}

function saveTranscriptKey(session: Session) {
  return request("/keys/transcript", {
    method: "PUT",
    session,
    json: { key: testTranscriptKey },
  })
}

const getItem = async (session: Session, id: string) =>
  (await request(`/items/${id}`, { session })).json<ItemBody>()

describe("Instagram capture", () => {
  it("makes the caption searchable", async () => {
    const model = stubOpenRouter()
    const providers = stubExtractionProviders()
    providers.acceptKeys([testTranscriptKey])
    providers.metadataReturns(reel, caption)
    const queue = recordQueue()
    try {
      const session = await signUp()
      await saveOpenRouterKey(session)
      await saveTranscriptKey(session)

      const { id } = await (
        await saveUrl(session, reel, "Try this")
      ).json<{
        id: string
      }>()
      expect(await queue.processLatest()).toMatchObject({ outcome: "ready" })

      const item = await getItem(session, id)
      expect(item.captureQuality).toBe("full")
      expect(item.rawText).toContain("sourdough starter stalls")
      expect(item.rawText).toContain("Bench Notes")

      const thread = await request("/threads", {
        method: "POST",
        session,
        json: {},
      })
      const { id: threadId } = await thread.json<{ id: string }>()
      const answer = await request(`/threads/${threadId}/messages`, {
        method: "POST",
        session,
        json: {
          question: "what was that reel about sourdough?",
          timezone: "Asia/Kolkata",
        },
      })
      expect(answer.status).toBe(200)
      const message = await answer.json<{ sources: { id: string }[] }>()
      expect(message.sources.map((source) => source.id)).toContain(id)
    } finally {
      queue.restore()
      providers.restore()
      model.restore()
    }
  })

  it("keeps the link and note visible without a transcript key", async () => {
    const model = stubOpenRouter()
    const providers = stubExtractionProviders()
    providers.metadataReturns(reel, caption)
    const queue = recordQueue()
    try {
      const session = await signUp()
      await saveOpenRouterKey(session)

      const { id } = await (
        await saveUrl(session, reel, "Bread thing to try")
      ).json<{ id: string }>()
      expect(await queue.processLatest()).toMatchObject({ outcome: "ready" })

      const item = await getItem(session, id)
      expect(item.captureQuality).toBe("partial")
      expect(item.rawText).toContain("Bread thing to try")
      expect(item.rawText).toContain(shortcode)
      expect(
        providers.calls.filter((call) => call.url.includes("/v1/metadata"))
      ).toHaveLength(0)
    } finally {
      queue.restore()
      providers.restore()
      model.restore()
    }
  })

  it("never spends a credit on a transcript Instagram cannot serve", async () => {
    const model = stubOpenRouter()
    const providers = stubExtractionProviders()
    providers.acceptKeys([testTranscriptKey])
    providers.metadataReturns(reel, caption)
    const queue = recordQueue()
    try {
      const session = await signUp()
      await saveOpenRouterKey(session)
      await saveTranscriptKey(session)

      await saveUrl(session, reel)
      expect(await queue.processLatest()).toMatchObject({ outcome: "ready" })

      expect(
        providers.calls.filter((call) => call.url.includes("/v1/transcript"))
      ).toHaveLength(0)
    } finally {
      queue.restore()
      providers.restore()
      model.restore()
    }
  })

  it("stays partial when the post is private or deleted", async () => {
    const model = stubOpenRouter()
    const providers = stubExtractionProviders()
    providers.acceptKeys([testTranscriptKey])
    const queue = recordQueue()
    try {
      const session = await signUp()
      await saveOpenRouterKey(session)
      await saveTranscriptKey(session)

      const { id } = await (
        await saveUrl(session, reel, "Saw this before it vanished")
      ).json<{ id: string }>()
      expect(await queue.processLatest()).toMatchObject({ outcome: "ready" })

      const item = await getItem(session, id)
      expect(item.status).toBe("ready")
      expect(item.captureQuality).toBe("partial")
      expect(item.rawText).toContain("Saw this before it vanished")
    } finally {
      queue.restore()
      providers.restore()
      model.restore()
    }
  })

  it("completes a partial post after the key is added", async () => {
    const model = stubOpenRouter()
    const providers = stubExtractionProviders()
    providers.acceptKeys([testTranscriptKey])
    providers.metadataReturns(reel, caption)
    const queue = recordQueue()
    try {
      const session = await signUp()
      await saveOpenRouterKey(session)

      const { id } = await (await saveUrl(session, reel)).json<{ id: string }>()
      expect(await queue.processLatest()).toMatchObject({ outcome: "ready" })
      expect((await getItem(session, id)).captureQuality).toBe("partial")

      expect((await saveTranscriptKey(session)).status).toBe(200)
      expect(
        (await request(`/items/${id}/reprocess`, { session, method: "POST" }))
          .status
      ).toBe(200)
      expect(await queue.processLatest()).toMatchObject({ outcome: "ready" })

      const completed = await getItem(session, id)
      expect(completed.captureQuality).toBe("full")
      expect(completed.rawText).toContain("sourdough starter stalls")
    } finally {
      queue.restore()
      providers.restore()
      model.restore()
    }
  })

  it("surfaces a rejected key rather than silently degrading", async () => {
    const model = stubOpenRouter()
    const providers = stubExtractionProviders()
    providers.acceptKeys([testTranscriptKey])
    providers.metadataReturns(reel, caption)
    const queue = recordQueue()
    try {
      const session = await signUp()
      await saveOpenRouterKey(session)
      await saveTranscriptKey(session)
      providers.revokeKeys([testTranscriptKey])

      const { id } = await (await saveUrl(session, reel)).json<{ id: string }>()
      expect(await queue.processLatest()).toMatchObject({
        outcome: "failed",
        reason: "invalid_key",
      })

      const failed = await (
        await request(`/items/${id}`, { session })
      ).json<ItemBody & { error: string | null }>()
      expect(failed.error).toContain("transcript key was rejected")
    } finally {
      queue.restore()
      providers.restore()
      model.restore()
    }
  })

  it("treats a post and a reel of the same media as one item", async () => {
    const model = stubOpenRouter()
    const providers = stubExtractionProviders()
    const queue = recordQueue()
    try {
      const session = await signUp()
      await saveOpenRouterKey(session)

      const first = await saveUrl(
        session,
        `https://www.instagram.com/p/${shortcode}/?igsh=ABC`
      )
      expect(first.status).toBe(201)
      const { id } = await first.json<{ id: string }>()
      expect(await queue.processLatest()).toMatchObject({ outcome: "ready" })

      const second = await saveUrl(session, reel)
      expect(second.status).toBe(200)
      expect((await second.json<{ id: string }>()).id).toBe(id)

      const item = await getItem(session, id)
      expect(item.captures).toHaveLength(2)
      expect(item.sourceUrl).toBe(
        `https://www.instagram.com/p/${shortcode}/?igsh=ABC`
      )
    } finally {
      queue.restore()
      providers.restore()
      model.restore()
    }
  })

  it("sends an unrecognised instagram.com link down the article path", async () => {
    const model = stubOpenRouter()
    const providers = stubExtractionProviders()
    const queue = recordQueue({
      fetchPage: () =>
        Promise.resolve(
          new Response(
            "<html><head><title>Login</title></head><body>Log in to continue.</body></html>",
            { headers: { "content-type": "text/html" } }
          )
        ),
    })
    try {
      const session = await signUp()
      await saveOpenRouterKey(session)

      const { id } = await (
        await saveUrl(session, "https://www.instagram.com/stories/someone/123")
      ).json<{ id: string }>()
      expect(await queue.processLatest()).toMatchObject({ outcome: "ready" })

      const item = await getItem(session, id)
      expect(item.captureQuality).toBe("partial")
      expect(
        providers.calls.filter((call) => call.url.includes("supadata"))
      ).toHaveLength(0)
    } finally {
      queue.restore()
      providers.restore()
      model.restore()
    }
  })
})
