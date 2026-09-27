import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { testDb } from "./support/database.js"
import {
  request,
  saveOpenRouterKey,
  signUp,
  type Session,
} from "./support/http.js"
import {
  defaultEnrichment,
  defaultRewrite,
  parseAnswerInput,
  parseEnrichmentInput,
  parseRewriteInput,
  stubOpenRouter,
  type ChatCall,
  type OpenRouterStub,
} from "./support/openrouter-stub.js"
import { recordQueue, type QueueRecorder } from "./support/pipeline.js"

const nothingSaved = "I don't have anything saved about that."
const day = 24 * 60 * 60 * 1000

interface Message {
  text: string
  sources: { id: string }[]
}

describe("asking like a human", () => {
  let openRouter: OpenRouterStub
  let queue: QueueRecorder
  let session: Session

  async function saveReady(text: string, savedDaysAgo = 0): Promise<string> {
    const response = await request("/items", {
      method: "POST",
      session,
      json: { text },
    })
    const { id } = await response.json<{ id: string }>()
    await queue.processLatest()
    if (savedDaysAgo > 0) {
      await testDb().execute(
        `update items set captured_at = now() - interval '${savedDaysAgo} days' where id = '${id}'`
      )
    }
    return id
  }

  async function startThread(): Promise<string> {
    const response = await request("/threads", {
      method: "POST",
      session,
      json: {},
    })
    return (await response.json<{ id: string }>()).id
  }

  async function ask(threadId: string, question: string): Promise<Message> {
    const response = await request(`/threads/${threadId}/messages`, {
      method: "POST",
      session,
      json: { question, timezone: "Asia/Kolkata" },
    })
    expect(response.status).toBe(200)
    return response.json<Message>()
  }

  const citedIds = (message: Message) =>
    message.sources.map((source) => source.id).sort()

  function answerCalls(): ChatCall[] {
    return openRouter.chatCalls.filter((call) => call.schemaName === "answer")
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

  it("narrows a 'recently' question to the recent note and leaves the plain question open", async () => {
    const old = await saveReady(
      "Sourdough starter needs feeding twice a day",
      60
    )
    const recent = await saveReady(
      "Sourdough starter: switch to rye flour feeding"
    )
    openRouter.onChat("rewrite", (call) => {
      const { question, now } = parseRewriteInput(call)
      const base = defaultRewrite(question)
      return question.includes("recently")
        ? {
            ...base,
            variants: ["sourdough starter feeding"],
            filters: {
              from: new Date(Date.parse(now) - 30 * day).toISOString(),
              to: null,
              kind: null,
            },
          }
        : { ...base, variants: ["sourdough starter feeding"] }
    })

    const recently = await ask(
      await startThread(),
      "what did I recently save about sourdough?"
    )
    const plain = await ask(
      await startThread(),
      "what did I save about sourdough?"
    )

    expect(citedIds(recently)).toEqual([recent])
    expect(citedIds(plain)).toEqual([old, recent].sort())
  })

  it("ignores filters it cannot use instead of failing", async () => {
    const id = await saveReady("Sourdough starter needs feeding twice a day")
    openRouter.onChat("rewrite", (call) => ({
      ...defaultRewrite(parseRewriteInput(call).question),
      variants: ["sourdough starter feeding"],
      filters: { from: "last tuesday-ish", to: "soonish", kind: null },
    }))

    const answer = await ask(await startThread(), "sourdough?")

    expect(citedIds(answer)).toEqual([id])
  })

  it("prefers a quote-kind note over a thought when the question asks for the quote", async () => {
    openRouter.onChat("enrichment", (call) => {
      const note = parseEnrichmentInput(call).note
      return {
        ...defaultEnrichment(note),
        kind: note.startsWith("Seneca") ? "quote" : "thought",
      }
    })
    const thought = await saveReady(
      "I think time management is really about attention management"
    )
    const quote = await saveReady(
      "Seneca: it is not that we have a short time to live, but that we waste a lot of it. Time management"
    )
    openRouter.onChat("rewrite", (call) => ({
      ...defaultRewrite(parseRewriteInput(call).question),
      variants: ["time management"],
      filters: { from: null, to: null, kind: "quote" },
    }))

    await ask(await startThread(), "that quote about time management")

    const [call] = answerCalls()
    const sources = call ? parseAnswerInput(call).sources : []
    expect(sources.map((source) => source.itemId)).toEqual([quote, thought])
  })

  it("hands conflicting notes to the answer step with their dates, and the answer can name the newest", async () => {
    const older = await saveReady("My dentist is Dr. Rao at Smile Clinic", 90)
    const newer = await saveReady("My dentist is now Dr. Mehta at Bright Teeth")
    openRouter.onChat("rewrite", (call) => ({
      ...defaultRewrite(parseRewriteInput(call).question),
      variants: ["my dentist is"],
    }))
    openRouter.onChat("answer", (call) => {
      const { sources } = parseAnswerInput(call)
      const [latest, ...earlier] = [...sources].sort((a, b) =>
        b.savedAt.localeCompare(a.savedAt)
      )
      return {
        answer: `${latest?.text ?? ""} (saved ${latest?.savedOn ?? ""}); earlier: ${earlier
          .map((source) => `${source.text} (saved ${source.savedOn})`)
          .join("; ")}`,
        citedItemIds: sources.map((source) => source.itemId),
        confidence: 0.9,
      }
    })

    const answer = await ask(await startThread(), "who is my dentist?")

    const [call] = answerCalls()
    const sources = call ? parseAnswerInput(call).sources : []
    expect(new Set(sources.map((source) => source.itemId))).toEqual(
      new Set([older, newer])
    )
    expect(new Set(sources.map((source) => source.savedOn)).size).toBe(2)
    expect(answer.text.indexOf("Dr. Mehta")).toBeLessThan(
      answer.text.indexOf("Dr. Rao")
    )
    expect(citedIds(answer)).toEqual([older, newer].sort())
  })

  it("finds a Hindi note from an English question through its English summary", async () => {
    openRouter.onChat("enrichment", () => ({
      title: "Doctor appointment",
      summary: "Appointment with Doctor Mehta tomorrow morning.",
      cleanText: "कल सुबह डॉक्टर मेहता से मिलना है",
      kind: "fact",
      language: "hi",
      tags: ["health"],
      entities: [{ name: "Doctor Mehta", type: "person" }],
    }))
    const id = await saveReady("कल सुबह डॉक्टर मेहता से मिलना है")
    openRouter.onChat("enrichment", (call) =>
      defaultEnrichment(parseEnrichmentInput(call).note)
    )
    await saveReady("Tulips need a cold winter before they bloom")

    const answer = await ask(
      await startThread(),
      "when is my appointment with Doctor Mehta?"
    )

    expect(citedIds(answer)).toEqual([id])
  })

  it("answers 'tell me more about that one' from the previously cited note", async () => {
    const comet = await saveReady(
      "Comet by Perplexity browses websites for you"
    )
    await saveReady("Tulips need a cold winter before they bloom")
    const threadId = await startThread()
    openRouter.onChat("rewrite", (call) => {
      const { question } = parseRewriteInput(call)
      return question.includes("that one")
        ? { ...defaultRewrite(question), variants: [question], followUp: true }
        : { ...defaultRewrite(question), keywords: ["Comet"] }
    })
    await ask(threadId, "what was Comet?")
    openRouter.chatCalls.length = 0

    const followUp = await ask(threadId, "tell me more about that one")

    expect(citedIds(followUp)).toEqual([comet])
    const rewriteCall = openRouter.chatCalls.find(
      (call) => call.schemaName === "rewrite"
    )
    const history = rewriteCall ? parseRewriteInput(rewriteCall).history : []
    expect(history.map((turn) => turn.role)).toEqual(["user", "assistant"])
    const [answerCall] = answerCalls()
    expect(answerCall && parseAnswerInput(answerCall).history).toHaveLength(2)
  })

  it("keeps follow-up context to the last six messages", async () => {
    await saveReady("Comet by Perplexity browses websites for you")
    const threadId = await startThread()
    for (const question of [
      "one Comet",
      "two Comet",
      "three Comet",
      "four Comet",
    ]) {
      await ask(threadId, question)
    }
    openRouter.chatCalls.length = 0

    await ask(threadId, "five Comet")

    const [answerCall] = answerCalls()
    const history = answerCall ? parseAnswerInput(answerCall).history : []
    expect(history).toHaveLength(6)
    expect(history[0]?.text).toBe("two Comet")
  })

  it("never uses a deleted note, even as follow-up context", async () => {
    const comet = await saveReady(
      "Comet by Perplexity browses websites for you"
    )
    const threadId = await startThread()
    openRouter.onChat("rewrite", (call) => {
      const { question } = parseRewriteInput(call)
      return question.includes("that one")
        ? { ...defaultRewrite(question), variants: [question], followUp: true }
        : { ...defaultRewrite(question), keywords: ["Comet"] }
    })
    await ask(threadId, "what was Comet by Perplexity?")
    await request(`/items/${comet}`, { method: "DELETE", session })
    openRouter.chatCalls.length = 0

    const followUp = await ask(threadId, "tell me more about that one")

    expect(followUp.text).toBe(nothingSaved)
    expect(followUp.sources).toEqual([])
    const leaked = openRouter.chatCalls.some((call) =>
      call.messages.some((message) => message.content.includes("Perplexity"))
    )
    expect(leaked).toBe(false)
  })

  it("still finds the note when the rewrite corrects a garbled product name", async () => {
    const id = await saveReady("Comet by Perplexity browses websites for you")
    await saveReady("Tulips need a cold winter before they bloom")
    openRouter.onChat("rewrite", () => ({
      ...defaultRewrite("what was Comet by Perplexity?"),
      keywords: ["Comet", "Perplexity"],
    }))

    const answer = await ask(
      await startThread(),
      "what was komet by perplexcity?"
    )

    expect(citedIds(answer)).toEqual([id])
  })

  it("deletes a thread: gone from the list, its view is not found", async () => {
    const threadId = await startThread()
    await ask(threadId, "anything?")

    const response = await request(`/threads/${threadId}`, {
      method: "DELETE",
      session,
    })

    expect(response.status).toBe(204)
    const list = await request("/threads", { session })
    const { threads } = await list.json<{ threads: { id: string }[] }>()
    expect(threads.map((thread) => thread.id)).not.toContain(threadId)
    expect((await request(`/threads/${threadId}`, { session })).status).toBe(
      404
    )
    const other = await signUp()
    const theirs = await request(`/threads/${threadId}`, {
      method: "DELETE",
      session: other,
    })
    expect(theirs.status).toBe(404)
  })
})
