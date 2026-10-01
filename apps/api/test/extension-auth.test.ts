import { describe, expect, it } from "vitest"

import {
  approveDevice,
  asDevice,
  codeFrom,
  connectDevice,
  exchangeCode,
  pkcePair,
} from "./support/extension.js"
import { request, signUp } from "./support/http.js"

async function approvedCode(
  session: Awaited<ReturnType<typeof signUp>>,
  challenge: string
): Promise<string> {
  const approval = await approveDevice(session, { challenge })
  expect(approval.status).toBe(200)
  const { redirectTo } = await approval.json<{ redirectTo: string }>()
  return codeFrom(redirectTo)
}

describe("extension authentication", () => {
  it("connects a device after the signed-in user approves it", async () => {
    const session = await signUp()

    const { token } = await connectDevice(session, "Chrome on MacBook")

    const me = await asDevice(token, "/me")
    expect(me.status).toBe(200)
    expect(await me.json()).toEqual({
      email: session.email,
      deviceLabel: "Chrome on MacBook",
    })
  })

  it("refuses to approve a device when nobody is signed in", async () => {
    const { challenge } = await pkcePair()

    const response = await request("/extension/authorize", {
      method: "POST",
      json: {
        label: "Chrome",
        codeChallenge: challenge,
        redirectUri: "https://abcdefghijklmnop.chromiumapp.org/cb",
      },
    })

    expect(response.status).toBe(401)
  })

  it("refuses a redirect address that is not a known extension", async () => {
    const session = await signUp()
    const { challenge } = await pkcePair()

    const response = await approveDevice(session, {
      challenge,
      redirectUri: "https://evil.example/cb",
    })

    expect(response.status).toBe(400)
  })

  it("rejects a code exchanged with the wrong verifier", async () => {
    const session = await signUp()
    const { challenge } = await pkcePair()
    const other = await pkcePair()
    const code = await approvedCode(session, challenge)

    const response = await exchangeCode(code, other.verifier)

    expect(response.status).toBe(400)
  })

  it("accepts a code only once", async () => {
    const session = await signUp()
    const { verifier, challenge } = await pkcePair()
    const code = await approvedCode(session, challenge)

    expect((await exchangeCode(code, verifier)).status).toBe(200)
    expect((await exchangeCode(code, verifier)).status).toBe(400)
  })

  it("rejects an unknown code", async () => {
    const { verifier } = await pkcePair()

    const response = await exchangeCode("not-a-real-code", verifier)

    expect(response.status).toBe(400)
  })

  it("rejects requests with no token or a made-up token", async () => {
    expect((await request("/ext/me")).status).toBe(401)
    expect((await asDevice("sbx_made_up_token", "/me")).status).toBe(401)
  })

  it("does not accept a session cookie on extension routes", async () => {
    const session = await signUp()

    const response = await request("/ext/me", { session })

    expect(response.status).toBe(401)
  })

  it("does not accept a device token on any session route", async () => {
    const session = await signUp()
    const { token } = await connectDevice(session)
    const headers = { authorization: `Bearer ${token}` }

    for (const path of ["/items", "/keys", "/threads"]) {
      const response = await request(path, { headers })
      expect(response.status, path).toBe(401)
    }
  })

  it("lets the user list their devices without revealing the token", async () => {
    const session = await signUp()
    const { token } = await connectDevice(session, "Firefox on Linux")

    const response = await request("/api/auth/api-key/list", { session })

    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toContain("Firefox on Linux")
    expect(body).not.toContain(token)
  })

  it("stops a device from working once the user revokes it", async () => {
    const session = await signUp()
    const { token } = await connectDevice(session, "Old laptop")
    const { apiKeys } = await (
      await request("/api/auth/api-key/list", { session })
    ).json<{ apiKeys: { id: string }[] }>()
    expect(apiKeys).toHaveLength(1)

    const revoked = await request("/api/auth/api-key/delete", {
      method: "POST",
      session,
      json: { keyId: apiKeys[0]?.id },
    })
    expect(revoked.status).toBe(200)

    expect((await asDevice(token, "/me")).status).toBe(401)
  })

  it("keeps the other devices working when one is revoked", async () => {
    const session = await signUp()
    const old = await connectDevice(session, "Old laptop")
    const current = await connectDevice(session, "New laptop")
    const { apiKeys } = await (
      await request("/api/auth/api-key/list", { session })
    ).json<{ apiKeys: { id: string; name: string }[] }>()
    const oldKey = apiKeys.find((key) => key.name === "Old laptop")

    await request("/api/auth/api-key/delete", {
      method: "POST",
      session,
      json: { keyId: oldKey?.id },
    })

    expect((await asDevice(old.token, "/me")).status).toBe(401)
    expect((await asDevice(current.token, "/me")).status).toBe(200)
  })

  it("does not let a user mint a token with their own permissions", async () => {
    const session = await signUp()

    const response = await request("/api/auth/api-key/create", {
      method: "POST",
      session,
      json: { name: "sneaky", permissions: { stored: ["delete"] } },
    })

    expect(response.status).toBe(404)
  })

  it("answers 429, not a reconnect prompt, when a device is over its rate limit", async () => {
    const session = await signUp()
    const { token } = await connectDevice(session)

    let last = await asDevice(token, "/me")
    for (let sent = 1; sent < 125 && last.status === 200; sent++) {
      last = await asDevice(token, "/me")
    }

    expect(last.status).toBe(429)
    expect((await last.json<{ error: { code: string } }>()).error.code).toBe(
      "rate_limited"
    )
    expect((await asDevice(token, "/me")).status).toBe(429)
  })
})
