import { z } from "zod"

import { ProviderError } from "./lib/provider-error.js"

import type { KeyVerification } from "./lib/key-verification.js"

const BASE_URL = "https://r.jina.ai"

// Jina publishes no account or balance endpoint, so a key is verified by reading
// a tiny stable page and watching for 401. See docs/research/14-byok-key-verification.md.
const VERIFICATION_URL = "https://example.com"

export interface JinaOptions {
  apiKey: string
  fetch?: typeof fetch
}

export interface JinaArticle {
  title: string
  description: string
  content: string
}

export interface Jina {
  verifyKey: () => Promise<KeyVerification>
  read: (url: string) => Promise<JinaArticle>
}

const readSchema = z.object({
  data: z.object({
    title: z.string().default(""),
    description: z.string().default(""),
    content: z.string(),
  }),
})

export class JinaError extends ProviderError {
  constructor(message: string, status: number) {
    super("Jina", message, status)
  }
}

export function createJina(options: JinaOptions): Jina {
  const fetchImpl = options.fetch ?? globalThis.fetch

  async function get(url: string): Promise<Response> {
    return fetchImpl(`${BASE_URL}/${url}`, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${options.apiKey}`,
      },
    })
  }

  return {
    async verifyKey(): Promise<KeyVerification> {
      const response = await get(VERIFICATION_URL)
      if (response.status === 401)
        return { valid: false, reason: "invalid_key" }
      if (!response.ok) {
        throw new JinaError(
          `Jina Reader request failed with status ${response.status}`,
          response.status
        )
      }
      return { valid: true, limitRemaining: null }
    },

    async read(url: string): Promise<JinaArticle> {
      const response = await get(url)
      if (!response.ok) {
        throw new JinaError(
          `Jina Reader request failed with status ${response.status}`,
          response.status
        )
      }
      const parsed = readSchema.safeParse(await response.json())
      if (!parsed.success) {
        throw new JinaError(
          "Jina Reader returned an unrecognised response",
          response.status
        )
      }
      return parsed.data.data
    },
  }
}
