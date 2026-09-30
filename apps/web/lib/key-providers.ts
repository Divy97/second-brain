import type { KeyProvider } from "@/lib/keys-api"

export interface KeyProviderCopy {
  heading: string
  purpose: string
  placeholder: string
  requirement: "Required"
  emptyKeyError: string
  removeWarning: string
}

export const keyProviderCopy: Record<KeyProvider, KeyProviderCopy> = {
  openrouter: {
    heading: "OpenRouter key",
    purpose:
      "Enrichment, search and answers run on your own OpenRouter account and are billed to it.",
    placeholder: "sk-or-v1-...",
    requirement: "Required",
    emptyKeyError: "Paste your OpenRouter API key first.",
    removeWarning:
      "Remove the key? Processing and asking stop until you add one.",
  },
}
