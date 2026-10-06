export interface MediaStub {
  title?: string | null
  description?: string | null
  author?: string
  tags?: string[]
  /** Supadata's discriminator; only a video has audio to transcribe. */
  type?: "video" | "image" | "carousel" | "post"
  /** Seconds. Null stands for the field Supadata documents as optional. */
  durationSeconds?: number | null
}

export interface VideoStub {
  title: string
  channel: string
  description: string
  duration?: string
}

export interface ExtractionStub {
  calls: Request[]
  acceptKeys: (keys: string[]) => void
  /** Simulates a key revoked at the provider after it was saved here. */
  revokeKeys: (keys: string[]) => void
  breakProvider: (provider: "transcript" | "reader" | "youtube") => void
  /** Fails only /v1/transcript, leaving /v1/metadata healthy. */
  breakTranscriptEndpoint: () => void
  readerReturns: (url: string, content: string) => void
  videoReturns: (videoId: string, video: VideoStub) => void
  transcriptReturns: (url: string, text: string) => void
  /** Serves the transcript through the async 202 + jobId path instead of inline. */
  transcriptReturnsViaJob: (url: string, text: string) => void
  metadataReturns: (url: string, metadata: MediaStub) => void
  /** Serves the media as access-restricted (403) rather than absent (404). */
  metadataRestricted: (url: string) => void
  exhaustYouTubeQuota: () => void
  restore: () => void
}

const HOSTS = {
  transcript: "api.supadata.ai",
  reader: "r.jina.ai",
  youtube: "www.googleapis.com",
} as const

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })

/**
 * Stubs the YouTube Data API, Supadata and Jina Reader. Layers over whatever fetch is
 * already installed, so it composes with stubOpenRouter when created after it and
 * restored before it.
 */
export function stubExtractionProviders(): ExtractionStub {
  const calls: Request[] = []
  const accepted = new Set<string>()
  const broken = new Set<string>()
  let transcriptEndpointBroken = false
  const readerContent = new Map<string, string>()
  const videos = new Map<string, VideoStub>()
  const transcripts = new Map<string, string>()
  const jobTranscripts = new Map<string, string>()
  const metadata = new Map<string, MediaStub>()
  const restricted = new Set<string>()
  let youTubeQuotaGone = false
  const innerFetch = globalThis.fetch

  function answerYouTube(outgoing: Request): Response {
    if (broken.has("youtube")) return json(500, { error: { code: 500 } })
    if (youTubeQuotaGone) {
      return json(403, {
        error: {
          code: 403,
          message:
            "The request cannot be completed because you have exceeded your quota.",
          errors: [{ reason: "quotaExceeded" }],
        },
      })
    }
    const url = new URL(outgoing.url)
    if (url.searchParams.get("key") !== "test-youtube-key") {
      return json(400, {
        error: {
          code: 400,
          message: "API key not valid. Please pass a valid API key.",
          errors: [{ reason: "badRequest" }],
          details: [{ reason: "API_KEY_INVALID" }],
        },
      })
    }
    const video = videos.get(url.searchParams.get("id") ?? "")
    if (!video) return json(200, { items: [], pageInfo: { totalResults: 0 } })
    return json(200, {
      items: [
        {
          snippet: {
            title: video.title,
            channelTitle: video.channel,
            description: video.description,
          },
          contentDetails: { duration: video.duration ?? "PT10M" },
        },
      ],
    })
  }

  function answerTranscript(outgoing: Request): Response {
    if (broken.has("transcript")) return json(500, { error: "server-error" })
    const key = outgoing.headers.get("x-api-key")
    if (!key || !accepted.has(key)) {
      return json(401, { error: "unauthorized", message: "Unauthorized" })
    }
    const url = new URL(outgoing.url)
    if (url.pathname === "/v1/me") {
      return json(200, {
        organizationId: "org-stub",
        plan: "free",
        maxCredits: 100,
        usedCredits: 7,
      })
    }
    if (url.pathname === "/v1/metadata") {
      const target = url.searchParams.get("url") ?? ""
      if (restricted.has(target)) {
        return json(403, {
          error: "forbidden",
          message: "Video requires authentication or is restricted",
        })
      }
      const found = metadata.get(target)
      if (!found) {
        return json(404, {
          error: "not-found",
          message: "The requested item could not be found",
        })
      }
      const duration =
        found.durationSeconds === undefined ? 30 : found.durationSeconds
      return json(200, {
        platform: "instagram",
        type: found.type ?? "video",
        id: "stub",
        title: found.title ?? null,
        description: found.description ?? null,
        author: { displayName: found.author ?? null },
        tags: found.tags ?? [],
        media: {
          type: found.type ?? "video",
          ...(duration === null ? {} : { duration }),
        },
      })
    }

    if (transcriptEndpointBroken) return json(500, { error: "server-error" })

    const jobMatch = /^\/v1\/transcript\/(.+)$/.exec(url.pathname)
    if (jobMatch) {
      const queued = jobTranscripts.get(jobMatch[1] ?? "")
      return queued
        ? json(200, { status: "completed", content: queued, lang: "en" })
        : json(200, { status: "failed", error: "job expired" })
    }

    const target = url.searchParams.get("url") ?? ""
    const queued = jobTranscripts.get(target)
    if (queued) {
      jobTranscripts.set("job-1", queued)
      return json(202, { jobId: "job-1" })
    }
    const text = transcripts.get(target)
    if (!text) {
      return json(206, {
        error: "transcript-unavailable",
        message: "No transcript available",
      })
    }
    return json(200, { content: text, lang: "en", availableLangs: ["en"] })
  }

  function answerReader(outgoing: Request): Response {
    if (broken.has("reader")) return json(503, {})
    const key = outgoing.headers.get("authorization")?.replace(/^Bearer /, "")
    if (!key || !accepted.has(key)) {
      return json(401, {
        code: 401,
        name: "AuthenticationFailedError",
        status: 40102,
        message: "Invalid API key",
      })
    }
    const target = outgoing.url.slice(`https://${HOSTS.reader}/`.length)
    return json(200, {
      code: 200,
      status: 20000,
      data: {
        title: `Reader title for ${target}`,
        description: "",
        url: target,
        content: readerContent.get(target) ?? "",
      },
    })
  }

  // Assigned rather than spied so it layers predictably over stubOpenRouter.
  globalThis.fetch = async (input, init) => {
    const outgoing = new Request(input, init)
    const { hostname } = new URL(outgoing.url)
    if (
      hostname !== HOSTS.transcript &&
      hostname !== HOSTS.reader &&
      hostname !== HOSTS.youtube
    ) {
      return innerFetch(input, init)
    }
    calls.push(outgoing.clone())
    if (hostname === HOSTS.youtube) return answerYouTube(outgoing)
    return hostname === HOSTS.transcript
      ? answerTranscript(outgoing)
      : answerReader(outgoing)
  }

  return {
    calls,
    acceptKeys: (keys) => {
      for (const key of keys) accepted.add(key)
    },
    revokeKeys: (keys) => {
      for (const key of keys) accepted.delete(key)
    },
    breakProvider: (provider) => broken.add(provider),
    breakTranscriptEndpoint: () => {
      transcriptEndpointBroken = true
    },
    readerReturns: (url, content) => readerContent.set(url, content),
    videoReturns: (videoId, video) => videos.set(videoId, video),
    transcriptReturns: (url, text) => transcripts.set(url, text),
    transcriptReturnsViaJob: (url, text) => jobTranscripts.set(url, text),
    metadataReturns: (url, found) => metadata.set(url, found),
    metadataRestricted: (url) => restricted.add(url),
    exhaustYouTubeQuota: () => {
      youTubeQuotaGone = true
    },
    restore: () => {
      globalThis.fetch = innerFetch
    },
  }
}

export const testTranscriptKey = "sd_test_transcript_key_9999"
export const testReaderKey = "jina_test_reader_key_8888"
