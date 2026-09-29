export interface MediaLink {
  platform: "youtube" | "instagram"
  mediaId: string
  /** The form sent to providers: normalised, but still the kind of link it is. */
  canonicalUrl: string
}

/** One media is one item, whichever link form or path kind it arrived as. */
export const dedupeKey = (link: MediaLink): string =>
  `${link.platform}:${link.mediaId}`

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
])

const YOUTUBE_SHORT_HOSTS = new Set(["youtu.be", "www.youtu.be"])

const INSTAGRAM_HOSTS = new Set([
  "instagram.com",
  "www.instagram.com",
  "instagr.am",
  "www.instagr.am",
])

const YOUTUBE_PREFIXES = ["shorts", "live", "embed", "v"]

// Meta documents /p/ and /reel/ only; /tv/ and the /{username}/p/ form come from the
// oEmbed registry, and /reels/ from neither. No source specifies the shortcode
// alphabet. See docs/research/16-instagram-ingestion.md.
const INSTAGRAM_PREFIXES = new Map([
  ["p", "p"],
  ["reel", "reel"],
  ["reels", "reel"],
  ["tv", "tv"],
])

// Google's own example ids are opaque 11-character tokens. No primary source states
// either grammar, so anything else is rejected rather than guessed at.
const YOUTUBE_ID = /^[\w-]{11}$/
const INSTAGRAM_SHORTCODE = /^[\w-]{5,30}$/

function youtubeIdFrom(url: URL, segments: string[]): string | null {
  if (YOUTUBE_SHORT_HOSTS.has(url.hostname.toLowerCase())) {
    return segments.length === 1 ? (segments[0] ?? null) : null
  }
  const [first, second] = segments
  if (first === "watch") return url.searchParams.get("v")
  if (first && second && YOUTUBE_PREFIXES.includes(first)) return second
  return null
}

/** Instagram nests the same media under /{username}/p/{shortcode} as under /p/{shortcode}. */
function instagramMediaFrom(segments: string[]): [string, string] | null {
  const tail = segments.length === 3 ? segments.slice(1) : segments
  if (tail.length !== 2) return null
  const [prefix, shortcode] = tail
  const kind = prefix ? INSTAGRAM_PREFIXES.get(prefix) : undefined
  return kind && shortcode ? [kind, shortcode] : null
}

/** Recognises a supported media link and reduces it to one media. Null for anything else. */
export function parseMediaLink(value: string): MediaLink | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null

  const hostname = url.hostname.toLowerCase()
  const segments = url.pathname.split("/").filter(Boolean)

  if (YOUTUBE_HOSTS.has(hostname) || YOUTUBE_SHORT_HOSTS.has(hostname)) {
    const mediaId = youtubeIdFrom(url, segments)
    if (!mediaId || !YOUTUBE_ID.test(mediaId)) return null
    return {
      platform: "youtube",
      mediaId,
      canonicalUrl: `https://www.youtube.com/watch?v=${mediaId}`,
    }
  }

  if (INSTAGRAM_HOSTS.has(hostname)) {
    const media = instagramMediaFrom(segments)
    if (!media) return null
    const [kind, mediaId] = media
    if (!INSTAGRAM_SHORTCODE.test(mediaId)) return null
    return {
      platform: "instagram",
      mediaId,
      canonicalUrl: `https://www.instagram.com/${kind}/${mediaId}/`,
    }
  }

  return null
}
