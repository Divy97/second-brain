import { describe, expect, it } from "vitest"

import { dedupeKey, parseMediaLink } from "../src/lib/media-url.js"

const videoId = "dQw4w9WgXcQ"
const canonical = `https://www.youtube.com/watch?v=${videoId}`

describe("parseMediaLink: YouTube", () => {
  it.each([
    `https://www.youtube.com/watch?v=${videoId}`,
    `https://youtube.com/watch?v=${videoId}`,
    `https://m.youtube.com/watch?v=${videoId}`,
    `https://music.youtube.com/watch?v=${videoId}`,
    `https://youtu.be/${videoId}`,
    `https://www.youtube.com/shorts/${videoId}`,
    `https://www.youtube.com/live/${videoId}`,
    `https://www.youtube.com/embed/${videoId}`,
    `https://www.youtube-nocookie.com/embed/${videoId}`,
  ])("reduces %s to one canonical video", (url) => {
    expect(parseMediaLink(url)).toEqual({
      platform: "youtube",
      mediaId: videoId,
      canonicalUrl: canonical,
      instagramKind: null,
    })
  })

  it("drops timestamps, playlists and tracking parameters", () => {
    const noisy = [
      `https://www.youtube.com/watch?v=${videoId}&t=42s`,
      `https://www.youtube.com/watch?v=${videoId}&list=PL1234&index=2`,
      `https://youtu.be/${videoId}?t=42&utm_source=newsletter`,
    ]
    for (const url of noisy) {
      expect(parseMediaLink(url)?.canonicalUrl).toBe(canonical)
    }
  })

  it.each([
    "https://example.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/",
    "https://www.youtube.com/@channel",
    "https://www.youtube.com/playlist?list=PL1234",
    "https://www.youtube.com/watch",
    "https://www.youtube.com/watch?v=tooshort",
    "https://www.youtube.com/watch?v=waytoolongforanid",
    "https://www.youtube.com/shorts/",
    "https://youtu.be/",
    `https://youtu.be/${videoId}/extra`,
    `https://notyoutube.com/watch?v=${videoId}`,
    `https://www.youtube.com.evil.test/watch?v=${videoId}`,
    `ftp://www.youtube.com/watch?v=${videoId}`,
    "not a url",
  ])("refuses %s rather than guessing", (url) => {
    expect(parseMediaLink(url)).toBeNull()
  })
})

const shortcode = "C1a2B3c4D5e"

describe("parseMediaLink: Instagram", () => {
  it.each([
    [`https://www.instagram.com/p/${shortcode}/`, "p"],
    [`https://instagram.com/p/${shortcode}`, "p"],
    [`https://www.instagram.com/reel/${shortcode}/`, "reel"],
    [`https://www.instagram.com/reels/${shortcode}/`, "reel"],
    [`https://www.instagram.com/tv/${shortcode}/`, "tv"],
    [`https://instagr.am/p/${shortcode}/`, "p"],
    [`https://www.instagram.com/someuser/p/${shortcode}/`, "p"],
  ])("reduces %s to its media", (url, kind) => {
    expect(parseMediaLink(url)).toEqual({
      platform: "instagram",
      mediaId: shortcode,
      canonicalUrl: `https://www.instagram.com/${kind}/${shortcode}/`,
      instagramKind: kind,
    })
  })

  it("drops sharing parameters", () => {
    expect(
      parseMediaLink(
        `https://www.instagram.com/reel/${shortcode}/?igsh=ABC123&utm_source=ig_web`
      )?.canonicalUrl
    ).toBe(`https://www.instagram.com/reel/${shortcode}/`)
  })

  it("treats a post and a reel of the same media as one item", () => {
    const asPost = parseMediaLink(`https://www.instagram.com/p/${shortcode}/`)
    const asReel = parseMediaLink(
      `https://www.instagram.com/reel/${shortcode}/`
    )
    expect(asPost && dedupeKey(asPost)).toBe(asReel && dedupeKey(asReel))
  })

  it.each([
    "https://www.instagram.com/",
    "https://www.instagram.com/someuser",
    "https://www.instagram.com/stories/someuser/12345",
    "https://www.instagram.com/p/",
    `https://www.instagram.com/explore/${shortcode}/`,
    `https://www.instagram.com.evil.test/p/${shortcode}/`,
    `https://notinstagram.com/p/${shortcode}/`,
    "https://www.instagram.com/p/no!/",
    `https://www.instagram.com/explore/p/${shortcode}/`,
    `https://www.instagram.com/accounts/p/${shortcode}/`,
  ])("refuses %s rather than guessing", (url) => {
    expect(parseMediaLink(url)).toBeNull()
  })
})

describe("dedupeKey", () => {
  it("separates platforms that could share a media id", () => {
    const youtube = parseMediaLink(`https://youtu.be/${videoId}`)
    const instagram = parseMediaLink(`https://www.instagram.com/p/${videoId}/`)
    expect(youtube && dedupeKey(youtube)).not.toBe(
      instagram && dedupeKey(instagram)
    )
  })
})
