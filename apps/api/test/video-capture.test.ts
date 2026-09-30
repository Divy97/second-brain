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

const videoId = "dQw4w9WgXcQ"
const canonical = `https://www.youtube.com/watch?v=${videoId}`

interface ItemBody {
  id: string
  type: string
  status: string
  sourceUrl: string | null
  sourceNote: string | null
  captureQuality: string | null
  rawText: string
  captures: string[]
}

const agenticBrowser = {
  title: "Dia, the agentic browser, explained",
  channel: "Bench Notes",
  description: "A walkthrough of what an agentic browser actually does.",
}

function saveUrl(session: Session, url: string, note?: string) {
  return request("/items/url", { method: "POST", session, json: { url, note } })
}

const getItem = async (session: Session, id: string) =>
  (await request(`/items/${id}`, { session })).json<ItemBody>()

describe("YouTube capture", () => {
  it("saves title, channel and transcript, and makes them searchable", async () => {
    const model = stubOpenRouter()
    const providers = stubExtractionProviders()
    providers.acceptKeys([testTranscriptKey])
    providers.videoReturns(videoId, agenticBrowser)
    providers.transcriptReturns(
      canonical,
      "The browser books the flight for you while you watch."
    )
    const queue = recordQueue()
    try {
      const session = await signUp()
      await saveOpenRouterKey(session)

      const response = await saveUrl(session, canonical, "Watch again")
      expect(response.status).toBe(201)
      const { id } = await response.json<{ id: string }>()
      expect(await queue.processLatest()).toMatchObject({ outcome: "ready" })

      const item = await getItem(session, id)
      expect(item.captureQuality).toBe("full")
      expect(item.sourceUrl).toBe(canonical)
      expect(item.rawText).toContain("Dia, the agentic browser")
      expect(item.rawText).toContain("Bench Notes")
      expect(item.rawText).toContain("books the flight")

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
          question: "what was that agentic browser I watched?",
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

  it("saves metadata as a partial capture when no transcript key is set", async () => {
    const model = stubOpenRouter()
    const providers = stubExtractionProviders()
    providers.videoReturns(videoId, agenticBrowser)
    const queue = recordQueue()
    try {
      const session = await signUp()
      await saveOpenRouterKey(session)

      const { id } = await (
        await saveUrl(session, canonical, "Watch again")
      ).json<{ id: string }>()
      expect(await queue.processLatest()).toMatchObject({ outcome: "ready" })

      const item = await getItem(session, id)
      expect(item.captureQuality).toBe("partial")
      expect(item.rawText).toContain("Dia, the agentic browser")
      expect(item.rawText).toContain("Watch again")
    } finally {
      queue.restore()
      providers.restore()
      model.restore()
    }
  })

  it("stays partial and honest when the video has no transcript at all", async () => {
    const model = stubOpenRouter()
    const providers = stubExtractionProviders()
    providers.acceptKeys([testTranscriptKey])
    providers.videoReturns(videoId, agenticBrowser)
    const queue = recordQueue()
    try {
      const session = await signUp()
      await saveOpenRouterKey(session)

      const { id } = await (
        await saveUrl(session, canonical)
      ).json<{
        id: string
      }>()
      expect(await queue.processLatest()).toMatchObject({ outcome: "ready" })

      const item = await getItem(session, id)
      expect(item.captureQuality).toBe("partial")
      expect(item.rawText).toContain("Dia, the agentic browser")
    } finally {
      queue.restore()
      providers.restore()
      model.restore()
    }
  })

  it("treats every link form for one video as one item with many captures", async () => {
    const model = stubOpenRouter()
    const providers = stubExtractionProviders()
    providers.videoReturns(videoId, agenticBrowser)
    const queue = recordQueue()
    try {
      const session = await signUp()
      await saveOpenRouterKey(session)

      const first = await saveUrl(session, `https://youtu.be/${videoId}?t=42`)
      expect(first.status).toBe(201)
      const { id } = await first.json<{ id: string }>()
      expect(await queue.processLatest()).toMatchObject({ outcome: "ready" })

      const second = await saveUrl(
        session,
        `https://www.youtube.com/shorts/${videoId}`
      )
      expect(second.status).toBe(200)
      expect((await second.json<{ id: string }>()).id).toBe(id)

      const item = await getItem(session, id)
      // Deduped onto the first capture's link, not rewritten to a canonical one.
      expect(item.sourceUrl).toBe(`https://youtu.be/${videoId}?t=42`)
      expect(item.captures).toHaveLength(2)

      const list = await (
        await request("/items", { session })
      ).json<{ items: ItemBody[] }>()
      expect(list.items.filter((entry) => entry.id === id)).toHaveLength(1)
    } finally {
      queue.restore()
      providers.restore()
      model.restore()
    }
  })

  it("keeps the link and note when the video cannot be retrieved", async () => {
    const model = stubOpenRouter()
    const providers = stubExtractionProviders()
    const queue = recordQueue()
    try {
      const session = await signUp()
      await saveOpenRouterKey(session)

      const { id } = await (
        await saveUrl(session, canonical, "Someone recommended this")
      ).json<{ id: string }>()
      expect(await queue.processLatest()).toMatchObject({ outcome: "ready" })

      const item = await getItem(session, id)
      expect(item.captureQuality).toBe("partial")
      expect(item.sourceUrl).toBe(canonical)
      expect(item.rawText).toContain("Someone recommended this")
    } finally {
      queue.restore()
      providers.restore()
      model.restore()
    }
  })

  it("degrades to a partial capture rather than failing when quota is exhausted", async () => {
    const model = stubOpenRouter()
    const providers = stubExtractionProviders()
    providers.videoReturns(videoId, agenticBrowser)
    providers.exhaustYouTubeQuota()
    const queue = recordQueue()
    try {
      const session = await signUp()
      await saveOpenRouterKey(session)

      const { id } = await (
        await saveUrl(session, canonical, "Check later")
      ).json<{ id: string }>()
      expect(await queue.processLatest()).toMatchObject({ outcome: "ready" })

      const item = await getItem(session, id)
      expect(item.status).toBe("ready")
      expect(item.captureQuality).toBe("partial")
      expect(item.rawText).toContain("Check later")
    } finally {
      queue.restore()
      providers.restore()
      model.restore()
    }
  })

  it("still treats a non-video URL as an article", async () => {
    const model = stubOpenRouter()
    const providers = stubExtractionProviders()
    const queue = recordQueue({
      fetchPage: () =>
        Promise.resolve(
          new Response(
            "<html><head><title>Not a video</title></head><body><article>Plain prose about Lisbon.</article></body></html>",
            { headers: { "content-type": "text/html" } }
          )
        ),
    })
    try {
      const session = await signUp()
      await saveOpenRouterKey(session)

      const { id } = await (
        await saveUrl(session, "https://example.com/lisbon")
      ).json<{ id: string }>()
      expect(await queue.processLatest()).toMatchObject({ outcome: "ready" })

      const item = await getItem(session, id)
      expect(item.rawText).toContain("Plain prose about Lisbon")
      expect(
        providers.calls.filter((call) =>
          call.url.startsWith("https://www.googleapis.com")
        )
      ).toHaveLength(0)
    } finally {
      queue.restore()
      providers.restore()
      model.restore()
    }
  })

  it("keeps the link the user saved, timestamp and all", async () => {
    const model = stubOpenRouter()
    const providers = stubExtractionProviders()
    providers.videoReturns(videoId, agenticBrowser)
    const queue = recordQueue()
    try {
      const session = await signUp()
      await saveOpenRouterKey(session)
      const saved = `https://youtu.be/${videoId}?t=142`

      const { id } = await (
        await saveUrl(session, saved)
      ).json<{
        id: string
      }>()
      expect(await queue.processLatest()).toMatchObject({ outcome: "ready" })

      const item = await getItem(session, id)
      expect(item.sourceUrl).toBe(saved)
      expect(item.rawText).toContain("Dia, the agentic browser")
    } finally {
      queue.restore()
      providers.restore()
      model.restore()
    }
  })

  it("waits out an async transcript job", async () => {
    const model = stubOpenRouter()
    const providers = stubExtractionProviders()
    providers.acceptKeys([testTranscriptKey])
    providers.videoReturns(videoId, agenticBrowser)
    providers.transcriptReturnsViaJob(
      canonical,
      "The long version, delivered by job."
    )
    const queue = recordQueue()
    try {
      const session = await signUp()
      await saveOpenRouterKey(session)

      const { id } = await (
        await saveUrl(session, canonical)
      ).json<{
        id: string
      }>()
      expect(await queue.processLatest()).toMatchObject({ outcome: "ready" })

      const item = await getItem(session, id)
      expect(item.captureQuality).toBe("full")
      expect(item.rawText).toContain("delivered by job")
    } finally {
      queue.restore()
      providers.restore()
      model.restore()
    }
  })

  it("stays partial when the metadata service is down", async () => {
    const model = stubOpenRouter()
    const providers = stubExtractionProviders()
    providers.videoReturns(videoId, agenticBrowser)
    providers.breakProvider("youtube")
    const queue = recordQueue()
    try {
      const session = await signUp()
      await saveOpenRouterKey(session)

      const { id } = await (
        await saveUrl(session, canonical, "Look at this")
      ).json<{ id: string }>()
      expect(await queue.processLatest()).toMatchObject({ outcome: "ready" })

      const item = await getItem(session, id)
      expect(item.status).toBe("ready")
      expect(item.captureQuality).toBe("partial")
      expect(item.rawText).toContain("Look at this")
    } finally {
      queue.restore()
      providers.restore()
      model.restore()
    }
  })
})
