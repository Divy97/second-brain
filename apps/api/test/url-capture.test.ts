import { describe, expect, it } from "vitest"

import { request, saveOpenRouterKey, signUp } from "./support/http.js"
import {
  defaultRewrite,
  parseRewriteInput,
  stubOpenRouter,
} from "./support/openrouter-stub.js"
import { recordQueue } from "./support/pipeline.js"

function articleFetch(routes: Record<string, Response | Error>): typeof fetch {
  return (input, init) => {
    const request = new Request(input, init)
    const route = routes[request.url]
    if (route instanceof Error) return Promise.reject(route)
    if (route) return Promise.resolve(route.clone())
    return Promise.reject(new Error(`unstubbed article URL: ${request.url}`))
  }
}

interface ItemBody {
  id: string
  type: string
  status: string
  sourceUrl: string | null
  sourceNote: string | null
  captureQuality: string | null
  rawText: string
  captures: string[]
}

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  })
}

function saveUrl(
  session: Awaited<ReturnType<typeof signUp>>,
  url: string,
  note?: string
) {
  return request("/items/url", { method: "POST", session, json: { url, note } })
}

describe("URL capture", () => {
  it("extracts article text and makes it searchable", async () => {
    const fetchPage = articleFetch({
      "https://example.com/lisbon": html(`
        <html><head><title>Lisbon guide</title></head>
        <body><article><h1>Lisbon guide</h1><p>The yellow door bookshop is in Alfama.</p></article></body></html>
      `),
    })
    const model = stubOpenRouter()
    const queue = recordQueue({ fetchPage })
    try {
      const session = await signUp()
      await saveOpenRouterKey(session)
      const response = await saveUrl(
        session,
        "https://example.com/lisbon",
        "Trip idea"
      )
      expect(response.status).toBe(201)
      const { id } = await response.json<{ id: string }>()
      expect(await queue.processLatest()).toMatchObject({ outcome: "ready" })
      const item = await (
        await request(`/items/${id}`, { session })
      ).json<ItemBody>()
      expect(item.type).toBe("url")
      expect(item.sourceUrl).toBe("https://example.com/lisbon")
      expect(item.sourceNote).toBe("Trip idea")
      expect(item.captureQuality).toBe("full")
      expect(item.rawText).toContain("yellow door bookshop")

      model.onChat("rewrite", (call) => ({
        ...defaultRewrite(parseRewriteInput(call).question),
        variants: ["yellow door bookshop Alfama"],
        keywords: [],
      }))
      const thread = await request("/threads", {
        method: "POST",
        session,
        json: {},
      })
      const { id: threadId } = await thread.json<{ id: string }>()
      const answer = await request(`/threads/${threadId}/messages`, {
        method: "POST",
        session,
        json: {
          question: "where was that bookshop?",
          timezone: "Asia/Kolkata",
        },
      })
      expect(
        (await answer.json<{ sources: { id: string }[] }>()).sources.map(
          (source) => source.id
        )
      ).toEqual([id])
    } finally {
      queue.restore()
      model.restore()
    }
  })

  it("records repeated captures for the same URL", async () => {
    const fetchPage = articleFetch({
      "https://example.com/same": html(
        "<article>First article text.</article>"
      ),
    })
    const model = stubOpenRouter()
    const queue = recordQueue({ fetchPage })
    try {
      const session = await signUp()
      await saveOpenRouterKey(session)
      const first = await saveUrl(session, "https://example.com/same")
      expect(first.status).toBe(201)
      const { id } = await first.json<{ id: string }>()
      expect(await queue.processLatest()).toMatchObject({ outcome: "ready" })
      const second = await saveUrl(session, "https://example.com/same")
      expect(second.status).toBe(200)
      expect(await queue.processLatest()).toMatchObject({ outcome: "ready" })
      const item = await (
        await request(`/items/${id}`, { session })
      ).json<ItemBody>()
      expect(item.captures).toHaveLength(2)
      expect(item.rawText).toContain("First article text")
      expect(
        item.captures.every((capture) => typeof capture === "string")
      ).toBe(true)
    } finally {
      queue.restore()
      model.restore()
    }
  })

  it("keeps blocked pages as partial captures", async () => {
    const fetchPage = articleFetch({
      "https://example.com/paywall": html(`
        <html><head><title>Members only</title><meta name="description" content="Subscribe to read."></head><body>Log in to continue.</body></html>
      `),
    })
    const model = stubOpenRouter()
    const queue = recordQueue({ fetchPage })
    try {
      const session = await signUp()
      await saveOpenRouterKey(session)
      const response = await saveUrl(
        session,
        "https://example.com/paywall",
        "Look into this"
      )
      const { id } = await response.json<{ id: string }>()
      expect(await queue.processLatest()).toMatchObject({ outcome: "ready" })
      const item = await (
        await request(`/items/${id}`, { session })
      ).json<ItemBody>()
      expect(item.captureQuality).toBe("partial")
      expect(item.rawText).toContain("Look into this")
    } finally {
      queue.restore()
      model.restore()
    }
  })

  it("rejects unsafe URLs and retries failed fetches", async () => {
    let fetchPage = articleFetch({
      "https://example.com/flaky": new Error("network down"),
    })
    const model = stubOpenRouter()
    const queue = recordQueue({
      fetchPage: (input, init) => fetchPage(input, init),
    })
    try {
      const session = await signUp()
      await saveOpenRouterKey(session)
      expect((await saveUrl(session, "http://localhost/admin")).status).toBe(
        400
      )
      expect((await saveUrl(session, "http://[fe80::1]/admin")).status).toBe(
        400
      )
      fetchPage = articleFetch({
        "https://example.com/flaky": new Response(null, {
          status: 302,
          headers: { location: "http://localhost/admin" },
        }),
      })
      const response = await saveUrl(
        session,
        "https://example.com/flaky",
        "Retry this"
      )
      const { id } = await response.json<{ id: string }>()
      expect(await queue.processLatest()).toMatchObject({ outcome: "failed" })
      const failed = await (
        await request(`/items/${id}`, { session })
      ).json<ItemBody>()
      expect(failed.status).toBe("failed")
      expect(failed.sourceUrl).toBe("https://example.com/flaky")
      expect(failed.sourceNote).toBe("Retry this")

      fetchPage = articleFetch({
        "https://example.com/flaky": html(
          "<article>Recovered article about Kyoto ramen.</article>"
        ),
      })
      expect(
        (await request(`/items/${id}/retry`, { session, method: "POST" }))
          .status
      ).toBe(200)
      expect(await queue.processLatest()).toMatchObject({ outcome: "ready" })
      const retried = await (
        await request(`/items/${id}`, { session })
      ).json<ItemBody>()
      expect(retried.rawText).toContain("Kyoto ramen")
    } finally {
      queue.restore()
      model.restore()
    }
  })
})
