const placeholderOrigin = "http://next.invalid"

export function safeNextPath(candidate: string | null): string {
  if (!candidate?.startsWith("/")) return "/"
  const resolved = new URL(candidate, placeholderOrigin)
  if (resolved.origin !== placeholderOrigin) return "/"
  return `${resolved.pathname}${resolved.search}${resolved.hash}`
}
