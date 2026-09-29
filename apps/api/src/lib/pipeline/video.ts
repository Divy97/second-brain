import { createSupadata, createYouTube, YouTubeError } from "@workspace/ai"

import { PipelineFailure } from "./failures.js"

import type { VideoLink } from "../video-url.js"

export interface VideoExtraction {
  text: string
  quality: "full" | "partial"
}

export interface VideoRequest {
  link: VideoLink
  note: string | null
  youtubeApiKey: string | null
  transcriptKey: string | null
  fetchPage?: typeof fetch
}

function assemble(parts: (string | null | undefined)[]): string {
  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join("\n\n")
}

// Ladder: operator metadata, then the user's transcript key, then partial. The
// opportunistic Innertube rung in spec.md §4.2 step 2 is not implemented: YouTube now
// gates transcripts behind an attestation a Worker cannot solve.
// See docs/research/15-youtube-ingestion.md.
export async function extractVideo({
  link,
  note,
  youtubeApiKey,
  transcriptKey,
  fetchPage = fetch,
}: VideoRequest): Promise<VideoExtraction> {
  const metadata = youtubeApiKey
    ? await fetchMetadata(link.videoId, youtubeApiKey, fetchPage)
    : null

  const transcript = transcriptKey
    ? await createSupadata({
        apiKey: transcriptKey,
        fetch: fetchPage,
      }).fetchTranscript(link.canonicalUrl)
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
