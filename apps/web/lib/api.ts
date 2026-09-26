export const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787"

export interface DatabaseHealth {
  ok: true
  latencyMs: number
  serverVersion: string
  pgvectorVersion: string
}

export interface HealthResponse {
  ok: boolean
  version: string
  database: DatabaseHealth | { ok: false; error: string }
}

export type HealthResult =
  | { reachable: true; health: HealthResponse }
  | { reachable: false; error: string }

export async function fetchHealth(): Promise<HealthResult> {
  try {
    const response = await fetch(`${apiBaseUrl}/health`, { cache: "no-store" })
    const health = (await response.json()) as HealthResponse
    return { reachable: true, health }
  } catch (error) {
    const message = error instanceof Error ? error.message : "request failed"
    return { reachable: false, error: message }
  }
}
