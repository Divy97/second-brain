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

export interface MediaRequest {
  link: MediaLink
  note: string | null
  youtubeApiKey: string | null
  transcriptKey: string | null
  fetchPage?: typeof fetch
}

export async function extractMedia(request: MediaRequest): Promise<Extraction> {
  return request.link.platform === "youtube"
    ? extractYouTube(request)
    : extractInstagram(request)
}

// Ladder per spec.md §4.2: operator metadata, then the user's transcript key, then
// partial. See ADR-0002 for why the former Innertube rung is gone.
async function extractYouTube({
  link,
  note,
  youtubeApiKey,
  transcriptKey,
  fetchPage = fetch,
}: MediaRequest): Promise<Extraction> {
  const metadata = youtubeApiKey
    ? await fetchMetadata(link.mediaId, youtubeApiKey, fetchPage)
    : null

  const transcript = transcriptKey
    ? await callSupadata(transcriptKey, fetchPage, (client) =>
        client.fetchTranscript(link.canonicalUrl)
      )
    : null

  const text = assemble([
    note,
    link.canonicalUrl,
    metadata?.title,
    metadata?.channel,
    metadata?.description,
    transcript?.text,
  ])

  if (!metadata && !transcript?.text) {
    // Nothing but the user's own words survived, so the capture is kept and retryable
    // rather than failed: adding a key and reprocessing can still complete it.
    return { text: assemble([note, link.canonicalUrl]), quality: "partial" }
  }

  return { text, quality: transcript?.text ? "full" : "partial" }
}

// Instagram has no native caption track, so a transcript call under mode=native is a
// guaranteed 206 and a wasted credit. The caption comes from metadata instead.
// See ADR-0003 and docs/research/16-instagram-ingestion.md.
async function extractInstagram({
  link,
  note,
  transcriptKey,
  fetchPage = fetch,
}: MediaRequest): Promise<Extraction> {
  const metadata = transcriptKey
    ? await callSupadata(transcriptKey, fetchPage, (client) =>
        client.fetchMetadata(link.canonicalUrl)
      )
    : null

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
    : { text: assemble([note, link.canonicalUrl]), quality: "partial" }
}

// A rejected key is the user's to fix, so it surfaces as a retryable failure with an
// actionable message. A service that is merely down leaves the item partial.
async function callSupadata<T>(
  transcriptKey: string,
  fetchPage: typeof fetch,
  call: (client: Supadata) => Promise<T>
): Promise<T | null> {
  try {
    return await call(
      createSupadata({ apiKey: transcriptKey, fetch: fetchPage })
    )
  } catch (error) {
    if (error instanceof SupadataError) {
      if (error.status === 401) {
        throw new PipelineFailure(
          "invalid_key",
          "The transcript key was rejected. Update it in settings and retry.",
          true
        )
      }
      return null
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
