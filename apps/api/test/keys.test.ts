import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { request, signUp, type Session } from "./support/http.js"
import {
  stubOpenRouter,
  type OpenRouterStub,
} from "./support/openrouter-stub.js"

type ProviderStatus = { set: false } | { set: true; last4: string }

interface KeyStatus {
  openrouter: ProviderStatus
}

const firstKey = "sk-or-v1-first-key-aaaa1111"
const secondKey = "sk-or-v1-second-key-bbbb2222"

function saveKey(session: Session, key: string): Promise<Response> {
  return request("/keys/openrouter", {
    method: "PUT",
    session,
    json: { key },
  })
}

async function keyStatus(session: Session): Promise<KeyStatus> {
  const response = await request("/keys", { session })
  expect(response.status).toBe(200)
  return response.json<KeyStatus>()
}

describe("OpenRouter key settings", () => {
  let openRouter: OpenRouterStub

  beforeEach(() => {
    openRouter = stubOpenRouter()
  })

  afterEach(() => {
    openRouter.restore()
  })

  it("goes from not set, to set with last4, to replaced, to removed", async () => {
    const session = await signUp()
    expect(await keyStatus(session)).toEqual({
      openrouter: { set: false },
    })

    const saved = await saveKey(session, firstKey)
    expect(saved.status).toBe(200)
    expect(await saved.json()).toEqual({
      openrouter: { set: true, last4: "1111" },
    })
    expect(await keyStatus(session)).toEqual({
      openrouter: { set: true, last4: "1111" },
    })

    await saveKey(session, secondKey)
    expect(await keyStatus(session)).toEqual({
      openrouter: { set: true, last4: "2222" },
    })

    const removed = await request("/keys/openrouter", {
      method: "DELETE",
      session,
    })
    expect(removed.status).toBe(200)
    expect(await keyStatus(session)).toEqual({
      openrouter: { set: false },
    })
  })

  it("never returns the saved key in any response", async () => {
    const session = await signUp()

    const responses = [
      await saveKey(session, firstKey),
      await request("/keys", { session }),
      await request("/api/auth/get-session", { session }),
    ]

    for (const response of responses) {
      const text = await response.text()
      expect(text).not.toContain(firstKey)
      expect(text).not.toContain(firstKey.slice(0, -4))
    }
  })

  it("checks the key with OpenRouter before saving and refuses a rejected one", async () => {
    const session = await signUp()
    openRouter.rejectKeys([firstKey])

    const response = await saveKey(session, firstKey)

    expect(response.status).toBe(422)
    const body = await response.json<{ error: { code: string } }>()
    expect(body.error.code).toBe("invalid_key")
    expect(await keyStatus(session)).toEqual({
      openrouter: { set: false },
    })
    expect(openRouter.calls.map((call) => new URL(call.url).pathname)).toEqual([
      "/api/v1/key",
    ])
  })

  it("rejects an empty key without calling OpenRouter", async () => {
    const session = await signUp()

    const response = await saveKey(session, "   ")

    expect(response.status).toBe(400)
    expect(openRouter.calls).toHaveLength(0)
  })

  it("keeps each user's key private to that user", async () => {
    const owner = await signUp()
    const other = await signUp()
    await saveKey(owner, firstKey)

    expect(await keyStatus(other)).toEqual({
      openrouter: { set: false },
    })

    await request("/keys/openrouter", { method: "DELETE", session: other })
    await saveKey(other, secondKey)

    expect(await keyStatus(owner)).toEqual({
      openrouter: { set: true, last4: "1111" },
    })
  })

  it("requires a session for every key route", async () => {
    const responses = await Promise.all([
      request("/keys"),
      request("/keys/openrouter", { method: "PUT", json: { key: firstKey } }),
      request("/keys/openrouter", { method: "DELETE" }),
    ])

    expect(responses.map((response) => response.status)).toEqual([
      401, 401, 401,
    ])
    expect(openRouter.calls).toHaveLength(0)
  })
})

describe("stored keys are OpenRouter only", () => {
  it("lists only the OpenRouter key", async () => {
    const session = await signUp()

    const response = await request("/keys", { session })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ openrouter: { set: false } })
  })

  it.each(["transcript", "reader"])(
    "no longer accepts or removes a %s key",
    async (provider) => {
      const session = await signUp()

      const saved = await request(`/keys/${provider}`, {
        method: "PUT",
        session,
        json: { key: "any-key-1234" },
      })
      const removed = await request(`/keys/${provider}`, {
        method: "DELETE",
        session,
      })

      expect([saved.status, removed.status]).toEqual([404, 404])
    }
  )
})
