import { request, sessionCookieFrom, type Session } from "./http.js"

export interface GoogleProfile {
  sub: string
  email: string
  name: string
  email_verified: boolean
  picture?: string
}

const tokenHost = "oauth2.googleapis.com"

function base64Url(value: string): string {
  return btoa(value)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "")
}

function idTokenFor(profile: GoogleProfile): string {
  const header = base64Url(JSON.stringify({ alg: "none", typ: "JWT" }))
  const payload = base64Url(
    JSON.stringify({ ...profile, iss: "https://accounts.google.com" })
  )
  return `${header}.${payload}.`
}

export interface GoogleStub {
  signsInAs: (profile: GoogleProfile) => void
  restore: () => void
}

export function stubGoogle(): GoogleStub {
  const realFetch = globalThis.fetch
  let current: GoogleProfile | null = null

  globalThis.fetch = async (input, init) => {
    const outgoing = new Request(input, init)
    if (new URL(outgoing.url).hostname !== tokenHost) {
      return realFetch(input, init)
    }
    if (!current) return new Response("no profile", { status: 400 })
    return Response.json({
      access_token: "google-access-token",
      token_type: "Bearer",
      expires_in: 3600,
      id_token: idTokenFor(current),
    })
  }

  return {
    signsInAs: (profile) => {
      current = profile
    },
    restore: () => {
      globalThis.fetch = realFetch
    },
  }
}

export interface GoogleCallbackResult {
  location: string
  session: Session | null
}

export async function completeGoogleSignIn(
  options: {
    callbackURL?: string
    errorCallbackURL?: string
    returned?: (state: string) => string
  } = {}
): Promise<GoogleCallbackResult> {
  const start = await request("/api/auth/sign-in/social", {
    method: "POST",
    json: {
      provider: "google",
      callbackURL: options.callbackURL ?? "/home",
      errorCallbackURL: options.errorCallbackURL ?? "/sign-in",
    },
  })
  const { url } = await start.json<{ url: string }>()
  const state = new URL(url).searchParams.get("state") ?? ""
  const stateCookies = start.headers
    .getSetCookie()
    .map((header) => header.split(";")[0] ?? "")
    .join("; ")

  const returned =
    options.returned?.(state) ?? `code=google-code&state=${state}`
  const callback = await request(`/api/auth/callback/google?${returned}`, {
    headers: { cookie: stateCookies },
    redirect: "manual",
  })

  const hasSession = callback.headers
    .getSetCookie()
    .some((header) => header.includes("session_token="))
  return {
    location: callback.headers.get("location") ?? "",
    session: hasSession
      ? { userId: "", email: "", cookie: sessionCookieFrom(callback) }
      : null,
  }
}
