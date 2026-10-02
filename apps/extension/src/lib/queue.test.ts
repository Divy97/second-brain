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

const capture = {
  url: "https://news.example.com/story",
  title: "A story",
  text: "Text.",
  trigger: "manual" as const,
}

function apiAnswers(status: number) {
  const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
    Promise.resolve(new Response("{}", { status }))
  )
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

beforeEach(() => {
  stored.clear()
  stored.set("local:token", "sbx_token")
  vi.unstubAllGlobals()
})

describe("processQueue", () => {
  it("sends a queued capture with the fields the API requires and clears it", async () => {
    const fetchMock = apiAnswers(201)
    const { addToQueue, processQueue } = await import("./queue")
    await addToQueue(capture)

    await processQueue()

    const init = fetchMock.mock.calls[0]?.[1]
    expect(JSON.parse(init?.body as string)).toEqual(capture)
    expect(stored.get("local:queue")).toEqual([])
  })

  it("retries later when the API is down", async () => {
    apiAnswers(503)
    const { addToQueue, processQueue } = await import("./queue")
    await addToQueue(capture)

    await processQueue()

    const queue = stored.get("local:queue") as { attempts: number }[]
    expect(queue).toHaveLength(1)
    expect(queue[0]?.attempts).toBe(1)
  })

  it("drops a capture the API refuses instead of retrying it", async () => {
    apiAnswers(400)
    const { addToQueue, processQueue } = await import("./queue")
    await addToQueue(capture)

    await processQueue()

    expect(stored.get("local:queue")).toEqual([])
  })

  it("keeps the queue and forgets the key when the device was revoked", async () => {
    apiAnswers(401)
    const { addToQueue, processQueue } = await import("./queue")
    await addToQueue(capture)

    await processQueue()

    expect(stored.has("local:token")).toBe(false)
    expect(stored.get("local:queue")).toHaveLength(1)
  })
})
