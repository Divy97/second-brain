import { authPagePath, type AuthMode } from "./auth-page-path"

export const googleSignInEnabled =
  process.env.NEXT_PUBLIC_GOOGLE_SIGN_IN === "on"

const messageByErrorCode: Record<string, string> = {
  account_not_linked:
    "An account with this email already exists. Sign in with your password.",
  access_denied: "Google sign-in was cancelled.",
}

export function authPageErrorMessage(code: string | null): string | null {
  if (!code) return null
  return messageByErrorCode[code] ?? "Could not sign in with Google. Try again."
}

export function googleSignInOptions(mode: AuthMode, next: string) {
  return {
    provider: "google" as const,
    callbackURL: next,
    newUserCallbackURL: next,
    errorCallbackURL: authPagePath(mode, next),
  }
}
