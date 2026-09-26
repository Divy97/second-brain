import { z } from "zod"

import { OpenRouterError, toOpenRouterError } from "./lib/errors.js"

export { OpenRouterError, type OpenRouterErrorKind } from "./lib/errors.js"

export interface OpenRouterOptions {
  apiKey: string
  fetch?: typeof fetch
  baseUrl?: string
  appName?: string
  appUrl?: string
}

export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
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
  temperature?: number
  maxTokens?: number
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

export type KeyVerification =
  | { valid: true; limitRemaining: number | null }
  | { valid: false; reason: "invalid_key" }

export interface OpenRouter {
  chat: <T>(request: ChatRequest<T>) => Promise<ChatResult<T>>
  embed: (request: EmbedRequest) => Promise<EmbedResult>
  verifyKey: () => Promise<KeyVerification>
}

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
  const baseUrl = options.baseUrl ?? "https://openrouter.ai/api/v1"

  const headers: Record<string, string> = {
    authorization: `Bearer ${options.apiKey}`,
    "content-type": "application/json",
  }
  if (options.appUrl) headers["http-referer"] = options.appUrl
  if (options.appName) headers["x-openrouter-title"] = options.appName

  async function call(path: string, init: RequestInit): Promise<unknown> {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...headers,
        ...(init.headers as Record<string, string> | undefined),
      },
    })
    const body: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      throw toOpenRouterError(response.status, body)
    }
    return body
  }

  return {
    async chat<T>(request: ChatRequest<T>): Promise<ChatResult<T>> {
      const body = await call("/chat/completions", {
        method: "POST",
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          temperature: request.temperature ?? 0,
          max_tokens: request.maxTokens,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: request.output.name,
              strict: true,
              description: request.output.description,
              schema: z.toJSONSchema(request.output.schema),
            },
          },
          provider: { require_parameters: true },
        }),
      })
      const parsed = chatResponseSchema.parse(body)
      const choice = parsed.choices[0]
      if (
        !choice ||
        choice.finish_reason === "length" ||
        choice.message.content === null
      ) {
        throw new OpenRouterError(
          "invalid_output",
          "model returned no complete content",
          200
        )
      }
      let json: unknown
      try {
        json = JSON.parse(choice.message.content)
      } catch {
        throw new OpenRouterError(
          "invalid_output",
          "model returned malformed JSON",
          200
        )
      }
      const validated = request.output.schema.safeParse(json)
      if (!validated.success) {
        throw new OpenRouterError(
          "invalid_output",
          `model output did not match schema: ${validated.error.message}`,
          200
        )
      }
      return {
        content: validated.data,
        model: parsed.model,
        usage: toUsage(parsed.usage),
      }
    },

    async embed(request: EmbedRequest): Promise<EmbedResult> {
      const body = await call("/embeddings", {
        method: "POST",
        body: JSON.stringify({
          model: request.model,
          input: request.input,
          encoding_format: "float",
        }),
      })
      const parsed = embedResponseSchema.parse(body)
      const embeddings = [...parsed.data]
        .sort((a, b) => a.index - b.index)
        .map((row) => row.embedding)
      if (embeddings.length !== request.input.length) {
        throw new OpenRouterError(
          "invalid_output",
          `expected ${request.input.length} embeddings, received ${embeddings.length}`,
          200
        )
      }
      return { embeddings, model: parsed.model, usage: toUsage(parsed.usage) }
    },

    async verifyKey(): Promise<KeyVerification> {
      try {
        const body = await call("/key", { method: "GET" })
        const parsed = keyResponseSchema.parse(body)
        return { valid: true, limitRemaining: parsed.data.limit_remaining }
      } catch (error) {
        if (error instanceof OpenRouterError && error.kind === "invalid_key") {
          return { valid: false, reason: "invalid_key" }
        }
        throw error
      }
    },
  }
}
