import { ApiError } from "@/lib/api"

export const emptyNoteMessage = "Write something before saving."

export function describeApiError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "The API could not be reached. Check your connection and try again."
}
