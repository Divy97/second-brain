import {
  createSupadata,
  createYouTube,
  SupadataError,
  YouTubeError,
  type Supadata,
} from "@workspace/ai"

import { assemble, type Extraction } from "./extraction.js"
import { PipelineFailure } from "./failures.js"

import type { MediaLink } from "../media-url.js"
import type { OperatorService } from "../paid-service.js"

export interface MediaRequest {
  link: MediaLink
  note: string | null
  youtubeApiKey: string | null
  transcriptService: OperatorService | null
  fetchPage?: typeof fetch
}

export async function extractMedia(request: MediaRequest): Promise<Extraction> {
  return request.link.platform === "youtube"
    ? extractYouTube(request)
    : extractInstagram(request)
}

// Ladder per spec.md §4.2: operator metadata, then the operator transcript service
// within the User's daily allowance, then partial.
async function extractYouTube({
  link,
  note,
  youtubeApiKey,
  transcriptService,
  fetchPage = fetch,
}: MediaRequest): Promise<Extraction> {
  const metadata = youtubeApiKey
    ? await fetchMetadata(link.mediaId, youtubeApiKey, fetchPage)
    : null

  const lookup = await paidLookup(transcriptService, fetchPage, (client) =>
    client.fetchTranscript(link.canonicalUrl)
  )
  const transcript = lookup.result

  const text = assemble([
    note,
    link.canonicalUrl,
    metadata?.title,
    metadata?.channel,
    metadata?.description,
    transcript?.text,
  ])

  if (!metadata && !transcript?.text) {
    return {
      text: assemble([note, link.canonicalUrl]),
      ...partial(lookup.limited),
    }
  }

  return transcript?.text
    ? { text, quality: "full" }
    : { text, ...partial(lookup.limited) }
}

// Instagram has no native caption track, so a transcript call under mode=native is a
// guaranteed 206 and a wasted credit. The caption comes from metadata instead.
// See ADR-0003 and docs/research/16-instagram-ingestion.md.
async function extractInstagram({
  link,
  note,
  transcriptService,
  fetchPage = fetch,
}: MediaRequest): Promise<Extraction> {
  const lookup = await paidLookup(transcriptService, fetchPage, (client) =>
    client.fetchMetadata(link.canonicalUrl)
  )
  const metadata = lookup.result

  const text = assemble([
    note,
    link.canonicalUrl,
    metadata?.title,
    metadata?.author,
    metadata?.description,
    metadata?.tags.join(" "),
  ])

  return metadata?.description || metadata?.title
    ? { text, quality: "full" }
    : {
        text: assemble([note, link.canonicalUrl]),
        ...partial(lookup.limited),
      }
}

const partial = (
  limited: boolean
): Pick<Extraction, "quality" | "partialReason"> =>
  limited
    ? { quality: "partial", partialReason: "allowance_used" }
    : { quality: "partial" }

interface PaidLookupResult<T> {
  result: T | null
  limited: boolean
}

// A rejected or failing operator service is an outage to log, not a failure the User
// can fix, so the item is kept partial.
async function paidLookup<T>(
  service: OperatorService | null,
  fetchPage: typeof fetch,
  call: (client: Supadata) => Promise<T>
): Promise<PaidLookupResult<T>> {
  if (!service) return { result: null, limited: false }
  if (!(await service.spend())) return { result: null, limited: true }
  try {
    return {
      result: await call(
        createSupadata({ apiKey: service.apiKey, fetch: fetchPage })
      ),
      limited: false,
    }
  } catch (error) {
    if (error instanceof SupadataError) {
      console.error("transcript service failed", error.status)
      return { result: null, limited: false }
    }
    throw error
  }
}

async function fetchMetadata(
  videoId: string,
  apiKey: string,
  fetchPage: typeof fetch
) {
  try {
    return await createYouTube({ apiKey, fetch: fetchPage }).fetchMetadata(
      videoId
    )
  } catch (error) {
    if (error instanceof YouTubeError) {
      // The operator's key, not the user's, so a broken one is an outage to surface,
      // not something the user can fix by editing settings.
      if (error.failure === "invalid_key") {
        throw new PipelineFailure(
          "processing_error",
          "Video metadata is unavailable right now. Retry later.",
          true
        )
      }
      return null
    }
    throw error
  }
}
