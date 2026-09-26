import { exports } from "cloudflare:workers"
import { describe, expect, it } from "vitest"

interface HealthResponse {
  ok: boolean
  version: string
  database: {
    ok: boolean
    latencyMs: number
    serverVersion: string
    pgvectorVersion: string
  }
}

describe("GET /health", () => {
  it("reports the API version and a database round-trip", async () => {
    const response = await exports.default.fetch("http://api/health")

    expect(response.status).toBe(200)
    const body = await response.json<HealthResponse>()
    expect(body.ok).toBe(true)
    expect(body.version).toBe("0.0.1")
    expect(body.database.ok).toBe(true)
    expect(body.database.serverVersion).toMatch(/^17\./)
    expect(body.database.pgvectorVersion).toMatch(/^\d+\.\d+/)
  })

  it("is reachable without a session", async () => {
    const response = await exports.default.fetch("http://api/health")
    expect(response.status).toBe(200)
  })
})
