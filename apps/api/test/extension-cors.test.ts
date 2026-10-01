import { describe, expect, it } from "vitest"

import { request } from "./support/http.js"

function preflight(path: string, origin: string): Promise<Response> {
  return request(path, {
    method: "OPTIONS",
    headers: {
      origin,
      "access-control-request-method": "POST",
      "access-control-request-headers": "authorization,content-type",
    },
  })
}

describe("extension CORS", () => {
  it.each([
    "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
    "moz-extension://0f7c1e2a-1234-4abc-9def-0123456789ab",
  ])(
    "lets %s call the extension routes without credentials",
    async (origin) => {
      for (const path of ["/ext/captures", "/extension/token"]) {
        const response = await preflight(path, origin)

        expect(response.status, path).toBe(204)
        expect(response.headers.get("access-control-allow-origin")).toBe(origin)
        expect(
          response.headers.get("access-control-allow-credentials")
        ).toBeNull()
        expect(response.headers.get("access-control-allow-headers")).toMatch(
          /authorization/i
        )
      }
    }
  )

  it("answers a normal extension request with the same origin header", async () => {
    const origin = "chrome-extension://abcdefghijklmnopabcdefghijklmnop"

    const response = await request("/ext/me", { headers: { origin } })

    expect(response.status).toBe(401)
    expect(response.headers.get("access-control-allow-origin")).toBe(origin)
  })

  it("does not open the extension routes to ordinary websites", async () => {
    const response = await preflight("/ext/captures", "https://evil.example")

    expect(response.headers.get("access-control-allow-origin")).toBeNull()
  })

  it("does not open session routes to extension origins", async () => {
    const response = await preflight(
      "/items",
      "chrome-extension://abcdefghijklmnopabcdefghijklmnop"
    )

    expect(response.headers.get("access-control-allow-origin")).toBeNull()
  })

  it("still lets the web app call the API with credentials", async () => {
    const response = await preflight("/items", "https://second-brain.test")

    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://second-brain.test"
    )
    expect(response.headers.get("access-control-allow-credentials")).toBe(
      "true"
    )
  })
})
