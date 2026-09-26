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
  init: Omit<RequestInit, "body"> & { json?: unknown } = {}
): Promise<T> {
  const { json, headers, ...rest } = init
  const mergedHeaders = new Headers(headers)
  if (json !== undefined) mergedHeaders.set("content-type", "application/json")
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...rest,
    credentials: "include",
    headers: mergedHeaders,
    body: json === undefined ? undefined : JSON.stringify(json),
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

export type KeyStatus = { set: false } | { set: true; last4: string }

export interface KeySettings {
  openrouter: KeyStatus
}

export const keySettingsPath = "/keys"

export const fetchKeySettings = () => apiRequest<KeySettings>(keySettingsPath)

export const saveOpenRouterKey = (key: string) =>
  apiRequest<KeySettings>("/keys/openrouter", { method: "PUT", json: { key } })

export const removeOpenRouterKey = () =>
  apiRequest<KeySettings>("/keys/openrouter", { method: "DELETE" })

export type ItemStatus = "pending" | "processing" | "ready" | "failed"

export interface ItemSummary {
  id: string
  status: ItemStatus
  kind: string | null
  title: string | null
  excerpt: string
  capturedAt: string
}

export interface ItemDetail extends ItemSummary {
  rawText: string
  cleanText: string | null
  summary: string | null
  language: string | null
  tags: string[]
  failureReason: string | null
  error: string | null
  captures: string[]
}

export interface ItemPage {
  items: ItemSummary[]
  nextCursor: string | null
}

export const itemPagePath = (cursor: string | null) =>
  cursor ? `/items?cursor=${encodeURIComponent(cursor)}` : "/items"

export const itemPath = (id: string) => `/items/${id}`

export const fetchJson = <T>(path: string) => apiRequest<T>(path)

export const saveItem = (text: string) =>
  apiRequest<ItemSummary>("/items", { method: "POST", json: { text } })

export const editItem = (id: string, text: string) =>
  apiRequest<ItemDetail>(itemPath(id), { method: "PATCH", json: { text } })

export const deleteItem = (id: string) =>
  apiRequest<null>(itemPath(id), { method: "DELETE" })
