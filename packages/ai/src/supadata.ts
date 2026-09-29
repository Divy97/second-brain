import { z } from "zod"

import { ProviderError } from "./lib/provider-error.js"

import type { KeyVerification } from "./lib/key-verification.js"

const BASE_URL = "https://api.supadata.ai/v1"

export interface SupadataOptions {
  apiKey: string
  fetch?: typeof fetch
  /** Injected so tests do not wait on real job polling. */
  sleep?: (ms: number) => Promise<void>
}

export interface Transcript {
  /** Null when the platform has no transcript for this link. */
  text: string | null
}

export interface MediaMetadata {
  title: string | null
  /** The caption, for platforms that have one. */
  description: string | null
  author: string | null
  tags: string[]
}

export interface Supadata {
  verifyKey: () => Promise<KeyVerification>
  fetchTranscript: (url: string) => Promise<Transcript>
  /** Null when the media is private, deleted or otherwise not reachable. */
  fetchMetadata: (url: string) => Promise<MediaMetadata | null>
}

const accountSchema = z.object({
  maxCredits: z.number(),
  usedCredits: z.number(),
})

const transcriptSchema = z.object({ content: z.string().default("") })

const metadataSchema = z.object({
  title: z.string().nullish(),
  description: z.string().nullish(),
  author: z.object({ displayName: z.string().nullish() }).nullish(),
  tags: z.array(z.string()).nullish(),
})

// Job shape per docs/research/14-byok-key-verification.md: 202 returns a jobId,
// polled until completed or failed.
const jobSchema = z.object({
  status: z.enum(["queued", "active", "completed", "failed"]),
  content: z.string().nullish(),
  error: z.string().nullish(),
})

const startedJobSchema = z.object({ jobId: z.string() })

const JOB_POLL_INTERVAL_MS = 2000
const JOB_POLL_ATTEMPTS = 30

export class SupadataError extends ProviderError {
  constructor(message: string, status: number) {
    super("Supadata", message, status)
  }
}

export function createSupadata(options: SupadataOptions): Supadata {
  const fetchImpl = options.fetch ?? globalThis.fetch
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))

  const get = (path: string) =>
    fetchImpl(`${BASE_URL}${path}`, {
      headers: { "x-api-key": options.apiKey },
    })

  function parseOrThrow<T>(
    schema: z.ZodType<T>,
    payload: unknown,
    status: number
  ): T {
    const parsed = schema.safeParse(payload)
    if (!parsed.success) {
      throw new SupadataError(
        "Supadata returned an unrecognised response",
        status
      )
    }
    return parsed.data
  }

  async function awaitJob(jobId: string): Promise<Transcript> {
    for (let attempt = 0; attempt < JOB_POLL_ATTEMPTS; attempt += 1) {
      if (attempt > 0) await sleep(JOB_POLL_INTERVAL_MS)
      const response = await get(`/transcript/${jobId}`)
      if (!response.ok) {
        throw new SupadataError(
          `Supadata job request failed with status ${response.status}`,
          response.status
        )
      }
      const job = parseOrThrow(
        jobSchema,
        await response.json().catch(() => null),
        response.status
      )
      if (job.status === "failed") {
        throw new SupadataError(
          job.error ?? "Supadata could not produce a transcript",
          response.status
        )
      }
      if (job.status === "completed") return { text: job.content ?? null }
    }
    throw new SupadataError("Supadata transcript job timed out", 504)
  }

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

    // mode=native is explicit on purpose: the API default, auto, silently falls back
    // to AI generation at 2 credits per minute against a 100-credit free plan.
    // See docs/research/15-youtube-ingestion.md.
    async fetchTranscript(url: string): Promise<Transcript> {
      const query = new URLSearchParams({
        url,
        text: "true",
        mode: "native",
      })
      const response = await get(`/transcript?${query.toString()}`)
      const payload: unknown = await response.json().catch(() => null)

      // 206 is "captured, no transcript", not a failure.
      if (response.status === 206) return { text: null }
      if (response.status === 202) {
        return awaitJob(
          parseOrThrow(startedJobSchema, payload, response.status).jobId
        )
      }
      if (!response.ok) {
        throw new SupadataError(
          `Supadata transcript request failed with status ${response.status}`,
          response.status
        )
      }
      const transcript = parseOrThrow(
        transcriptSchema,
        payload,
        response.status
      )
      return { text: transcript.content.trim() || null }
    },

    async fetchMetadata(url: string): Promise<MediaMetadata | null> {
      const response = await get(`/metadata?url=${encodeURIComponent(url)}`)
      const payload: unknown = await response.json().catch(() => null)

      // Private and deleted media are indistinguishable here; both are 404.
      if (response.status === 404 || response.status === 403) return null
      if (!response.ok) {
        throw new SupadataError(
          `Supadata metadata request failed with status ${response.status}`,
          response.status
        )
      }
      const metadata = parseOrThrow(metadataSchema, payload, response.status)
      return {
        title: metadata.title ?? null,
        description: metadata.description ?? null,
        author: metadata.author?.displayName ?? null,
        tags: metadata.tags ?? [],
      }
    },
  }
}
