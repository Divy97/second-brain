import { describe, expect, it } from "vitest"

import {
  stubExtractionProviders,
  testReaderKey,
} from "./support/extraction-stub.js"
import { request, saveOpenRouterKey, signUp } from "./support/http.js"
import {
  defaultRewrite,
  parseRewriteInput,
  stubOpenRouter,
} from "./support/openrouter-stub.js"
import { recordQueue } from "./support/pipeline.js"

// Article hosts are stubbed per test; the reader host is stubbed globally by
// stubExtractionProviders, so reader calls fall through to whatever fetch is installed.
function pageOrReader(fetchPage: typeof fetch): typeof fetch {
  return (input, init) =>
    new Request(input, init).url.startsWith("https://r.jina.ai/")
      ? globalThis.fetch(input, init)
      : fetchPage(input, init)
}

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
    const queue = recordQueue({
      fetchPage,
      env: { READER_API_KEY: undefined },
    })
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

  it("leaves a walled page partial when the reader is unreachable", async () => {
    const paywall = "https://example.com/still-walled"
    const fetchPage = articleFetch({
      [paywall]: html(`
        <html><head><title>Members only</title></head><body>Subscribe to continue.</body></html>
      `),
    })
    const model = stubOpenRouter()
    const providers = stubExtractionProviders()
    providers.acceptKeys([testReaderKey])
    const queue = recordQueue({ fetchPage: pageOrReader(fetchPage) })
    try {
      const session = await signUp()
      await saveOpenRouterKey(session)
      await request("/keys/reader", {
        method: "PUT",
        session,
        json: { key: testReaderKey },
      })
      providers.breakProvider("reader")

      const { id } = await (
        await saveUrl(session, paywall, "Check this")
      ).json<{ id: string }>()
      expect(await queue.processLatest()).toMatchObject({ outcome: "ready" })
      const item = await (
        await request(`/items/${id}`, { session })
      ).json<ItemBody>()
      expect(item.captureQuality).toBe("partial")
      expect(item.rawText).toContain("Check this")
    } finally {
      queue.restore()
      providers.restore()
      model.restore()
    }
  })

  describe("Browser Run rendering", () => {
    const rendered =
      "<html><head><title>Rendered guide</title></head><body><article><p>JS-rendered Lisbon tram routes.</p></article></body></html>"

    it("renders an empty-shell SPA and captures its real text", async () => {
      const fetchPage = articleFetch({
        "https://example.com/spa": html(
          '<html><head><title></title></head><body><div id="root"></div></body></html>'
        ),
      })
      let renderedUrl: string | undefined
      const renderPage = (url: string) => {
        renderedUrl = url
        return Promise.resolve(rendered)
      }
      const model = stubOpenRouter()
      const queue = recordQueue({
        fetchPage,
        renderPage,
        env: { READER_API_KEY: undefined },
      })
      try {
        const session = await signUp()
        await saveOpenRouterKey(session)
        const response = await saveUrl(session, "https://example.com/spa")
        const { id } = await response.json<{ id: string }>()
        expect(await queue.processLatest()).toMatchObject({
          outcome: "ready",
        })
        const item = await (
          await request(`/items/${id}`, { session })
        ).json<ItemBody>()
        expect(item.captureQuality).toBe("full")
        expect(item.rawText).toContain("JS-rendered Lisbon tram routes")
        expect(renderedUrl).toBe("https://example.com/spa")
      } finally {
        queue.restore()
        model.restore()
      }
    })

    it("falls through to the reader when rendering fails", async () => {
      const paywall = "https://example.com/spa-walled"
      const fetchPage = articleFetch({
        [paywall]: html(
          "<html><head><title>Members only</title></head><body>Subscribe to continue.</body></html>"
        ),
      })
      const model = stubOpenRouter()
      const providers = stubExtractionProviders()
      providers.acceptKeys([testReaderKey])
      providers.readerReturns(paywall, "Reader rescued this article.")
      const queue = recordQueue({
        fetchPage: pageOrReader(fetchPage),
        renderPage: () => Promise.resolve(null),
      })
      try {
        const session = await signUp()
        await saveOpenRouterKey(session)
        await request("/keys/reader", {
          method: "PUT",
          session,
          json: { key: testReaderKey },
        })
        const { id } = await (
          await saveUrl(session, paywall, "Check this too")
        ).json<{ id: string }>()
        expect(await queue.processLatest()).toMatchObject({
          outcome: "ready",
        })
        const item = await (
          await request(`/items/${id}`, { session })
        ).json<ItemBody>()
        expect(item.captureQuality).toBe("full")
        expect(item.rawText).toContain("Check this too")
      } finally {
        queue.restore()
        providers.restore()
        model.restore()
      }
    })

    it("never renders a page that already parsed in full", async () => {
      const fetchPage = articleFetch({
        "https://example.com/already-full": html(
          "<article><p>Already a full capture.</p></article>"
        ),
      })
      let renderCalls = 0
      const model = stubOpenRouter()
      const queue = recordQueue({
        fetchPage,
        renderPage: () => {
          renderCalls += 1
          return Promise.resolve(rendered)
        },
      })
      try {
        const session = await signUp()
        await saveOpenRouterKey(session)
        const { id } = await (
          await saveUrl(session, "https://example.com/already-full")
        ).json<{ id: string }>()
        expect(await queue.processLatest()).toMatchObject({
          outcome: "ready",
        })
        const item = await (
          await request(`/items/${id}`, { session })
        ).json<ItemBody>()
        expect(item.captureQuality).toBe("full")
        expect(renderCalls).toBe(0)
      } finally {
        queue.restore()
        model.restore()
      }
    })

    it("stays partial when rendering also fails and there is no reader", async () => {
      const fetchPage = articleFetch({
        "https://example.com/dead-end": html(
          "<html><head><title>Members only</title></head><body>Log in to continue.</body></html>"
        ),
      })
      const model = stubOpenRouter()
      const queue = recordQueue({
        fetchPage,
        renderPage: () => Promise.resolve(null),
        env: { READER_API_KEY: undefined },
      })
      try {
        const session = await signUp()
        await saveOpenRouterKey(session)
        const { id } = await (
          await saveUrl(session, "https://example.com/dead-end", "Stuck")
        ).json<{ id: string }>()
        expect(await queue.processLatest()).toMatchObject({
          outcome: "ready",
        })
        const item = await (
          await request(`/items/${id}`, { session })
        ).json<ItemBody>()
        expect(item.captureQuality).toBe("partial")
        expect(item.rawText).toContain("Stuck")
      } finally {
        queue.restore()
        model.restore()
      }
    })
  })
})
