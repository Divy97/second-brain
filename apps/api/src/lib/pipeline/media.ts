import {
  createSupadata,
  createYouTube,
  SupadataError,
  YouTubeError,
  type MediaMetadata,
  type Supadata,
} from "@workspace/ai"

import { reelAudio } from "../config.js"
import { assemble, type Extraction } from "./extraction.js"
import { PipelineFailure } from "./failures.js"

import type { MediaLink } from "../media-url.js"
import type { OperatorService } from "../paid-service.js"

export interface MediaRequest {
  link: MediaLink
  note: string | null
  youtubeApiKey: string | null
  transcriptService: OperatorService | null
  reelAudioService: OperatorService | null
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

// Instagram has no native caption track, so the caption comes from metadata. A reel's
// meaning lives in its audio, which metadata cannot carry.
// See ADR-0003, ADR-0009 and docs/research/23-reel-audio-transcription.md.
async function extractInstagram({
  link,
  note,
  transcriptService,
  reelAudioService,
  fetchPage = fetch,
}: MediaRequest): Promise<Extraction> {
  const lookup = await paidLookup(transcriptService, fetchPage, (client) =>
    client.fetchMetadata(link.canonicalUrl)
  )
  const metadata = lookup.result
  const transcribable = hasTranscribableAudio(link, metadata)

  const audio = await paidLookup(
    transcribable ? reelAudioService : null,
    fetchPage,
    (client) => client.fetchTranscript(link.canonicalUrl, "auto")
  )
  const spoken = audio.result?.text

  const text = assemble([
    note,
    link.canonicalUrl,
    metadata?.title,
    metadata?.author,
    metadata?.description,
    metadata?.tags.join(" "),
    spoken,
  ])

  if (metadata?.isVideo) {
    return spoken
      ? { text, quality: "full" }
      : { text, ...partial(audio.limited) }
  }

  return metadata?.description || metadata?.title
    ? { text, quality: "full" }
    : {
        text: assemble([note, link.canonicalUrl]),
        ...partial(lookup.limited),
      }
}

// Supadata bills per minute while the allowance counts calls, so length needs its own
// bound. An unstated duration fails closed: Supadata documents the field as optional and
// publishes no Instagram sample, and since IGTV was folded into Reels a /reel/ link is no
// longer bounded by any published limit. An hour-long video costs 120 credits where a
// reel costs 2, and exhausted operator credits degrade every User at once (ADR-0006).
function hasTranscribableAudio(
  link: MediaLink,
  metadata: MediaMetadata | null
): boolean {
  if (link.instagramKind !== "reel" || !metadata?.isVideo) return false
  return (
    metadata.durationSeconds !== null &&
    metadata.durationSeconds <= reelAudio.maxDurationSeconds
  )
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
