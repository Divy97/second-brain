import { describe, expect, it } from "vitest"

import { parseVideoLink } from "../src/lib/video-url.js"

const videoId = "dQw4w9WgXcQ"
const canonical = `https://www.youtube.com/watch?v=${videoId}`

describe("parseVideoLink", () => {
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
    expect(parseVideoLink(url)).toEqual({
      platform: "youtube",
      videoId,
      canonicalUrl: canonical,
    })
  })

  it("drops timestamps, playlists and tracking parameters", () => {
    const noisy = [
      `https://www.youtube.com/watch?v=${videoId}&t=42s`,
      `https://www.youtube.com/watch?v=${videoId}&list=PL1234&index=2`,
      `https://youtu.be/${videoId}?t=42&utm_source=newsletter`,
    ]
    for (const url of noisy) {
      expect(parseVideoLink(url)?.canonicalUrl).toBe(canonical)
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
    expect(parseVideoLink(url)).toBeNull()
  })
})
