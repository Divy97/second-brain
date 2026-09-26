import { vi } from "vitest"

export interface OpenRouterStub {
  calls: Request[]
  rejectKeys: (keys: string[]) => void
  restore: () => void
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })

export function stubOpenRouter(): OpenRouterStub {
  const calls: Request[] = []
  const rejected = new Set<string>()
  const realFetch = globalThis.fetch

  const spy = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input, init) => {
      const outgoing = new Request(input, init)
      const url = new URL(outgoing.url)
      if (url.hostname !== "openrouter.ai") return realFetch(input, init)
      calls.push(outgoing)

      const apiKey = outgoing.headers
        .get("authorization")
        ?.replace(/^Bearer /, "")
      if (!apiKey || rejected.has(apiKey)) {
        return json(401, { error: { message: "User not found.", code: 401 } })
      }
      if (url.pathname === "/api/v1/key") {
        return json(200, {
          data: { label: "stub", limit: null, limit_remaining: null, usage: 0 },
        })
      }
      return json(404, { error: { message: `unstubbed ${url.pathname}` } })
    })

  return {
    calls,
    rejectKeys: (keys) => {
      keys.forEach((key) => rejected.add(key))
    },
    restore: () => {
      spy.mockRestore()
    },
  }
}
