import type { Context } from "hono"
import type { ContentfulStatusCode } from "hono/utils/http-status"

export type ApiErrorCode =
  | "unauthenticated"
  | "invalid_request"
  | "invalid_key"
  | "missing_key"
  | "upstream_unavailable"

export function apiError(
  c: Context,
  status: ContentfulStatusCode,
  code: ApiErrorCode,
  message: string
): Response {
  return c.json({ error: { code, message } }, status)
}
