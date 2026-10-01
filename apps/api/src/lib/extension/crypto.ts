function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "")
}

async function sha256(text: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  )
  return new Uint8Array(digest)
}

export function newAuthorizationCode(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)))
}

export async function hashAuthorizationCode(code: string): Promise<string> {
  return base64Url(await sha256(code))
}

// PKCE S256 (RFC 7636): the challenge is the base64url SHA-256 of the verifier.
export async function matchesChallenge(
  verifier: string,
  challenge: string
): Promise<boolean> {
  return (await hashAuthorizationCode(verifier)) === challenge
}
