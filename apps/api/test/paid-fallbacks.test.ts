import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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
const monday = new Date("2026-10-05T10:00:00Z")
const tuesday = new Date("2026-10-06T10:00:00Z")

function videoUrl(index: number): string {
  return `https://www.youtube.com/watch?v=abcdefghi${String(index).padStart(2, "0")}`
}

const walled = "https://example.com/walled"
const walledHtml = () =>
  new Response(
    "<html><head><title>Members only</title></head><body>Log in to continue.</body></html>",
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }
  )

function pages(): typeof fetch {
  return (input, init) => {
    const { url } = new Request(input, init)
    const { hostname } = new URL(url)
    if (
      ["r.jina.ai", "api.supadata.ai", "www.googleapis.com"].includes(hostname)
    ) {
      return globalThis.fetch(input, init)
    }
    if (url === walled) return Promise.resolve(walledHtml())
    return Promise.reject(new Error(`unstubbed page: ${url}`))
  }
}

let model: OpenRouterStub
let providers: ExtractionStub
let queue: QueueRecorder
let clock = monday

beforeEach(() => {
  clock = monday
  model = stubOpenRouter()
  providers = stubExtractionProviders()
  providers.acceptKeys([testTranscriptKey, testReaderKey])
  for (let index = 0; index <= allowance + 1; index += 1) {
    providers.videoReturns(`abcdefghi${String(index).padStart(2, "0")}`, {
      title: `Video ${index}`,
      channel: "Bench Notes",
      description: "A video.",
    })
    providers.transcriptReturns(videoUrl(index), `Transcript text ${index}.`)
  }
  providers.readerReturns(walled, "The full walled article text.")
  queue = recordQueue({ fetchPage: pages(), now: () => clock })
})

afterEach(() => {
  queue.restore()
  providers.restore()
  model.restore()
})

async function user(): Promise<Session> {
  const session = await signUp()
  await saveOpenRouterKey(session)
  return session
}

async function capture(session: Session, url: string): Promise<ItemBody> {
  const saved = await request("/items/url", {
    method: "POST",
    session,
    json: { url },
  })
  const { id } = await saved.json<{ id: string }>()
  await queue.processLatest()
  return item(session, id)
}

async function item(session: Session, id: string): Promise<ItemBody> {
  return (await request(`/items/${id}`, { session })).json<ItemBody>()
}

function paidCalls(host: string): number {
  return providers.calls.filter((call) => new URL(call.url).hostname === host)
    .length
}

describe("operator-paid fallbacks", () => {
  it("captures a video transcript and a walled page with no key from the user", async () => {
    const session = await user()

    const video = await capture(session, videoUrl(0))
    const page = await capture(session, walled)

    expect(video.captureQuality).toBe("full")
    expect(video.rawText).toContain("Transcript text 0.")
    expect(page.captureQuality).toBe("full")
    expect(page.rawText).toContain("The full walled article text.")
  })

  it("keeps the capture partial when the operator has not set the secrets", async () => {
    queue.restore()
    queue = recordQueue({
      fetchPage: pages(),
      env: { TRANSCRIPT_API_KEY: undefined, READER_API_KEY: undefined },
    })
    const session = await user()

    const video = await capture(session, videoUrl(0))
    const page = await capture(session, walled)

    expect([video.captureQuality, page.captureQuality]).toEqual([
      "partial",
      "partial",
    ])
    expect([video.partialReason, page.partialReason]).toEqual([null, null])
    expect(paidCalls("api.supadata.ai") + paidCalls("r.jina.ai")).toBe(0)
  })

  it("saves the capture as partial with a reason once the day's transcript allowance is used", async () => {
    const session = await user()

    const results = []
    for (let index = 0; index <= allowance; index += 1) {
      results.push(await capture(session, videoUrl(index)))
    }

    expect(results.map((entry) => entry.captureQuality)).toEqual([
      ...Array<string>(allowance).fill("full"),
      "partial",
    ])
    expect(results.map((entry) => entry.partialReason)).toEqual([
      ...Array<string | null>(allowance).fill(null),
      "allowance_used",
    ])
    expect(results[allowance]?.status).toBe("ready")
    expect(results[allowance]?.rawText).toContain(`Video ${allowance}`)
    expect(results[allowance]?.rawText).not.toContain(
      `Transcript text ${allowance}.`
    )
    expect(paidCalls("api.supadata.ai")).toBe(allowance)
  })

  it("lets a reprocess complete the item the next day", async () => {
    const session = await user()
    for (let index = 0; index < allowance; index += 1) {
      await capture(session, videoUrl(index))
    }
    const limited = await capture(session, videoUrl(allowance))
    expect(limited.partialReason).toBe("allowance_used")

    clock = tuesday
    const reprocess = await request(`/items/${limited.id}/reprocess`, {
      method: "POST",
      session,
    })
    expect(reprocess.status).toBe(200)
    await queue.processLatest()

    const completed = await item(session, limited.id)
    expect(completed.captureQuality).toBe("full")
    expect(completed.partialReason).toBeNull()
    expect(completed.rawText).toContain(`Transcript text ${allowance}.`)
  })

  it("counts a reprocess against the allowance like any capture", async () => {
    const session = await user()
    const first = await capture(session, videoUrl(0))
    for (let index = 1; index < allowance; index += 1) {
      await capture(session, videoUrl(index))
    }

    const reprocess = await request(`/items/${first.id}/reprocess`, {
      method: "POST",
      session,
    })
    expect(reprocess.status).toBe(200)
    await queue.processLatest()

    const again = await item(session, first.id)
    expect(again.partialReason).toBe("allowance_used")
    expect(paidCalls("api.supadata.ai")).toBe(allowance)
  })

  it("keeps the transcript and reader allowances separate", async () => {
    const session = await user()
    for (let index = 0; index <= allowance; index += 1) {
      await capture(session, videoUrl(index))
    }

    const page = await capture(session, walled)

    expect(page.captureQuality).toBe("full")
  })

  it("does not charge the allowance for captures that need no paid lookup", async () => {
    const session = await user()
    const text = await request("/items", {
      method: "POST",
      session,
      json: { text: "a plain note that needs no paid lookup" },
    })
    expect(text.status).toBe(201)
    await queue.processLatest()

    const first = await capture(session, videoUrl(0))
    const second = await capture(session, videoUrl(1))

    expect([first.captureQuality, second.captureQuality]).toEqual([
      "full",
      "full",
    ])
  })

  it("gives every user their own allowance", async () => {
    const heavy = await user()
    const other = await user()
    for (let index = 0; index <= allowance; index += 1) {
      await capture(heavy, videoUrl(index))
    }

    const fresh = await capture(other, videoUrl(allowance + 1))

    expect(fresh.captureQuality).toBe("full")
  })

  it("saves the capture as partial, not failed, when the operator key is rejected", async () => {
    providers.revokeKeys([testTranscriptKey])
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)
    const session = await user()

    const video = await capture(session, videoUrl(0))

    expect(video.status).toBe("ready")
    expect(video.captureQuality).toBe("partial")
    expect(video.partialReason).toBeNull()
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining("transcript service"),
      expect.anything()
    )
    logged.mockRestore()
  })
})
