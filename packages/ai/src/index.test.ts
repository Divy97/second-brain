import { describe, expect, it } from "vitest"
import { z } from "zod"

import { createOpenRouter, OpenRouterError } from "./index.js"

interface RecordedRequest {
  url: string
  headers: Headers
  body: unknown
}

function fakeFetch(respond: (request: RecordedRequest) => Response): {
  fetch: typeof fetch
  requests: RecordedRequest[]
} {
  const requests: RecordedRequest[] = []
  const fetchImpl: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    const recorded: RecordedRequest = {
      url: request.url,
      headers: request.headers,
      body: request.body ? await request.json() : undefined,
    }
    requests.push(recorded)
    return respond(recorded)
  }
  return { fetch: fetchImpl, requests }
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })

describe("createOpenRouter", () => {
  it("sends a structured chat completion and returns the parsed, validated content", async () => {
    const transport = fakeFetch(() =>
      json(200, {
        id: "gen-1",
        model: "test/model",
        choices: [
          {
            message: {
              role: "assistant",
              content: '{"title":"Agentic browsers"}',
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
          cost: 0.0001,
        },
      })
    )
    const openRouter = createOpenRouter({
      apiKey: "sk-test",
      fetch: transport.fetch,
    })

    const result = await openRouter.chat({
      model: "test/model",
      messages: [{ role: "user", content: "Title this" }],
      output: { name: "title", schema: z.object({ title: z.string() }) },
    })

    expect(result.content).toEqual({ title: "Agentic browsers" })
    expect(result.model).toBe("test/model")
    expect(result.usage.cost).toBe(0.0001)

    const [request] = transport.requests
    expect(request?.url).toBe("https://openrouter.ai/api/v1/chat/completions")
    expect(request?.headers.get("authorization")).toBe("Bearer sk-test")
    expect(request?.body).toMatchObject({
      model: "test/model",
      response_format: {
        type: "json_schema",
        json_schema: { name: "title", strict: true },
      },
      provider: { require_parameters: true },
    })
  })

  it("rejects a structured response that does not match the schema", async () => {
    const transport = fakeFetch(() =>
      json(200, {
        id: "gen-2",
        model: "test/model",
        choices: [
          {
            message: { role: "assistant", content: '{"nope":1}' },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      })
    )
    const openRouter = createOpenRouter({
      apiKey: "sk-test",
      fetch: transport.fetch,
    })

    await expect(
      openRouter.chat({
        model: "test/model",
        messages: [{ role: "user", content: "x" }],
        output: { name: "title", schema: z.object({ title: z.string() }) },
      })
    ).rejects.toMatchObject({ kind: "invalid_output" })
  })

  it("embeds a batch and returns vectors in input order", async () => {
    const transport = fakeFetch(() =>
      json(200, {
        object: "list",
        model: "test/embed",
        data: [
          { object: "embedding", index: 1, embedding: [0.2, 0.2] },
          { object: "embedding", index: 0, embedding: [0.1, 0.1] },
        ],
        usage: { prompt_tokens: 4, total_tokens: 4 },
      })
    )
    const openRouter = createOpenRouter({
      apiKey: "sk-test",
      fetch: transport.fetch,
    })

    const result = await openRouter.embed({
      model: "test/embed",
      input: ["a", "b"],
    })

    expect(result.embeddings).toEqual([
      [0.1, 0.1],
      [0.2, 0.2],
    ])
    expect(transport.requests[0]?.url).toBe(
      "https://openrouter.ai/api/v1/embeddings"
    )
    expect(transport.requests[0]?.body).toMatchObject({
      model: "test/embed",
      input: ["a", "b"],
    })
  })

  it("extracts PDF text through OpenRouter's file parser", async () => {
    const transport = fakeFetch(() =>
      json(200, {
        id: "gen-pdf",
        model: "test/model",
        choices: [
          {
            message: {
              role: "assistant",
              content: '{"text":"Meeting in Kyoto on Tuesday."}',
            },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      })
    )
    const openRouter = createOpenRouter({
      apiKey: "sk-test",
      fetch: transport.fetch,
    })

    await expect(
      openRouter.extractPdf(
        new File(["%PDF-1.4\n%%EOF"], "schedule.pdf", {
          type: "application/pdf",
        }),
        "test/model"
      )
    ).resolves.toBe("Meeting in Kyoto on Tuesday.")

    const body = z
      .object({
        messages: z.array(
          z.object({
            content: z.array(
              z.union([
                z.object({ type: z.literal("text") }),
                z.object({
                  type: z.literal("file"),
                  file: z.object({
                    filename: z.string(),
                    file_data: z.string(),
                  }),
                }),
              ])
            ),
          })
        ),
        plugins: z.array(z.unknown()),
      })
      .parse(transport.requests[0]?.body)
    const filePart = body.messages[0]?.content.find(
      (part) => part.type === "file"
    )
    expect(filePart).toMatchObject({
      file: { filename: "schedule.pdf" },
    })
    expect(filePart?.file.file_data).toMatch(/^data:application\/pdf;base64,/)
    expect(body.plugins).toEqual([
      { id: "file-parser", pdf: { engine: "mistral-ocr" } },
    ])
  })

  it("maps a 401 to an invalid_key error", async () => {
    const transport = fakeFetch(() =>
      json(401, { error: { message: "User not found.", code: 401 } })
    )
    const openRouter = createOpenRouter({
      apiKey: "sk-bad",
      fetch: transport.fetch,
    })

    const error = await openRouter
      .embed({ model: "test/embed", input: ["a"] })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(OpenRouterError)
    expect(error).toMatchObject({ kind: "invalid_key", status: 401 })
  })

  it("verifies a key against the key endpoint", async () => {
    const transport = fakeFetch((request) =>
      request.url.endsWith("/api/v1/key")
        ? json(200, {
            data: { label: "k", limit: 10, limit_remaining: 4, usage: 6 },
          })
        : json(404, {})
    )
    const openRouter = createOpenRouter({
      apiKey: "sk-test",
      fetch: transport.fetch,
    })

    await expect(openRouter.verifyKey()).resolves.toEqual({
      valid: true,
      limitRemaining: 4,
    })
  })
})
