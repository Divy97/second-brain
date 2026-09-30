import { exports } from "cloudflare:workers"

export const webOrigin = "https://second-brain.test"
export const apiOrigin = webOrigin

export interface Session {
  userId: string
  email: string
  cookie: string
}

export function request(
  path: string,
  init: RequestInit & { session?: Session; json?: unknown } = {}
): Promise<Response> {
  const { session, json, headers, ...rest } = init
  const merged = new Headers(headers)
  if (!merged.has("origin")) merged.set("origin", webOrigin)
  if (session) merged.set("cookie", session.cookie)
  if (json !== undefined) merged.set("content-type", "application/json")
  return exports.default.fetch(`${apiOrigin}${path}`, {
    ...rest,
    headers: merged,
    body: json === undefined ? rest.body : JSON.stringify(json),
  })
}

export function sessionCookieFrom(response: Response): string {
  const cookie = response.headers
    .getSetCookie()
    .map((header) => header.split(";")[0] ?? "")
    .find((pair) => pair.includes("session_token="))
  if (!cookie) throw new Error("response did not set a session cookie")
  return cookie
}

export function uniqueEmail(label = "user"): string {
  return `${label}-${crypto.randomUUID()}@example.test`
}

export const testPassword = "correct horse battery staple"

export async function signUp(email = uniqueEmail()): Promise<Session> {
  const response = await request("/api/auth/sign-up/email", {
    method: "POST",
    json: { name: email.split("@")[0], email, password: testPassword },
  })
  if (response.status !== 200) {
    throw new Error(
      `sign-up failed: ${response.status} ${await response.text()}`
    )
  }
  const body = await response.json<{ user: { id: string } }>()
  return { userId: body.user.id, email, cookie: sessionCookieFrom(response) }
}

export const testOpenRouterKey = "sk-or-v1-test-key-cafe1234"

export async function saveOpenRouterKey(
  session: Session,
  key = testOpenRouterKey
): Promise<void> {
  const response = await request("/keys/openrouter", {
    method: "PUT",
    session,
    json: { key },
  })
  if (response.status !== 200) {
    throw new Error(`saving the key failed: ${response.status}`)
  }
}
