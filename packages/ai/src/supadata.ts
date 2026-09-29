import { z } from "zod"

import type { KeyVerification } from "./lib/key-verification.js"

const BASE_URL = "https://api.supadata.ai/v1"

export interface SupadataOptions {
  apiKey: string
  fetch?: typeof fetch
}

export interface Supadata {
  verifyKey: () => Promise<KeyVerification>
}

const accountSchema = z.object({
  maxCredits: z.number(),
  usedCredits: z.number(),
})

export class SupadataError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "SupadataError"
    this.status = status
  }
}

export function createSupadata(options: SupadataOptions): Supadata {
  const fetchImpl = options.fetch ?? globalThis.fetch

  return {
    async verifyKey(): Promise<KeyVerification> {
      const response = await fetchImpl(`${BASE_URL}/me`, {
        headers: { "x-api-key": options.apiKey },
      })
      if (response.status === 401)
        return { valid: false, reason: "invalid_key" }
      if (!response.ok) {
        throw new SupadataError(
          `Supadata request failed with status ${response.status}`,
          response.status
        )
      }
      const account = accountSchema.parse(await response.json())
      return {
        valid: true,
        limitRemaining: account.maxCredits - account.usedCredits,
      }
    },
  }
}
