import { beforeEach, describe, expect, it, vi } from "vitest"

const stored = new Map<string, unknown>()

vi.mock("@wxt-dev/storage", () => ({
  storage: {
    getItem: (key: string) => Promise.resolve(stored.get(key) ?? null),
    setItem: (key: string, value: unknown) => {
      stored.set(key, value)
      return Promise.resolve()
    },
    removeItem: (key: string) => {
      stored.delete(key)
      return Promise.resolve()
    },
  },
}))

vi.mock("./config", () => ({ apiOrigin: "https://api.test" }))

const tab = { id: 7, url: "https://news.example.com/story", title: "A story" }

function readablePage(text: string | undefined) {
  vi.stubGlobal("browser", {
    scripting: {
      executeScript: vi.fn(() => Promise.resolve([{ result: text }])),
    },
  })
}

function unreadablePage() {
  vi.stubGlobal("browser", {
    scripting: { executeScript: vi.fn(() => Promise.reject(new Error("no access"))) },
  })
}

function apiAnswers(status: number, body: unknown = {}) {
  const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
    Promise.resolve(new Response(JSON.stringify(body), { status }))
  )
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function sentBody(fetchMock: ReturnType<typeof apiAnswers>) {
  const init = fetchMock.mock.calls[0]?.[1]
  return JSON.parse(init?.body as string) as Record<string, unknown>
}

beforeEach(() => {
  stored.clear()
  stored.set("local:token", "sbx_token")
  vi.unstubAllGlobals()
})

describe("savePage", () => {
  it("sends the page to Second Brain as a manual capture and says it was saved", async () => {
    readablePage("The full text of the story.")
    const fetchMock = apiAnswers(201, { id: "i1", status: "pending", created: true })
    const { savePage } = await import("./save-page")

    const result = await savePage(tab)

    expect(result).toEqual({ status: "saved", title: "A story", alreadySaved: false })
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.test/ext/captures")
    expect(sentBody(fetchMock)).toEqual({
      url: tab.url,
      title: "A story",
      text: "The full text of the story.",
      trigger: "manual",
    })
  })

  it("says so when the page was already in Second Brain", async () => {
    readablePage("Text.")
    apiAnswers(200, { id: "i1", status: "ready", created: false })
    const { savePage } = await import("./save-page")

    expect(await savePage(tab)).toEqual({
      status: "saved",
      title: "A story",
      alreadySaved: true,
    })
  })

  it("still sends the link when the page text cannot be read, as for a PDF", async () => {
    unreadablePage()
    const fetchMock = apiAnswers(201, { id: "i2", status: "pending", created: true })
    const { savePage } = await import("./save-page")

    const result = await savePage({ id: 7, url: "https://example.com/paper.pdf", title: "paper.pdf" })

    expect(result.status).toBe("saved")
    const body = sentBody(fetchMock)
    expect(body.text).toBeUndefined()
    expect(body.trigger).toBe("manual")
  })

  it("does not try to save browser pages", async () => {
    readablePage("x")
    const fetchMock = apiAnswers(201)
    const { savePage } = await import("./save-page")

    const result = await savePage({ id: 1, url: "chrome://extensions", title: "Extensions" })

    expect(result).toEqual({ status: "unsupported" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("asks to connect when there is no device key", async () => {
    stored.clear()
    const fetchMock = apiAnswers(201)
    const { savePage } = await import("./save-page")

    expect(await savePage(tab)).toEqual({ status: "not-connected" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("forgets the key and asks to reconnect when the device was revoked", async () => {
    readablePage("Text.")
    apiAnswers(401, { error: { code: "unauthenticated", message: "no" } })
    const { savePage } = await import("./save-page")

    expect(await savePage(tab)).toEqual({ status: "not-connected" })
    expect(stored.has("local:token")).toBe(false)
  })

  it("reports the API's reason when it refuses the page", async () => {
    readablePage(undefined)
    apiAnswers(400, { error: { code: "invalid_request", message: "This page had no readable text." } })
    const { savePage } = await import("./save-page")

    expect(await savePage(tab)).toEqual({
      status: "rejected",
      message: "This page had no readable text.",
    })
    expect(stored.get("local:queue")).toBeUndefined()
  })

  it.each([
    ["the API is unreachable", () => vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("offline"))))],
    ["the API has an outage", () => apiAnswers(503)],
    ["the device is rate limited", () => apiAnswers(429)],
  ])("keeps the page for a retry when %s", async (_name, arrange) => {
    readablePage("Text.")
    arrange()
    const { savePage } = await import("./save-page")

    expect(await savePage(tab)).toEqual({ status: "queued" })
    const queue = stored.get("local:queue") as { url: string; trigger: string }[]
    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({ url: tab.url, trigger: "manual" })
  })
})
