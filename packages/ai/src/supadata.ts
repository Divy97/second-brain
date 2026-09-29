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
  lang: string | null
}

export interface Supadata {
  verifyKey: () => Promise<KeyVerification>
  fetchTranscript: (url: string) => Promise<Transcript>
}

const accountSchema = z.object({
  maxCredits: z.number(),
  usedCredits: z.number(),
})

const transcriptSchema = z.object({
  content: z.string().default(""),
  lang: z.string().nullish(),
})

const jobSchema = z.object({
  status: z.enum(["queued", "active", "completed", "failed"]),
  content: z.string().nullish(),
  lang: z.string().nullish(),
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
      await sleep(JOB_POLL_INTERVAL_MS)
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
      if (job.status === "completed") {
        return { text: job.content ?? null, lang: job.lang ?? null }
      }
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
      if (response.status === 206) return { text: null, lang: null }
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
      return {
        text: transcript.content.trim() || null,
        lang: transcript.lang ?? null,
      }
    },
  }
}
