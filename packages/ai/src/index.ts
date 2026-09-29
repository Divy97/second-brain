import { z } from "zod"

import { OpenRouterError, toOpenRouterError } from "./lib/errors.js"

import type { KeyVerification } from "./lib/key-verification.js"

export { OpenRouterError, type OpenRouterErrorKind } from "./lib/errors.js"
export { type KeyVerification } from "./lib/key-verification.js"
export { ProviderError } from "./lib/provider-error.js"
export {
  createSupadata,
  SupadataError,
  type Supadata,
  type Transcript,
} from "./supadata.js"
export {
  createYouTube,
  YouTubeError,
  type VideoMetadata,
  type YouTube,
  type YouTubeFailure,
} from "./youtube.js"
export { createJina, JinaError, type Jina, type JinaArticle } from "./jina.js"

export interface OpenRouterOptions {
  apiKey: string
  fetch?: typeof fetch
}

export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content:
    | string
    | (
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
        | { type: "file"; file: { filename: string; file_data: string } }
      )[]
}

export interface StructuredOutput<T> {
  name: string
  schema: z.ZodType<T>
  description?: string
}

export interface ChatRequest<T> {
  model: string
  messages: ChatMessage[]
  output: StructuredOutput<T>
  plugins?: unknown[]
}

export interface Usage {
  promptTokens: number
  completionTokens?: number
  totalTokens: number
  cost?: number
}

export interface ChatResult<T> {
  content: T
  model: string
  usage: Usage
}

export interface EmbedRequest {
  model: string
  input: string[]
}

export interface EmbedResult {
  embeddings: number[][]
  model: string
  usage: Usage
}

export interface OpenRouter {
  chat: <T>(request: ChatRequest<T>) => Promise<ChatResult<T>>
  embed: (request: EmbedRequest) => Promise<EmbedResult>
  verifyKey: () => Promise<KeyVerification>
  transcribe: (file: File) => Promise<string>
  extractImage: (
    bytes: Uint8Array,
    mimeType: string,
    model: string
  ) => Promise<{ visibleText: string; description: string }>
  extractPdf: (file: File, model: string) => Promise<string>
}

const BASE_URL = "https://openrouter.ai/api/v1"
const imageExtractionSchema = z.object({
  visibleText: z.string(),
  description: z.string().min(1),
})
const pdfExtractionSchema = z.object({ text: z.string().min(1) })

const usageSchema = z.object({
  prompt_tokens: z.number(),
  completion_tokens: z.number().optional(),
  total_tokens: z.number(),
  cost: z.number().optional(),
})

const chatResponseSchema = z.object({
  model: z.string(),
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullable() }),
        finish_reason: z.string().nullable().optional(),
      })
    )
    .min(1),
  usage: usageSchema.optional(),
})

const embedResponseSchema = z.object({
  model: z.string(),
  data: z.array(
    z.object({ index: z.number(), embedding: z.array(z.number()) })
  ),
  usage: usageSchema.optional(),
})

const keyResponseSchema = z.object({
  data: z.object({ limit_remaining: z.number().nullable() }),
})

function toUsage(usage: z.infer<typeof usageSchema> | undefined): Usage {
  return {
    promptTokens: usage?.prompt_tokens ?? 0,
    completionTokens: usage?.completion_tokens,
    totalTokens: usage?.total_tokens ?? 0,
    cost: usage?.cost,
  }
}

export function createOpenRouter(options: OpenRouterOptions): OpenRouter {
  const fetchImpl = options.fetch ?? globalThis.fetch

  function toBase64(bytes: Uint8Array): string {
    let binary = ""
    for (let offset = 0; offset < bytes.length; offset += 32766) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32766))
    }
    return btoa(binary)
  }

  async function requestJson(
    path: string,
    method: "GET" | "POST",
    body?: unknown
  ): Promise<unknown> {
    const response = await fetchImpl(`${BASE_URL}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${options.apiKey}`,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const payload: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      throw toOpenRouterError(response.status, payload)
    }
    return payload
  }

  const client: OpenRouter = {
    async extractImage(bytes, mimeType, model) {
      const result = await client.chat({
        model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Copy every visible word exactly. Then briefly describe the scene. Do not guess text you cannot read. Use an empty visibleText when there are no readable words.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${toBase64(bytes)}`,
                },
              },
            ],
          },
        ],
        output: { name: "image_extract", schema: imageExtractionSchema },
      })
      return result.content
    },
    async extractPdf(file, model) {
      const result = await client.chat({
        model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract the document text exactly enough for search and recall. Preserve useful headings and list items. Return only text.",
              },
              {
                type: "file",
                file: {
                  filename: file.name,
                  file_data: `data:${file.type};base64,${toBase64(new Uint8Array(await file.arrayBuffer()))}`,
                },
              },
            ],
          },
        ],
        output: { name: "pdf_extract", schema: pdfExtractionSchema },
        plugins: [{ id: "file-parser", pdf: { engine: "mistral-ocr" } }],
      })
      return result.content.text
    },
    async transcribe(file: File): Promise<string> {
      const body = new FormData()
      body.set("model", "openai/whisper-1")
      body.set("file", file)
      const response = await fetchImpl(`${BASE_URL}/audio/transcriptions`, {
        method: "POST",
        headers: { authorization: `Bearer ${options.apiKey}` },
        body,
      })
      const payload: unknown = await response.json().catch(() => null)
      if (!response.ok) throw toOpenRouterError(response.status, payload)
      return z.object({ text: z.string().min(1) }).parse(payload).text
    },
    async chat<T>(request: ChatRequest<T>): Promise<ChatResult<T>> {
      const payload = await requestJson("/chat/completions", "POST", {
        model: request.model,
        messages: request.messages,
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: request.output.name,
            strict: true,
            description: request.output.description,
            schema: z.toJSONSchema(request.output.schema),
          },
        },
        plugins: request.plugins,
        provider: { require_parameters: true },
      })
      const parsed = chatResponseSchema.parse(payload)
      const choice = parsed.choices[0]
      if (
        !choice ||
        choice.finish_reason === "length" ||
        choice.message.content === null
      ) {
        throw new OpenRouterError(
          "invalid_output",
          "model returned no complete content"
        )
      }
      let rawContent: unknown
      try {
        rawContent = JSON.parse(choice.message.content)
      } catch {
        throw new OpenRouterError(
          "invalid_output",
          "model returned malformed JSON"
        )
      }
      const validated = request.output.schema.safeParse(rawContent)
      if (!validated.success) {
        throw new OpenRouterError(
          "invalid_output",
          `model output did not match schema: ${validated.error.message}`
        )
      }
      return {
        content: validated.data,
        model: parsed.model,
        usage: toUsage(parsed.usage),
      }
    },

    async embed(request: EmbedRequest): Promise<EmbedResult> {
      const payload = await requestJson("/embeddings", "POST", {
        model: request.model,
        input: request.input,
        encoding_format: "float",
      })
      const parsed = embedResponseSchema.parse(payload)
      const embeddings = [...parsed.data]
        .sort((a, b) => a.index - b.index)
        .map((row) => row.embedding)
      if (embeddings.length !== request.input.length) {
        throw new OpenRouterError(
          "invalid_output",
          `expected ${request.input.length} embeddings, received ${embeddings.length}`
        )
      }
      return {
        embeddings,
        model: parsed.model,
        usage: toUsage(parsed.usage),
      }
    },

    async verifyKey(): Promise<KeyVerification> {
      try {
        const payload = await requestJson("/key", "GET")
        const parsed = keyResponseSchema.parse(payload)
        return { valid: true, limitRemaining: parsed.data.limit_remaining }
      } catch (error) {
        if (error instanceof OpenRouterError && error.kind === "invalid_key") {
          return { valid: false, reason: "invalid_key" }
        }
        throw error
      }
    },
  }
  return client
}
