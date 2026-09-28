const placeholderOrigin = "http://next.invalid"

export function safeNextPath(candidate: string | null): string {
  if (!candidate?.startsWith("/")) return "/home"
  const resolved = new URL(candidate, placeholderOrigin)
  if (resolved.origin !== placeholderOrigin) return "/home"
  return `${resolved.pathname}${resolved.search}${resolved.hash}`
}
