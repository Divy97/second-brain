import type { KeyProvider } from "@/lib/keys-api"

export interface KeyProviderCopy {
  heading: string
  purpose: string
  placeholder: string
  requirement: "Required" | "Optional"
  emptyKeyError: string
  removeWarning: string
  /** Shown once above the whole group when the provider sends content to a third party. */
  withoutKey?: string
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
  transcript: {
    heading: "Transcript key",
    purpose:
      "Supadata fetches transcripts for YouTube and Instagram links that carry none of their own.",
    placeholder: "sd_...",
    requirement: "Optional",
    emptyKeyError: "Paste your Supadata API key first.",
    removeWarning:
      "Remove the key? Saved captures stay. New video links fall back to a title and your note.",
    withoutKey:
      "Without this key, video links are saved as partial captures: the link, the title and your note, with no transcript to search.",
  },
  reader: {
    heading: "Reader key",
    purpose:
      "Jina Reader retrieves articles that block an ordinary fetch, such as bot-walled pages.",
    placeholder: "jina_...",
    requirement: "Optional",
    emptyKeyError: "Paste your Jina Reader API key first.",
    removeWarning:
      "Remove the key? Saved captures stay. Blocked pages fall back to a title and your note.",
    withoutKey:
      "Without this key, a blocked page is saved as a partial capture. Add the key and reprocess the item to complete it.",
  },
}
