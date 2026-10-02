import { apiOrigin } from "./config"

export interface CapturePayload {
  url: string
  title: string
  text?: string
  trigger: "manual" | "passive"
}

export type PostOutcome =
  | { kind: "accepted"; created: boolean }
  | { kind: "rejected"; message: string }
  | { kind: "unauthorized" }
  | { kind: "retry" }

const FALLBACK_REJECTION = "Second Brain could not save this page."

export async function postCapture(
  token: string,
  payload: CapturePayload
): Promise<PostOutcome> {
  let response: Response
  try {
    response = await fetch(`${apiOrigin}/ext/captures`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    })
  } catch {
    return { kind: "retry" }
  }

  if (response.status === 401) return { kind: "unauthorized" }
  if (response.ok) return { kind: "accepted", created: response.status === 201 }
  if (response.status === 429 || response.status >= 500) {
    return { kind: "retry" }
  }
  return { kind: "rejected", message: await rejectionMessage(response) }
}

async function rejectionMessage(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null)
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "object" &&
    body.error !== null &&
    "message" in body.error &&
    typeof body.error.message === "string"
  ) {
    return body.error.message
  }
  return FALLBACK_REJECTION
}
