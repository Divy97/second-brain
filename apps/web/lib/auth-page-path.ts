export type AuthMode = "sign-in" | "sign-up"

export function authPagePath(mode: AuthMode, next: string): string {
  const path = `/${mode}`
  return next === "/home" ? path : `${path}?next=${encodeURIComponent(next)}`
}
