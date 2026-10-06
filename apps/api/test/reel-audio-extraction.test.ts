import { describe, expect, it } from "vitest"

import { reelAudio } from "../src/lib/config.js"
import { parseMediaLink } from "../src/lib/media-url.js"
import { extractMedia } from "../src/lib/pipeline/media.js"

import type { OperatorService } from "../src/lib/paid-service.js"

// The queue harness cannot reach these paths: a reel spends one metadata lookup before
// each audio lookup, so with equal allowances the metadata one is always refused first.
// Driving extractMedia directly is the only seam where the audio allowance binds.

interface Media {
  type?: "video" | "image" | "carousel" | "post"
  duration?: number
  description?: string
}

function providers(
  media: Media | null,
  transcript = "The spoken words."
): {
  fetchPage: typeof fetch
  paths: string[]
} {
  const paths: string[] = []
  const fetchPage: typeof fetch = (input, init) => {
    const { url } = new Request(input, init)
    const { pathname } = new URL(url)
    paths.push(pathname)
    const body = (status: number, value: unknown) =>
      Promise.resolve(
        new Response(JSON.stringify(value), {
          status,
          headers: { "content-type": "application/json" },
        })
      )
    if (pathname === "/v1/metadata") {
      if (!media) return body(404, { error: "not-found" })
      return body(200, {
        platform: "instagram",
        type: media.type ?? "video",
        title: null,
        description: media.description ?? "A caption.",
        author: { displayName: "careerwithrashi" },
        tags: ["interview"],
        media: {
          type: media.type ?? "video",
          ...(media.duration === undefined ? {} : { duration: media.duration }),
        },
      })
    }
    if (pathname === "/v1/transcript") {
      return body(200, { content: transcript, lang: "hi" })
    }
    return Promise.reject(new Error(`unstubbed: ${url}`))
  }
  return { fetchPage, paths }
}

const service = (allowed: boolean): OperatorService => ({
  apiKey: "test-key",
  spend: () => Promise.resolve(allowed),
})

async function extract(
  url: string,
  media: Media | null,
  { audioAllowed = true }: { audioAllowed?: boolean } = {}
) {
  const link = parseMediaLink(url)
  if (!link) throw new Error(`unparsed: ${url}`)
  const { fetchPage, paths } = providers(media)
  const extraction = await extractMedia({
    link,
    note: null,
    youtubeApiKey: null,
    transcriptService: service(true),
    reelAudioService: service(audioAllowed),
    fetchPage,
  })
  return { ...extraction, paths }
}

const reel = "https://www.instagram.com/reel/DeFRiX9ysWr/"

describe("reel audio extraction", () => {
  it("is partial and says so when the audio allowance is used up", async () => {
    const result = await extract(
      reel,
      { duration: 30 },
      { audioAllowed: false }
    )

    expect(result.quality).toBe("partial")
    expect(result.partialReason).toBe("allowance_used")
    expect(result.paths).not.toContain("/v1/transcript")
  })

  it("transcribes a reel within the length cap", async () => {
    const result = await extract(reel, { duration: 30 })

    expect(result.quality).toBe("full")
    expect(result.text).toContain("The spoken words.")
  })

  // Supadata returns no duration for an Instagram reel, observed 2026-10-06. Requiring
  // one refused every reel in production.
  it("transcribes a reel whose duration Supadata does not state", async () => {
    const result = await extract(reel, {})

    expect(result.paths).toContain("/v1/transcript")
    expect(result.quality).toBe("full")
  })

  it("transcribes a reel exactly at the length cap", async () => {
    const result = await extract(reel, {
      duration: reelAudio.maxDurationSeconds,
    })

    expect(result.paths).toContain("/v1/transcript")
    expect(result.quality).toBe("full")
  })

  it("refuses a video longer than a reel can be", async () => {
    const result = await extract(reel, {
      duration: reelAudio.maxDurationSeconds + 1,
    })

    expect(result.paths).not.toContain("/v1/transcript")
    // A video we declined to transcribe is still a video without its audio.
    expect(result.quality).toBe("partial")
  })

  it.each([
    [
      "a /tv/ item, which runs to an hour",
      "https://www.instagram.com/tv/DeFRiX9ysWr/",
    ],
    ["a /p/ post", "https://www.instagram.com/p/DeFRiX9ysWr/"],
  ])("never spends the audio allowance on %s", async (_label, url) => {
    const result = await extract(url, { duration: 30 })

    expect(result.paths).not.toContain("/v1/transcript")
  })

  it.each(["image", "carousel", "post"] as const)(
    "never spends the audio allowance on %s media",
    async (type) => {
      const result = await extract(reel, { type, duration: 30 })

      expect(result.paths).not.toContain("/v1/transcript")
    }
  )

  it("never spends the audio allowance when the media is unreachable", async () => {
    const result = await extract(reel, null)

    expect(result.paths).not.toContain("/v1/transcript")
    expect(result.quality).toBe("partial")
  })
})
