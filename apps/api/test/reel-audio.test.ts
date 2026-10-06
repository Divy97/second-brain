import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  stubExtractionProviders,
  testReaderKey,
  testTranscriptKey,
  type ExtractionStub,
} from "./support/extraction-stub.js"
import {
  request,
  saveOpenRouterKey,
  signUp,
  type Session,
} from "./support/http.js"
import {
  stubOpenRouter,
  type OpenRouterStub,
} from "./support/openrouter-stub.js"
import { recordQueue, type QueueRecorder } from "./support/pipeline.js"
import { paidLookupAllowance } from "../src/lib/config.js"

interface ItemBody {
  id: string
  status: string
  captureQuality: string | null
  partialReason: string | null
  rawText: string
}

const allowance = paidLookupAllowance.transcript
const reel = (shortcode: string) =>
  `https://www.instagram.com/reel/${shortcode}/`

const realReel = reel("DeFRiX9ysWr")
const realCaption = {
  title: null,
  description:
    'Crack your next interview with this 30 second setup🎯💯 Comment "app" for link🔗\n.\n.\n#interview #jobs #hiring #foryou #explore',
  author: "careerwithrashi",
  tags: ["interview", "jobs", "hiring"],
}
const spokenHindi =
  "इंटरव्यू से पहले अपना STAR फ़ॉर्मेट तैयार रखें। सबसे पहले situation बताइए, फिर task, फिर action और आख़िर में result। यही चार चीज़ें लिखकर रखें।"

const walled = "https://example.com/walled"

function pages(): typeof fetch {
  return (input, init) => {
    const { url } = new Request(input, init)
    const { hostname } = new URL(url)
    if (
      ["r.jina.ai", "api.supadata.ai", "www.googleapis.com"].includes(hostname)
    ) {
      return globalThis.fetch(input, init)
    }
    if (url === walled) {
      return Promise.resolve(
        new Response(
          "<html><head><title>Members only</title></head><body>Log in to continue.</body></html>",
          {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
          }
        )
      )
    }
    return Promise.reject(new Error(`unstubbed page: ${url}`))
  }
}

let model: OpenRouterStub
let providers: ExtractionStub
let queue: QueueRecorder

beforeEach(() => {
  model = stubOpenRouter()
  providers = stubExtractionProviders()
  providers.acceptKeys([testTranscriptKey, testReaderKey])
  queue = recordQueue({ fetchPage: pages() })
})

afterEach(() => {
  queue.restore()
  providers.restore()
  model.restore()
})

const saveUrl = (session: Session, url: string, note?: string) =>
  request("/items/url", { method: "POST", session, json: { url, note } })

const getItem = async (session: Session, id: string) =>
  (await request(`/items/${id}`, { session })).json<ItemBody>()

async function capture(session: Session, url: string): Promise<ItemBody> {
  const { id } = await (await saveUrl(session, url)).json<{ id: string }>()
  expect(await queue.processLatest()).toMatchObject({ outcome: "ready" })
  return getItem(session, id)
}

async function signedUp(): Promise<Session> {
  const session = await signUp()
  await saveOpenRouterKey(session)
  return session
}

const transcriptCalls = () =>
  providers.calls.filter((call) =>
    new URL(call.url).pathname.startsWith("/v1/transcript")
  )

describe("reel audio", () => {
  it("captures what the creator said, alongside the caption", async () => {
    providers.metadataReturns(realReel, realCaption)
    providers.transcriptReturns(realReel, spokenHindi)
    const session = await signedUp()

    const item = await capture(session, realReel)

    expect(item.captureQuality).toBe("full")
    expect(item.rawText).toContain("STAR फ़ॉर्मेट")
    expect(item.rawText).toContain("careerwithrashi")
    expect(item.rawText).toContain("Crack your next interview")
  })

  it("asks Supadata for the reel audio in auto mode", async () => {
    providers.metadataReturns(realReel, realCaption)
    providers.transcriptReturns(realReel, spokenHindi)
    const session = await signedUp()

    await capture(session, realReel)

    const [call] = transcriptCalls()
    expect(new URL(call?.url ?? "").searchParams.get("mode")).toBe("auto")
  })

  it("leaves a YouTube video on native mode", async () => {
    const video = "https://www.youtube.com/watch?v=abcdefghij0"
    providers.videoReturns("abcdefghij0", {
      title: "A video",
      channel: "Bench Notes",
      description: "A video.",
    })
    providers.transcriptReturns(video, "The spoken words.")
    const session = await signedUp()

    await capture(session, video)

    const [call] = transcriptCalls()
    expect(new URL(call?.url ?? "").searchParams.get("mode")).toBe("native")
  })

  it("is partial when a reel's audio was not transcribed", async () => {
    providers.metadataReturns(realReel, realCaption)
    const session = await signedUp()

    const item = await capture(session, realReel)

    expect(item.captureQuality).toBe("partial")
    expect(item.rawText).toContain("Crack your next interview")
  })

  it("spends nothing extra on a photo post", async () => {
    const post = "https://www.instagram.com/p/PhOtOpOsT01/"
    providers.metadataReturns(post, {
      title: null,
      description:
        "A long written caption that is the whole point of the post.",
      author: "benchnotes",
      tags: ["writing"],
      type: "image",
    })
    const session = await signedUp()

    const item = await capture(session, post)

    expect(item.captureQuality).toBe("full")
    expect(transcriptCalls()).toHaveLength(0)
  })

  it("stops at the daily allowance and says why", async () => {
    const session = await signedUp()
    for (let index = 0; index <= allowance; index += 1) {
      const url = reel(`AlLoWaNcE${index}`)
      providers.metadataReturns(url, { ...realCaption })
      providers.transcriptReturns(url, spokenHindi)
    }

    for (let index = 0; index < allowance; index += 1) {
      const item = await capture(session, reel(`AlLoWaNcE${index}`))
      expect(item.captureQuality).toBe("full")
    }
    const limited = await capture(session, reel(`AlLoWaNcE${allowance}`))

    expect(limited.captureQuality).toBe("partial")
    expect(limited.partialReason).toBe("allowance_used")
    // The metadata lookup is refused first, so there is no caption to keep either —
    // the link is what survives, exactly as ADR-0006 already specifies.
    expect(limited.rawText).toContain(`AlLoWaNcE${allowance}`)
  })

  it("leaves the reader allowance alone when reel audio is used up", async () => {
    const session = await signedUp()
    for (let index = 0; index < allowance; index += 1) {
      const url = reel(`SePaRaTe${index}`)
      providers.metadataReturns(url, { ...realCaption })
      providers.transcriptReturns(url, spokenHindi)
    }
    for (let index = 0; index < allowance; index += 1) {
      expect(
        (await capture(session, reel(`SePaRaTe${index}`))).captureQuality
      ).toBe("full")
    }

    providers.readerReturns(walled, "The full walled article text.")
    const article = await capture(session, walled)

    expect(article.captureQuality).toBe("full")
    expect(article.rawText).toContain("The full walled article text.")
  })

  it("keeps a speechless reel as a saved capture", async () => {
    const silent = reel("SiLeNtReEl")
    providers.metadataReturns(silent, { ...realCaption })
    const session = await signedUp()

    const item = await capture(session, silent)

    expect(item.status).toBe("ready")
    expect(item.rawText).toContain("careerwithrashi")
  })

  it("stays partial rather than failing when the transcript endpoint is down", async () => {
    providers.metadataReturns(realReel, realCaption)
    providers.breakTranscriptEndpoint()
    const session = await signedUp()

    const { id } = await (
      await saveUrl(session, realReel)
    ).json<{ id: string }>()
    expect(await queue.processLatest()).toMatchObject({ outcome: "ready" })
    const item = await getItem(session, id)

    expect(item.status).toBe("ready")
    expect(item.captureQuality).toBe("partial")
  })

  it("finds a Hindi reel from a question asked in Hindi", async () => {
    providers.metadataReturns(realReel, realCaption)
    providers.transcriptReturns(realReel, spokenHindi)
    const session = await signedUp()
    const item = await capture(session, realReel)

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
        question: "इंटरव्यू में STAR फ़ॉर्मेट के बारे में क्या कहा था?",
        timezone: "Asia/Kolkata",
      },
    })

    expect(answer.status).toBe(200)
    const message = await answer.json<{ sources: { id: string }[] }>()
    expect(message.sources.map((source) => source.id)).toContain(item.id)
  })
})
