import { createAuthClient } from "better-auth/react"

import { apiBaseUrl } from "./api"

export const authClient = createAuthClient({ baseURL: apiBaseUrl })

const messagesByCode: Record<string, string> = {
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
    "An account with this email already exists.",
  INVALID_EMAIL_OR_PASSWORD: "Email or password is incorrect.",
  INVALID_EMAIL: "Enter a valid email address.",
  PASSWORD_TOO_SHORT: "Use at least 8 characters for your password.",
  PASSWORD_TOO_LONG: "Use at most 128 characters for your password.",
}

export function describeAuthError(error: {
  code?: string
  message?: string
  status: number
}): string {
  const known = error.code ? messagesByCode[error.code] : undefined
  if (known) return known
  if (error.status === 429) {
    return "Too many attempts. Wait a minute and try again."
  }
  return error.message ?? "Something went wrong. Try again."
}
