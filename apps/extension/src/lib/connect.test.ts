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

const validKey = "sbx_abcdefghijklmnopqrstuvwxyz0123456789"

function respondWith(status: number, body: unknown = {}) {
  const fetchMock = vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status }))
  )
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

beforeEach(() => {
  stored.clear()
  vi.unstubAllGlobals()
})

describe("connectWithKey", () => {
  it("stores the key and reports the account when the API accepts it", async () => {
    const fetchMock = respondWith(200, {
      email: "divy@example.com",
      deviceLabel: "Brave work profile",
    })
    const { connectWithKey } = await import("./connect")

    const result = await connectWithKey(validKey)

    expect(result).toEqual({ ok: true, email: "divy@example.com" })
    expect(stored.get("local:token")).toBe(validKey)
    expect(fetchMock).toHaveBeenCalledWith("https://api.test/ext/me", {
      headers: { authorization: `Bearer ${validKey}` },
    })
  })

  it("ignores spaces and newlines around a pasted key", async () => {
    respondWith(200, { email: "divy@example.com", deviceLabel: "x" })
    const { connectWithKey } = await import("./connect")

    const result = await connectWithKey(`  ${validKey}\n`)

    expect(result.ok).toBe(true)
    expect(stored.get("local:token")).toBe(validKey)
  })

  it("rejects an empty paste without calling the API", async () => {
    const fetchMock = respondWith(200)
    const { connectWithKey } = await import("./connect")

    expect(await connectWithKey("   ")).toEqual({ ok: false, reason: "empty" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("rejects something that is not a device key without calling the API", async () => {
    const fetchMock = respondWith(200)
    const { connectWithKey } = await import("./connect")

    expect(await connectWithKey("hello world")).toEqual({
      ok: false,
      reason: "malformed",
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(stored.size).toBe(0)
  })

  it("stores nothing when the API says the key is invalid or revoked", async () => {
    respondWith(401, { error: { code: "unauthenticated", message: "no" } })
    const { connectWithKey } = await import("./connect")

    expect(await connectWithKey(validKey)).toEqual({
      ok: false,
      reason: "invalid",
    })
    expect(stored.size).toBe(0)
  })

  it("tells a server error apart from a bad key and stores nothing", async () => {
    respondWith(500)
    const { connectWithKey } = await import("./connect")

    expect(await connectWithKey(validKey)).toEqual({
      ok: false,
      reason: "unreachable",
    })
    expect(stored.size).toBe(0)
  })

  it("reports an unreachable API when the request fails outright", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch")))
    )
    const { connectWithKey } = await import("./connect")

    expect(await connectWithKey(validKey)).toEqual({
      ok: false,
      reason: "unreachable",
    })
    expect(stored.size).toBe(0)
  })
})

describe("disconnect", () => {
  it("clears the key and the cached capture settings", async () => {
    stored.set("local:token", validKey)
    stored.set("local:settings", { passiveEnabled: true })
    const { disconnect } = await import("./connect")

    await disconnect()

    expect(stored.size).toBe(0)
  })
})
