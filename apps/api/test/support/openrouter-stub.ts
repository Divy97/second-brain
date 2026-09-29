import { vi } from "vitest"

export const STUB_EMBEDDING_DIMENSIONS = 1024

export interface ChatCall {
  schemaName: string
  model: string
  messages: { role: string; content: string | unknown[] }[]
}

export type ChatHandler = (call: ChatCall) => unknown

export interface OpenRouterStub {
  calls: Request[]
  chatCalls: ChatCall[]
  embeddedInputs: string[]
  rejectKeys: (keys: string[]) => void
  onChat: (schemaName: string, handler: ChatHandler) => void
  failChat: (times: number, status?: number) => void
  restore: () => void
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })

function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
}

function hashWord(word: string): number {
  let hash = 2166136261
  for (const char of word) {
    hash ^= char.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % STUB_EMBEDDING_DIMENSIONS
}

// A bag of hashed words, normalised: texts that share words get nearby vectors.
export function stubEmbedding(text: string): number[] {
  const vector = new Array<number>(STUB_EMBEDDING_DIMENSIONS).fill(0)
  const tokens = words(text)
  if (tokens.length === 0) vector[0] = 1
  for (const token of tokens) {
    const index = hashWord(token)
    vector[index] = (vector[index] ?? 0) + 1
  }
  const norm = Math.hypot(...vector)
  return vector.map((value) => value / norm)
}

interface EnrichmentInput {
  note: string
  neighbourTags: string[]
}

export function parseEnrichmentInput(call: ChatCall): EnrichmentInput {
  const content = lastContent(call)
  return JSON.parse(content) as EnrichmentInput
}

export function defaultEnrichment(note: string) {
  const noteWords = note.match(/[\p{L}\p{N}']+/gu) ?? []
  return {
    title: noteWords.slice(0, 6).join(" ") || "Untitled",
    summary: `A note about ${noteWords.slice(0, 12).join(" ")}.`,
    cleanText: note,
    kind: note.includes('"') ? "quote" : "thought",
    language: "en",
    tags: [
      ...new Set(
        noteWords
          .map((word) => word.toLowerCase())
          .filter((word) => word.length > 5)
      ),
    ].slice(0, 5),
    entities: noteWords
      .filter((word) => /^\p{Lu}/u.test(word))
      .slice(0, 3)
      .map((name) => ({ name, type: "other" })),
  }
}

const lastContent = (call: ChatCall) => {
  const content = call.messages.at(-1)?.content
  return typeof content === "string" ? content : ""
}

export interface RewriteInput {
  question: string
  now: string
  timezone: string
  history: { role: string; text: string }[]
}

export function parseRewriteInput(call: ChatCall): RewriteInput {
  return JSON.parse(lastContent(call)) as RewriteInput
}

export function defaultRewrite(question: string) {
  const questionWords = question.match(/[\p{L}\p{N}]+/gu) ?? []
  return {
    question,
    variants: [question],
    keywords: questionWords.filter((word) => /^\p{Lu}/u.test(word)),
    filters: { lastDays: null, from: null, to: null, kind: null },
    followUp: false,
  }
}

export interface RerankInput {
  question: string
  variants: string[]
  keywords: string[]
  followUp: boolean
  history: { role: string; text: string }[]
  candidates: { id: string; text: string }[]
}

export function parseRerankInput(call: ChatCall): RerankInput {
  return JSON.parse(lastContent(call)) as RerankInput
}

const contentWords = (text: string) =>
  new Set(words(text).filter((word) => word.length > 3))

// A third per shared content word, capped at 1; a keyword hit counts as a full match.
export function defaultRerank(input: RerankInput) {
  const asked = contentWords([input.question, ...input.variants].join(" "))
  const keywords = input.keywords.map((keyword) => keyword.toLowerCase())
  return {
    ranking: input.candidates.map((candidate) => {
      const offered = contentWords(candidate.text)
      const shared = [...asked].filter((word) => offered.has(word)).length
      const keywordHit = keywords.some((keyword) => offered.has(keyword))
      return {
        id: candidate.id,
        score: keywordHit ? 1 : Math.min(1, shared / 3),
      }
    }),
  }
}

export interface AnswerInput {
  question: string
  sources: {
    itemId: string
    title: string
    kind: string
    savedAt: string
    savedOn: string
    text: string
  }[]
  history: { role: string; text: string; citedItemIds: string[] }[]
}

export function parseAnswerInput(call: ChatCall): AnswerInput {
  return JSON.parse(lastContent(call)) as AnswerInput
}

// Quotes every source verbatim and cites them all.
export function defaultAnswer(input: AnswerInput) {
  return {
    answer: input.sources.map((source) => source.text).join("\n\n"),
    citedItemIds: input.sources.map((source) => source.itemId),
    confidence: 0.9,
  }
}

export function stubOpenRouter(): OpenRouterStub {
  const calls: Request[] = []
  const chatCalls: ChatCall[] = []
  const embeddedInputs: string[] = []
  const rejected = new Set<string>()
  const handlers = new Map<string, ChatHandler>([
    [
      "enrichment",
      (call) => defaultEnrichment(parseEnrichmentInput(call).note),
    ],
    ["rewrite", (call) => defaultRewrite(parseRewriteInput(call).question)],
    ["rerank", (call) => defaultRerank(parseRerankInput(call))],
    ["answer", (call) => defaultAnswer(parseAnswerInput(call))],
  ])
  let chatFailures = { remaining: 0, status: 500 }
  const realFetch = globalThis.fetch

  async function answerChat(outgoing: Request): Promise<Response> {
    const body: {
      model: string
      messages: ChatCall["messages"]
      response_format: { json_schema: { name: string } }
    } = await outgoing.json()
    const call: ChatCall = {
      schemaName: body.response_format.json_schema.name,
      model: body.model,
      messages: body.messages,
    }
    chatCalls.push(call)
    if (chatFailures.remaining > 0) {
      chatFailures.remaining -= 1
      return json(chatFailures.status, {
        error: {
          message: "Provider returned error",
          code: chatFailures.status,
        },
      })
    }
    const handler = handlers.get(call.schemaName)
    if (!handler) {
      return json(400, { error: { message: `unstubbed ${call.schemaName}` } })
    }
    return json(200, {
      id: "gen-stub",
      model: call.model,
      choices: [
        {
          message: {
            role: "assistant",
            content: JSON.stringify(handler(call)),
          },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    })
  }

  async function answerEmbeddings(outgoing: Request): Promise<Response> {
    const body: { model: string; input: string[] } = await outgoing.json()
    embeddedInputs.push(...body.input)
    return json(200, {
      object: "list",
      model: body.model,
      data: body.input.map((text, index) => ({
        object: "embedding",
        index,
        embedding: stubEmbedding(text),
      })),
      usage: { prompt_tokens: 1, total_tokens: 1 },
    })
  }

  const spy = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input, init) => {
      const outgoing = new Request(input, init)
      const url = new URL(outgoing.url)
      if (url.hostname !== "openrouter.ai") return realFetch(input, init)
      calls.push(outgoing.clone())

      const apiKey = outgoing.headers
        .get("authorization")
        ?.replace(/^Bearer /, "")
      if (!apiKey || rejected.has(apiKey)) {
        return json(401, { error: { message: "User not found.", code: 401 } })
      }
      switch (url.pathname) {
        case "/api/v1/key":
          return json(200, {
            data: {
              label: "stub",
              limit: null,
              limit_remaining: null,
              usage: 0,
            },
          })
        case "/api/v1/chat/completions":
          return answerChat(outgoing)
        case "/api/v1/embeddings":
          return answerEmbeddings(outgoing)
        case "/api/v1/audio/transcriptions":
          return json(200, { text: "Remember to buy tulips on Friday." })
        default:
          return json(404, { error: { message: `unstubbed ${url.pathname}` } })
      }
    })

  return {
    calls,
    chatCalls,
    embeddedInputs,
    rejectKeys: (keys) => {
      keys.forEach((key) => rejected.add(key))
    },
    onChat: (schemaName, handler) => {
      handlers.set(schemaName, handler)
    },
    failChat: (times, status = 500) => {
      chatFailures = { remaining: times, status }
    },
    restore: () => {
      spy.mockRestore()
    },
  }
}
