import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { asDevice, connectDevice } from "./support/extension.js"
import { request, saveOpenRouterKey, signUp } from "./support/http.js"
import {
  defaultRewrite,
  parseRewriteInput,
  stubOpenRouter,
  type OpenRouterStub,
} from "./support/openrouter-stub.js"
import { recordQueue, type QueueRecorder } from "./support/pipeline.js"

const nothingSaved = "I don't have anything saved about that."
const pageText =
  "The yellow door bookshop in Alfama sells second-hand maps of Lisbon."

interface Answer {
  text: string
  sources: { id: string }[]
}

describe("asking about pages the extension captured", () => {
  let openRouter: OpenRouterStub
  let queue: QueueRecorder

  beforeEach(() => {
    openRouter = stubOpenRouter()
    queue = recordQueue()
  })

  afterEach(() => {
    queue.restore()
    openRouter.restore()
  })

  it("answers from a page only after the user has indexed it", async () => {
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
    const captured = await asDevice(token, "/captures", {
      method: "POST",
      json: {
        url: "https://news.example.com/members/lisbon",
        title: "Lisbon",
        text: pageText,
        trigger: "passive",
      },
    })
    const { id } = await captured.json<{ id: string }>()
    openRouter.onChat("rewrite", (call) => ({
      ...defaultRewrite(parseRewriteInput(call).question),
      keywords: ["Alfama", "bookshop"],
    }))
    const ask = async (): Promise<Answer> => {
      const thread = await request("/threads", {
        method: "POST",
        session,
        json: {},
      })
      const { id: threadId } = await thread.json<{ id: string }>()
      const response = await request(`/threads/${threadId}/messages`, {
        method: "POST",
        session,
        json: {
          question: "which bookshop sells maps in Alfama?",
          timezone: "Asia/Kolkata",
        },
      })
      expect(response.status).toBe(200)
      return response.json<Answer>()
    }

    const whileStored = await ask()
    expect(whileStored.text).toBe(nothingSaved)
    expect(whileStored.sources).toEqual([])

    await asDevice(token, `/stored/${id}/index`, { method: "POST" })
    await queue.processLatest()

    const afterIndexing = await ask()
    expect(afterIndexing.sources.map((source) => source.id)).toEqual([id])
  })
})
