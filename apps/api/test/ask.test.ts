import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  request,
  saveOpenRouterKey,
  signUp,
  type Session,
} from "./support/http.js"
import {
  defaultRewrite,
  parseAnswerInput,
  parseRewriteInput,
  stubOpenRouter,
  type OpenRouterStub,
} from "./support/openrouter-stub.js"
import { recordQueue, type QueueRecorder } from "./support/pipeline.js"

const nothingSaved = "I don't have anything saved about that."

interface Source {
  id: string
  title: string | null
  kind: string | null
  capturedAt: string
}

interface Message {
  id: string
  role: "user" | "assistant"
  text: string
  sources: Source[]
}

interface Thread {
  id: string
  title: string
  messages: Message[]
}

interface ErrorBody {
  error: { code: string; message: string }
}

describe("asking", () => {
  let openRouter: OpenRouterStub
  let queue: QueueRecorder
  let session: Session

  async function saveReady(text: string): Promise<string> {
    const response = await request("/items", {
      method: "POST",
      session,
      json: { text },
    })
    const { id } = await response.json<{ id: string }>()
    await queue.processLatest()
    return id
  }

  async function startThread(owner: Session = session): Promise<string> {
    const response = await request("/threads", {
      method: "POST",
      session: owner,
      json: {},
    })
    expect(response.status).toBe(201)
    return (await response.json<{ id: string }>()).id
  }

  function ask(
    threadId: string,
    question: string,
    owner: Session = session
  ): Promise<Response> {
    return request(`/threads/${threadId}/messages`, {
      method: "POST",
      session: owner,
      json: { question, timezone: "Asia/Kolkata" },
    })
  }

  async function answerTo(question: string): Promise<Message> {
    const response = await ask(await startThread(), question)
    expect(response.status).toBe(200)
    return response.json<Message>()
  }

  function rewriteWith(extra: { variants?: string[]; keywords?: string[] }) {
    openRouter.onChat("rewrite", (call) => {
      const base = defaultRewrite(parseRewriteInput(call).question)
      return {
        ...base,
        variants: extra.variants ?? base.variants,
        keywords: extra.keywords ?? base.keywords,
      }
    })
  }

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

  it("answers a paraphrased question with the saved quote, verbatim, and cites it", async () => {
    const quote =
      '"Attention is the rarest and purest form of generosity." — Simone Weil'
    const id = await saveReady(quote)
    await saveReady("Buy oat milk and coffee filters")
    rewriteWith({
      variants: [
        "what did someone say about giving people my focus",
        "quote attention rarest purest form generosity",
      ],
    })

    const answer = await answerTo(
      "what was that line about giving people my focus?"
    )

    expect(answer.role).toBe("assistant")
    expect(answer.text).toContain(quote)
    expect(answer.sources.map((source) => source.id)).toEqual([id])
    expect(answer.sources[0]).toMatchObject({ kind: "quote" })
  })

  it("finds a note by an exact name even when the rest of the question is vague", async () => {
    const id = await saveReady("Comet by Perplexity browses websites for you")
    await saveReady("Tulips need a cold winter before they bloom")
    rewriteWith({ variants: ["that thing"], keywords: ["Comet"] })

    const answer = await answerTo("what was that Comet thing?")

    expect(answer.sources.map((source) => source.id)).toEqual([id])
  })

  it("finds a note by a paraphrase that shares no words with it", async () => {
    const id = await saveReady("Dialling in espresso grind size on the grinder")
    await saveReady("Tulips need a cold winter before they bloom")
    rewriteWith({
      variants: ["how do I tune my coffee machine", "espresso grind size"],
      keywords: [],
    })

    const answer = await answerTo("how do I tune my coffee machine?")

    expect(answer.sources.map((source) => source.id)).toEqual([id])
  })

  it("says it has nothing saved, with no citations, when nothing matches", async () => {
    await saveReady("Tulips need a cold winter before they bloom")
    openRouter.chatCalls.length = 0

    const answer = await answerTo("what is the half-life of carbon fourteen?")

    expect(answer.text).toBe(nothingSaved)
    expect(answer.sources).toEqual([])
    expect(openRouter.chatCalls.map((call) => call.schemaName)).not.toContain(
      "answer"
    )
  })

  it("says it has nothing saved when there are no notes at all", async () => {
    const answer = await answerTo("anything about Lisbon?")

    expect(answer.text).toBe(nothingSaved)
    expect(answer.sources).toEqual([])
  })

  it("gives the answer step every plausible match with its date, and cites them all", async () => {
    const first = await saveReady("Lisbon trip: book the tram 28 tour")
    const second = await saveReady(
      "Lisbon trip: try pastel de nata at Manteigaria"
    )

    const answer = await answerTo("what did I plan for the Lisbon trip?")

    expect(new Set(answer.sources.map((source) => source.id))).toEqual(
      new Set([first, second])
    )
    const answerCall = openRouter.chatCalls.find(
      (call) => call.schemaName === "answer"
    )
    const sources = answerCall ? parseAnswerInput(answerCall).sources : []
    expect(sources.map((source) => source.itemId).sort()).toEqual(
      [first, second].sort()
    )
    for (const source of sources) {
      expect(source.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    }
  })

  it("never cites a deleted item", async () => {
    const id = await saveReady("Comet by Perplexity browses websites for you")
    await request(`/items/${id}`, { method: "DELETE", session })
    rewriteWith({ keywords: ["Comet"] })

    const answer = await answerTo("what was Comet?")

    expect(answer.text).toBe(nothingSaved)
    expect(answer.sources).toEqual([])
  })

  it("only cites items the answer step was given", async () => {
    const id = await saveReady("Comet by Perplexity browses websites for you")
    openRouter.onChat("answer", () => ({
      answer: "Comet.",
      citedItemIds: [id, "00000000-0000-7000-8000-000000000000"],
      confidence: 0.9,
    }))
    rewriteWith({ keywords: ["Comet"] })

    const answer = await answerTo("what was Comet?")

    expect(answer.sources.map((source) => source.id)).toEqual([id])
  })

  it("returns the fixed reply when the answer step is not confident", async () => {
    await saveReady("Comet by Perplexity browses websites for you")
    openRouter.onChat("answer", () => ({
      answer: "Maybe Comet?",
      citedItemIds: [],
      confidence: 0.1,
    }))
    rewriteWith({ keywords: ["Comet"] })

    const answer = await answerTo("what was Comet?")

    expect(answer.text).toBe(nothingSaved)
    expect(answer.sources).toEqual([])
  })

  it("answers with a structured missing_key error and stores nothing", async () => {
    const keyless = await signUp()
    const threadId = await startThread(keyless)

    const response = await ask(threadId, "anything saved?", keyless)

    expect(response.status).toBe(422)
    expect((await response.json<ErrorBody>()).error.code).toBe("missing_key")
    const thread = await request(`/threads/${threadId}`, { session: keyless })
    expect((await thread.json<Thread>()).messages).toEqual([])
  })

  it("answers with model_unavailable when the model keeps failing", async () => {
    await saveReady("Comet by Perplexity browses websites for you")
    openRouter.failChat(5, 503)

    const response = await ask(await startThread(), "what was Comet?")

    expect(response.status).toBe(503)
    expect((await response.json<ErrorBody>()).error.code).toBe(
      "model_unavailable"
    )
  })

  it("titles a thread by its first question and shows the exchange in order", async () => {
    const id = await saveReady("Comet by Perplexity browses websites for you")
    rewriteWith({ keywords: ["Comet"] })
    const threadId = await startThread()
    await ask(threadId, "what was Comet?")
    await ask(threadId, "who makes Comet?")

    const list = await request("/threads", { session })
    const { threads } = await list.json<{
      threads: { id: string; title: string }[]
    }>()
    expect(threads.find((thread) => thread.id === threadId)?.title).toBe(
      "what was Comet?"
    )
    const view = await request(`/threads/${threadId}`, { session })
    const thread = await view.json<Thread>()
    expect(thread.title).toBe("what was Comet?")
    expect(
      thread.messages.map((message) => [message.role, message.text])
    ).toEqual([
      ["user", "what was Comet?"],
      ["assistant", "Comet by Perplexity browses websites for you"],
      ["user", "who makes Comet?"],
      ["assistant", "Comet by Perplexity browses websites for you"],
    ])
    expect(thread.messages[1]?.sources.map((source) => source.id)).toEqual([id])
  })

  it("lists threads newest first and leaves out threads with no question yet", async () => {
    const older = await startThread()
    await ask(older, "first thread question")
    await startThread()
    const newer = await startThread()
    await ask(newer, "second thread question")

    const list = await request("/threads", { session })
    const { threads } = await list.json<{ threads: { id: string }[] }>()

    expect(threads.map((thread) => thread.id)).toEqual([newer, older])
  })

  it("rejects an empty question", async () => {
    const response = await ask(await startThread(), "   ")

    expect(response.status).toBe(400)
  })

  it("keeps threads and notes private to their owner", async () => {
    await saveReady("Comet by Perplexity browses websites for you")
    const threadId = await startThread()
    await ask(threadId, "what was Comet?")
    const other = await signUp()
    await saveOpenRouterKey(other)
    rewriteWith({ keywords: ["Comet"] })

    expect(
      (await request(`/threads/${threadId}`, { session: other })).status
    ).toBe(404)
    expect((await ask(threadId, "hijack", other)).status).toBe(404)
    const theirs = await startThread(other)
    const answer = await (
      await ask(theirs, "what was Comet?", other)
    ).json<Message>()
    expect(answer.text).toBe(nothingSaved)
  })
})
