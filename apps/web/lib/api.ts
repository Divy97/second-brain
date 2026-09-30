import { workerOrigin } from "./worker-origin"

export const apiBaseUrl = "/api"

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
    const response = await fetch(`${workerOrigin()}/health`, {
      cache: "no-store",
    })
    const health = (await response.json()) as HealthResponse
    return { reachable: true, health }
  } catch (error) {
    const message = error instanceof Error ? error.message : "request failed"
    return { reachable: false, error: message }
  }
}

export interface ApiErrorBody {
  error: { code: string; message: string }
}

export class ApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
  }
}

function isApiErrorBody(body: unknown): body is ApiErrorBody {
  return (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "object" &&
    body.error !== null &&
    "code" in body.error &&
    "message" in body.error
  )
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {}
): Promise<T> {
  const { json, headers, body: requestBody, ...rest } = init
  const mergedHeaders = new Headers(headers)
  if (json !== undefined) mergedHeaders.set("content-type", "application/json")
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...rest,
    credentials: "include",
    headers: mergedHeaders,
    body: json === undefined ? requestBody : JSON.stringify(json),
  })
  const body: unknown =
    response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    if (isApiErrorBody(body)) {
      throw new ApiError(response.status, body.error.code, body.error.message)
    }
    throw new ApiError(
      response.status,
      "unexpected",
      `The API answered ${response.status}. Try again.`
    )
  }
  return body as T
}

export const fetchJson = <T>(path: string) => apiRequest<T>(path)
