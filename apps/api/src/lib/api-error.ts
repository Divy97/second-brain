import type { Context } from "hono"
import type { ContentfulStatusCode } from "hono/utils/http-status"

export type ApiErrorCode =
  | "unauthenticated"
  | "rate_limited"
  | "invalid_request"
  | "invalid_grant"
  | "invalid_key"
  | "missing_key"
  | "not_found"
  | "duplicate"
  | "conflict"
  | "insufficient_credits"
  | "model_unavailable"
  | "upstream_unavailable"
  | "queue_unavailable"
  | "storage_unavailable"

export function apiError(
  c: Context,
  status: ContentfulStatusCode,
  code: ApiErrorCode,
  message: string
): Response {
  return c.json({ error: { code, message } }, status)
}
