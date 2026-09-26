import { describe, expect, it } from "vitest"

import {
  request,
  sessionCookieFrom,
  signUp,
  testPassword,
  uniqueEmail,
} from "./support/http.js"

interface ErrorBody {
  error: { code: string; message: string }
}

interface SessionBody {
  user: { id: string; email: string }
}

describe("auth", () => {
  it("signs up with email and password and returns a working session cookie", async () => {
    const email = uniqueEmail("signup")
    const session = await signUp(email)

    const response = await request("/api/auth/get-session", { session })

    expect(response.status).toBe(200)
    const body = await response.json<SessionBody>()
    expect(body.user.email).toBe(email)
    expect(body.user.id).toBe(session.userId)
  })

  it("rejects a second sign-up with the same email", async () => {
    const email = uniqueEmail("dupe")
    await signUp(email)

    const response = await request("/api/auth/sign-up/email", {
      method: "POST",
      json: { name: "dupe", email, password: testPassword },
    })

    expect(response.status).toBe(422)
  })

  it("signs in with the right password and refuses the wrong one", async () => {
    const email = uniqueEmail("signin")
    await signUp(email)

    const wrong = await request("/api/auth/sign-in/email", {
      method: "POST",
      json: { email, password: "not the password" },
    })
    expect(wrong.status).toBe(401)

    const right = await request("/api/auth/sign-in/email", {
      method: "POST",
      json: { email, password: testPassword },
    })
    expect(right.status).toBe(200)
    const session = { userId: "", email, cookie: sessionCookieFrom(right) }
    const current = await request("/api/auth/get-session", { session })
    expect((await current.json<SessionBody>()).user.email).toBe(email)
  })

  it("signs out and the old cookie no longer authenticates", async () => {
    const session = await signUp()

    const signOut = await request("/api/auth/sign-out", {
      method: "POST",
      session,
      json: {},
    })
    expect(signOut.status).toBe(200)

    const keys = await request("/keys", { session })
    expect(keys.status).toBe(401)
  })

  it("returns 401 with a structured body for protected routes without a session", async () => {
    const response = await request("/keys")

    expect(response.status).toBe(401)
    const body = await response.json<ErrorBody>()
    expect(body.error.code).toBe("unauthenticated")
    expect(body.error.message).not.toBe("")
  })

  it("protects unknown routes too, and answers 404 once signed in", async () => {
    expect((await request("/nope")).status).toBe(401)

    const session = await signUp()
    expect((await request("/nope", { session })).status).toBe(404)
  })

  it("allows the web origin to call the API with credentials", async () => {
    const response = await request("/keys", {
      method: "OPTIONS",
      headers: {
        "access-control-request-method": "PUT",
        "access-control-request-headers": "content-type",
      },
    })

    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3000"
    )
    expect(response.headers.get("access-control-allow-credentials")).toBe(
      "true"
    )
  })
})
