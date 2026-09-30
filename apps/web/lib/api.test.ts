import { afterEach, describe, expect, it, vi } from "vitest"

import { apiRequest, fetchHealth } from "./api"

function stubFetch(body: unknown) {
  const fetchMock = vi.fn(() => Promise.resolve(Response.json(body)))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("apiRequest", () => {
  it("calls the API through the web origin's /api prefix with credentials", async () => {
    const fetchMock = stubFetch({ items: [] })

    await apiRequest("/items")

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/items",
      expect.objectContaining({ credentials: "include" })
    )
  })
})

describe("fetchHealth", () => {
  it("reaches the Worker directly from the server", async () => {
    vi.stubEnv("API_ORIGIN", "https://worker.example")
    const fetchMock = stubFetch({
      ok: true,
      version: "1",
      database: { ok: true },
    })

    await fetchHealth()

    expect(fetchMock).toHaveBeenCalledWith(
      "https://worker.example/health",
      expect.anything()
    )
  })

  it("defaults to the local Worker", async () => {
    const fetchMock = stubFetch({
      ok: true,
      version: "1",
      database: { ok: true },
    })

    await fetchHealth()

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8787/health",
      expect.anything()
    )
  })
})
