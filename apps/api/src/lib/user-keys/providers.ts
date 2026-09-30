import {
  createOpenRouter,
  OpenRouterError,
  type KeyVerification,
} from "@workspace/ai"

import type { KeyProvider } from "@workspace/db"

export class KeyProviderUnavailable extends Error {
  constructor(provider: KeyProvider) {
    super(`${provider} could not be reached`)
    this.name = "KeyProviderUnavailable"
  }
}

export interface KeyProviderSpec {
  label: string
  verify: (apiKey: string) => Promise<KeyVerification>
}

// An upstream that is merely unreachable must not read as a bad key, so each
// client's own transport error becomes KeyProviderUnavailable; anything else throws.
function verifying(
  provider: KeyProvider,
  isUpstreamError: (error: unknown) => boolean,
  verify: (apiKey: string) => Promise<KeyVerification>
): KeyProviderSpec["verify"] {
  return async (apiKey) => {
    try {
      return await verify(apiKey)
    } catch (error) {
      if (isUpstreamError(error)) throw new KeyProviderUnavailable(provider)
      throw error
    }
  }
}

export const keyProviders: Record<KeyProvider, KeyProviderSpec> = {
  openrouter: {
    label: "OpenRouter",
    verify: verifying(
      "openrouter",
      (error) => error instanceof OpenRouterError,
      (apiKey) => createOpenRouter({ apiKey }).verifyKey()
    ),
  },
}

export const keyProviderNames: KeyProvider[] = ["openrouter"]
