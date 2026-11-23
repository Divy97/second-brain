import { describe, expect, it } from "vitest"

import {
  DEFAULT_BLOCKLIST,
  PASSIVE_DWELL_MS,
  decidePassiveCapture,
} from "./passive-capture"

const settings = {
  passiveEnabled: true,
  passiveMode: "store" as const,
  paused: false,
  blocklist: [],
}

const visit = {
  url: "https://news.example.com/story",
  incognito: false,
  visitedAt: 1000,
  text: "An article worth remembering.",
}

describe("decidePassiveCapture", () => {
  it("waits for the dwell threshold, then captures readable pages", () => {
    expect(decidePassiveCapture(visit, settings, 1000)).toEqual({
      kind: "wait",
      until: 1000 + PASSIVE_DWELL_MS,
    })
    expect(
      decidePassiveCapture(visit, settings, 1000 + PASSIVE_DWELL_MS)
    ).toEqual({
      kind: "capture",
      trigger: "passive",
    })
  })

  it.each([
    ["disabled", { ...settings, passiveEnabled: false }, "disabled"],
    ["paused", { ...settings, paused: true }, "disabled"],
    ["incognito", settings, "incognito", { ...visit, incognito: true }],
    [
      "browser page",
      settings,
      "unsupported-url",
      { ...visit, url: "chrome://settings" },
    ],
    [
      "video",
      settings,
      "link-only",
      { ...visit, url: "https://youtube.com/watch?v=1" },
    ],
    ["empty page", settings, "no-readable-text", { ...visit, text: "  " }],
  ])("skips %s", (_name, configured, reason, changed = visit) => {
    expect(
      decidePassiveCapture(changed, configured, 1000 + PASSIVE_DWELL_MS)
    ).toEqual({
      kind: "skip",
      reason,
    })
  })

  it("blocks a configured domain and its subdomains", () => {
    expect(
      decidePassiveCapture(
        { ...visit, url: "https://mail.google.com/inbox" },
        settings,
        1000 + PASSIVE_DWELL_MS
      )
    ).toEqual({ kind: "skip", reason: "blocked" })
  })

  it("ships a sensitive-site blocklist", () => {
    expect(DEFAULT_BLOCKLIST).toContain("gmail.com")
  })

  it("does not recapture a page during the cooldown", () => {
    expect(
      decidePassiveCapture(
        { ...visit, lastCapturedAt: 1000 },
        settings,
        1000 + PASSIVE_DWELL_MS + 1
      )
    ).toEqual({ kind: "skip", reason: "recently-captured" })
  })
})
