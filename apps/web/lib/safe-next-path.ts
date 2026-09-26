export function safeNextPath(candidate: string | null): string {
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return "/"
  }
  return candidate
}
