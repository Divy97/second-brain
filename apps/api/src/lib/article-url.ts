export function unsafeHostname(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local")
  ) {
    return true
  }
  const ipv4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host)
  if (ipv4) {
    const a = Number(ipv4[1])
    const b = Number(ipv4[2])
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    )
  }
  if (/^\d+$/.test(host)) return true
  return host.startsWith("[") || host.endsWith(".internal")
}

export function safeArticleUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (!["http:", "https:"].includes(url.protocol)) return null
    if (url.username || url.password || unsafeHostname(url.hostname))
      return null
    url.hash = ""
    return url.toString()
  } catch {
    return null
  }
}
