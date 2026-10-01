import { describe, expect, it } from "vitest"

import { asDevice, connectDevice, mintDeviceKey } from "./support/extension.js"
import { request, signUp } from "./support/http.js"

describe("extension authentication", () => {
  it("connects a device with a key the signed-in user creates", async () => {
    const session = await signUp()

    const { token } = await connectDevice(session, "Chrome on MacBook")

    const me = await asDevice(token, "/me")
    expect(me.status).toBe(200)
    expect(await me.json()).toEqual({
      email: session.email,
      deviceLabel: "Chrome on MacBook",
    })
  })

  it("gives the key a default label when none is given", async () => {
    const session = await signUp()

    const { token } = await connectDevice(session)

    const me = await asDevice(token, "/me")
    expect((await me.json<{ deviceLabel: string }>()).deviceLabel).toBe(
      "Browser extension"
    )
  })

  it("gives the key exactly the extension permissions and nothing more", async () => {
    const session = await signUp()
    await connectDevice(session)

    const { apiKeys } = await (
      await request("/api/auth/api-key/list", { session })
    ).json<{ apiKeys: { permissions: unknown }[] }>()

    const raw = apiKeys[0]?.permissions
    const granted = typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw
    expect(granted).toEqual({
      connection: ["read"],
      captures: ["create"],
      captureSettings: ["read", "write"],
      stored: ["list", "index", "delete"],
    })
  })

  it("refuses to create a key when nobody is signed in", async () => {
    const response = await request("/devices", { method: "POST", json: {} })

    expect(response.status).toBe(401)
  })

  it("refuses a label that is blank or too long", async () => {
    const session = await signUp()

    expect((await mintDeviceKey(session, "   ")).status).toBe(400)
    expect((await mintDeviceKey(session, "x".repeat(81))).status).toBe(400)
  })

  it("does not let a device key create more device keys", async () => {
    const session = await signUp()
    const { token } = await connectDevice(session)

    const response = await request("/devices", {
      method: "POST",
      json: {},
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.status).toBe(401)
  })

  it("stops a user holding more than twenty device keys", async () => {
    const session = await signUp()
    for (let made = 0; made < 20; made++) await connectDevice(session)

    const response = await mintDeviceKey(session)

    expect(response.status).toBe(409)
    expect(
      (await response.json<{ error: { code: string } }>()).error.code
    ).toBe("device_limit")
  })

  it("no longer offers the approval-page connect routes", async () => {
    const session = await signUp()

    for (const path of ["/extension/authorize", "/extension/token"]) {
      const response = await request(path, {
        method: "POST",
        session,
        json: {},
      })
      expect(response.status, path).toBe(404)
    }
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
