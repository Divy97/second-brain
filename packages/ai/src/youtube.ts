import { z } from "zod"

import { ProviderError } from "./lib/provider-error.js"

const BASE_URL = "https://www.googleapis.com/youtube/v3/videos"

export interface YouTubeOptions {
  apiKey: string
  fetch?: typeof fetch
}

export interface VideoMetadata {
  title: string
  channel: string
  description: string
}

export interface YouTube {
  /** Null when the video is unknown, deleted or private. */
  fetchMetadata: (videoId: string) => Promise<VideoMetadata | null>
}

export type YouTubeFailure = "invalid_key" | "quota_exceeded" | "unavailable"

export class YouTubeError extends ProviderError {
  readonly failure: YouTubeFailure

  constructor(message: string, status: number, failure: YouTubeFailure) {
    super("YouTube", message, status)
    this.failure = failure
  }
}

const videoSchema = z.object({
  items: z
    .array(
      z.object({
        snippet: z.object({
          title: z.string().default(""),
          channelTitle: z.string().default(""),
          description: z.string().default(""),
        }),
      })
    )
    .default([]),
})

const errorSchema = z.object({
  error: z.object({
    message: z.string().default(""),
    errors: z.array(z.object({ reason: z.string() })).default([]),
    details: z.array(z.object({ reason: z.string().optional() })).default([]),
  }),
})

// Google reports a bad key as 400 with details[].reason, not through the documented
// 400 reason names, and quota as 403 quotaExceeded. Verified live; see
// docs/research/15-youtube-ingestion.md.
function toFailure(status: number, body: unknown): YouTubeError {
  const parsed = errorSchema.safeParse(body)
  const message = parsed.success
    ? parsed.data.error.message
    : `YouTube request failed with status ${status}`
  if (!parsed.success) return new YouTubeError(message, status, "unavailable")

  const { errors, details } = parsed.data.error
  if (details.some((detail) => detail.reason === "API_KEY_INVALID")) {
    return new YouTubeError(message, status, "invalid_key")
  }
  if (errors.some((error) => error.reason === "quotaExceeded")) {
    return new YouTubeError(message, status, "quota_exceeded")
  }
  return new YouTubeError(message, status, "unavailable")
}

export function createYouTube(options: YouTubeOptions): YouTube {
  const fetchImpl = options.fetch ?? globalThis.fetch

  return {
    async fetchMetadata(videoId: string): Promise<VideoMetadata | null> {
      const url = new URL(BASE_URL)
      url.searchParams.set("part", "snippet")
      url.searchParams.set("id", videoId)
      url.searchParams.set("key", options.apiKey)

      const response = await fetchImpl(url.toString())
      const payload: unknown = await response.json().catch(() => null)

      // A missing video is documented as 404 but is widely served as an empty
      // items array; both mean the same thing here.
      if (response.status === 404) return null
      if (!response.ok) throw toFailure(response.status, payload)

      const parsed = videoSchema.safeParse(payload)
      if (!parsed.success) {
        throw new YouTubeError(
          "YouTube returned an unrecognised video response",
          response.status,
          "unavailable"
        )
      }
      const video = parsed.data.items[0]
      if (!video) return null

      return {
        title: video.snippet.title,
        channel: video.snippet.channelTitle,
        description: video.snippet.description,
      }
    },
  }
}
