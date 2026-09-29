import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  stubExtractionProviders,
  testReaderKey,
  testTranscriptKey,
  type ExtractionStub,
} from "./support/extraction-stub.js"
import { request, signUp, type Session } from "./support/http.js"

type KeyStatus = { set: false } | { set: true; last4: string }

interface KeySettings {
  openrouter: KeyStatus
  transcript: KeyStatus
  reader: KeyStatus
}

const notSet: KeySettings = {
  openrouter: { set: false },
  transcript: { set: false },
  reader: { set: false },
}

function saveKey(
  session: Session,
  provider: "transcript" | "reader",
  key: string
): Promise<Response> {
  return request(`/keys/${provider}`, { method: "PUT", session, json: { key } })
}

async function keySettings(session: Session): Promise<KeySettings> {
  const response = await request("/keys", { session })
  expect(response.status).toBe(200)
  return response.json<KeySettings>()
}

describe("optional extraction keys", () => {
  let providers: ExtractionStub

  beforeEach(() => {
    providers = stubExtractionProviders()
    providers.acceptKeys([testTranscriptKey, testReaderKey])
  })

  afterEach(() => {
    providers.restore()
  })

  it("reports every provider as unset before anything is saved", async () => {
    expect(await keySettings(await signUp())).toEqual(notSet)
  })

  it.each([
    ["transcript", testTranscriptKey, "9999"],
    ["reader", testReaderKey, "8888"],
  ] as const)(
    "saves, shows last4 for, and removes the %s key",
    async (provider, key, last4) => {
      const session = await signUp()

      const saved = await saveKey(session, provider, key)
      expect(saved.status).toBe(200)
      expect((await keySettings(session))[provider]).toEqual({
        set: true,
        last4,
      })

      const removed = await request(`/keys/${provider}`, {
        method: "DELETE",
        session,
      })
      expect(removed.status).toBe(200)
      expect((await keySettings(session))[provider]).toEqual({ set: false })
    }
  )

  it.each(["transcript", "reader"] as const)(
    "refuses a %s key the provider rejects, and saves nothing",
    async (provider) => {
      const session = await signUp()

      const response = await saveKey(session, provider, "wrong-key-0000")

      expect(response.status).toBe(422)
      const body = await response.json<{ error: { code: string } }>()
      expect(body.error.code).toBe("invalid_key")
      expect((await keySettings(session))[provider]).toEqual({ set: false })
    }
  )

  it.each([
    ["transcript", "supadata", testTranscriptKey],
    ["reader", "jina", testReaderKey],
  ] as const)(
    "reports %s as unavailable rather than invalid when the provider is down",
    async (provider, host, key) => {
      const session = await signUp()
      providers.breakProvider(host)

      const response = await saveKey(session, provider, key)

      expect(response.status).toBe(502)
      const body = await response.json<{ error: { code: string } }>()
      expect(body.error.code).toBe("upstream_unavailable")
      expect((await keySettings(session))[provider]).toEqual({ set: false })
    }
  )

  it("rejects an empty key without calling the provider", async () => {
    const session = await signUp()

    const response = await saveKey(session, "transcript", "   ")

    expect(response.status).toBe(400)
    expect(providers.calls).toHaveLength(0)
  })

  it("never returns a saved optional key in any response", async () => {
    const session = await signUp()

    const responses = [
      await saveKey(session, "transcript", testTranscriptKey),
      await saveKey(session, "reader", testReaderKey),
      await request("/keys", { session }),
    ]

    for (const response of responses) {
      const text = await response.text()
      expect(text).not.toContain(testTranscriptKey)
      expect(text).not.toContain(testReaderKey)
    }
  })

  it("keeps each user's optional keys private to that user", async () => {
    const owner = await signUp()
    const other = await signUp()
    await saveKey(owner, "transcript", testTranscriptKey)

    expect((await keySettings(other)).transcript).toEqual({ set: false })

    await request("/keys/transcript", { method: "DELETE", session: other })

    expect((await keySettings(owner)).transcript).toEqual({
      set: true,
      last4: "9999",
    })
  })

  it("requires a session for every optional key route", async () => {
    const responses = await Promise.all([
      request("/keys/transcript", {
        method: "PUT",
        json: { key: testTranscriptKey },
      }),
      request("/keys/transcript", { method: "DELETE" }),
      request("/keys/reader", {
        method: "PUT",
        json: { key: testReaderKey },
      }),
      request("/keys/reader", { method: "DELETE" }),
    ])

    expect(responses.map((response) => response.status)).toEqual([
      401, 401, 401, 401,
    ])
    expect(providers.calls).toHaveLength(0)
  })
})
