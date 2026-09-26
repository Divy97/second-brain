export type OpenRouterErrorKind =
  | "invalid_key"
  | "insufficient_credits"
  | "rate_limited"
  | "invalid_request"
  | "upstream"
  | "invalid_output"

export class OpenRouterError extends Error {
  readonly kind: OpenRouterErrorKind
  readonly status: number

  constructor(kind: OpenRouterErrorKind, message: string, status: number) {
    super(message)
    this.name = "OpenRouterError"
    this.kind = kind
    this.status = status
  }
}

const kindByStatus: Record<number, OpenRouterErrorKind> = {
  400: "invalid_request",
  401: "invalid_key",
  402: "insufficient_credits",
  403: "invalid_request",
  429: "rate_limited",
}

export function toOpenRouterError(
  status: number,
  body: unknown
): OpenRouterError {
  const message =
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "object" &&
    body.error !== null &&
    "message" in body.error &&
    typeof body.error.message === "string"
      ? body.error.message
      : `OpenRouter request failed with status ${status}`
  return new OpenRouterError(
    kindByStatus[status] ?? "upstream",
    message,
    status
  )
}
