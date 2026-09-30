import { env } from "cloudflare:workers"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { connect } from "@workspace/db"

import {
  completeGoogleSignIn,
  signedInUser,
  stubGoogle,
  type GoogleStub,
} from "./support/google.js"
import {
  request,
  signUp,
  testPassword,
  uniqueEmail,
  webOrigin,
} from "./support/http.js"
import { createAuth } from "../src/lib/auth.js"

interface StartBody {
  url: string
  redirect: boolean
}

async function startGoogleSignIn(init: Record<string, string> = {}) {
  return request("/api/auth/sign-in/social", {
    method: "POST",
    json: { provider: "google", callbackURL: "/home", ...init },
  })
}

let google: GoogleStub

beforeEach(() => {
  google = stubGoogle()
})

afterEach(() => {
  google.restore()
})

function profile(email = uniqueEmail("google")) {
  return {
    sub: `google-${crypto.randomUUID()}`,
    email,
    name: "Grace Hopper",
    email_verified: true,
    picture: "https://lh3.googleusercontent.com/a/grace",
  }
}

describe("google sign-in", () => {
  it("starts by sending the browser to Google with a redirect back to the web origin", async () => {
    const response = await startGoogleSignIn()

    expect(response.status).toBe(200)
    const body = await response.json<StartBody>()
    expect(body.redirect).toBe(true)
    const url = new URL(body.url)
    expect(url.origin).toBe("https://accounts.google.com")
    expect(url.searchParams.get("client_id")).toBe("test-google-client-id")
    expect(url.searchParams.get("redirect_uri")).toBe(
      `${webOrigin}/api/auth/callback/google`
    )
    expect(url.searchParams.get("state")).toBeTruthy()
    expect(response.headers.getSetCookie().join(";")).toContain("state")
  })

  it("creates a user on first sign-in and lands on the requested page", async () => {
    const person = profile()
    google.signsInAs(person)

    const result = await completeGoogleSignIn({ callbackURL: "/items/42" })

    expect(result.location).toBe("/items/42")
    const user = await signedInUser(result)
    expect(user.email).toBe(person.email)
    expect(user.name).toBe("Grace Hopper")
    expect(user.emailVerified).toBe(true)
    expect(user.image).toBe(person.picture)
  })

  it("sends a replayed callback to the sign-in page", async () => {
    google.signsInAs(profile())
    const start = await startGoogleSignIn({
      errorCallbackURL: "/sign-in",
    })
    const { url } = await start.json<StartBody>()
    const state = new URL(url).searchParams.get("state")
    const stateCookies = start.headers
      .getSetCookie()
      .map((header) => header.split(";")[0] ?? "")
      .join("; ")
    const callbackPath = `/api/auth/callback/google?code=google-code&state=${state}`

    const first = await request(callbackPath, {
      headers: { cookie: stateCookies },
      redirect: "manual",
    })
    const replay = await request(callbackPath, {
      headers: { cookie: stateCookies },
      redirect: "manual",
    })

    expect(first.headers.get("location")).toBe("/home")
    expect(replay.headers.get("location")).toBe(
      `${webOrigin}/sign-in?error=state_mismatch`
    )
  })

  it("signs a returning user back into the same User", async () => {
    google.signsInAs(profile())
    const first = await signedInUser(await completeGoogleSignIn())
    const second = await signedInUser(await completeGoogleSignIn())

    expect(second.id).toBe(first.id)
  })

  it("never links Google to an unverified email-and-password User", async () => {
    const email = uniqueEmail("taken")
    await signUp(email)
    google.signsInAs(profile(email))

    const result = await completeGoogleSignIn({ errorCallbackURL: "/sign-in" })

    expect(result.location).toContain("/sign-in")
    expect(new URL(result.location, webOrigin).searchParams.get("error")).toBe(
      "account_not_linked"
    )
    expect(result.cookie).toBeNull()
  })

  it("sends the user back with an error when they cancel at Google", async () => {
    const result = await completeGoogleSignIn({
      returned: (state) => `error=access_denied&state=${state}`,
    })

    expect(result.cookie).toBeNull()
    expect(result.location).toBe("/sign-in?error=access_denied")
  })

  it("does not let a Google-only User sign in with a password", async () => {
    const person = profile()
    google.signsInAs(person)
    await completeGoogleSignIn()

    const response = await request("/api/auth/sign-in/email", {
      method: "POST",
      json: { email: person.email, password: testPassword },
    })

    expect(response.status).toBe(401)
  })

  it("refuses to create an email-and-password User for an email that signed up with Google", async () => {
    const person = profile()
    google.signsInAs(person)
    await completeGoogleSignIn()

    const response = await request("/api/auth/sign-up/email", {
      method: "POST",
      json: { name: "again", email: person.email, password: testPassword },
    })

    expect(response.status).toBe(422)
  })

  it("offers no Google route when the credentials are not configured", async () => {
    const { db } = connect(env.HYPERDRIVE.connectionString)
    const auth = createAuth(
      { ...env, GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined },
      db
    )

    const response = await auth.handler(
      new Request(`${webOrigin}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: webOrigin },
        body: JSON.stringify({ provider: "google", callbackURL: "/home" }),
      })
    )

    expect(response.status).toBe(404)
  })
})
