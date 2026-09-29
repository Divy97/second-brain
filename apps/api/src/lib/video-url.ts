export interface VideoLink {
  platform: "youtube"
  videoId: string
  /** One canonical form per video, so the same video saved from any link is one item. */
  canonicalUrl: string
}

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
])

const YOUTUBE_SHORT_HOSTS = new Set(["youtu.be", "www.youtu.be"])

const PATH_PREFIXES = ["shorts", "live", "embed", "v"]

// Google's own example ids are opaque 11-character tokens. No primary source states
// the grammar, so anything else is rejected rather than guessed at.
// See docs/research/15-youtube-ingestion.md.
const VIDEO_ID = /^[\w-]{11}$/

function videoIdFrom(url: URL): string | null {
  const segments = url.pathname.split("/").filter(Boolean)

  if (YOUTUBE_SHORT_HOSTS.has(url.hostname.toLowerCase())) {
    return segments.length === 1 ? (segments[0] ?? null) : null
  }

  const [first, second] = segments
  if (first === "watch") return url.searchParams.get("v")
  if (first && second && PATH_PREFIXES.includes(first)) return second
  return null
}

/** Recognises a YouTube link and reduces it to its video. Returns null for anything else. */
export function parseVideoLink(value: string): VideoLink | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null

  const hostname = url.hostname.toLowerCase()
  if (!YOUTUBE_HOSTS.has(hostname) && !YOUTUBE_SHORT_HOSTS.has(hostname)) {
    return null
  }

  const videoId = videoIdFrom(url)
  if (!videoId || !VIDEO_ID.test(videoId)) return null

  return {
    platform: "youtube",
    videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
  }
}
