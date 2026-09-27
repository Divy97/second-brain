import { vi } from "vitest"

export const STUB_EMBEDDING_DIMENSIONS = 1024

export interface ChatCall {
  schemaName: string
  model: string
  messages: { role: string; content: string }[]
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
  const content = call.messages.at(-1)?.content ?? ""
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
