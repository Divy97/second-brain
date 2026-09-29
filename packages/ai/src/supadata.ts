import { z } from "zod"

import { ProviderError } from "./lib/provider-error.js"

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

export class SupadataError extends ProviderError {
  constructor(message: string, status: number) {
    super("Supadata", message, status)
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
      // Response-shape drift is the provider's fault, not the key's, so it reads
      // as an unavailable provider rather than a crash.
      const account = accountSchema.safeParse(await response.json())
      if (!account.success) {
        throw new SupadataError(
          "Supadata returned an unrecognised account response",
          response.status
        )
      }
      return {
        valid: true,
        limitRemaining: account.data.maxCredits - account.data.usedCredits,
      }
    },
  }
}
