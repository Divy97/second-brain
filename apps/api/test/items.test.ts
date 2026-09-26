import { env } from "cloudflare:workers"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { request, signUp, type Session } from "./support/http.js"
import {
  stubOpenRouter,
  type OpenRouterStub,
} from "./support/openrouter-stub.js"

interface ItemSummary {
  id: string
  status: "pending" | "processing" | "ready" | "failed"
  kind: string | null
  title: string | null
  excerpt: string
  capturedAt: string
}

interface ItemDetail extends ItemSummary {
  rawText: string
  captures: string[]
}

interface ErrorBody {
  error: { code: string; message: string }
}

function save(session: Session, text: string): Promise<Response> {
  return request("/items", { method: "POST", session, json: { text } })
}

async function saveItem(session: Session, text: string): Promise<ItemDetail> {
  const response = await save(session, text)
  expect([200, 201]).toContain(response.status)
  return response.json<ItemDetail>()
}

async function listItems(session: Session): Promise<ItemSummary[]> {
  const response = await request("/items", { session })
  expect(response.status).toBe(200)
  return (await response.json<{ items: ItemSummary[] }>()).items
}

async function getItem(session: Session, id: string): Promise<Response> {
  return request(`/items/${id}`, { session })
}

describe("items", () => {
  let openRouter: OpenRouterStub

  beforeEach(() => {
    openRouter = stubOpenRouter()
  })

  afterEach(() => {
    openRouter.restore()
  })

  it("saves a note as pending without calling any model", async () => {
    const session = await signUp()

    const response = await save(session, "The map is not the territory.")

    expect(response.status).toBe(201)
    const item = await response.json<ItemDetail>()
    expect(item.status).toBe("pending")
    expect(item.rawText).toBe("The map is not the territory.")
    expect(item.kind).toBeNull()
    expect(openRouter.calls).toHaveLength(0)
  })

  it("queues a new item for processing, once, and again after an edit", async () => {
    const send = vi.spyOn(env.ITEMS_QUEUE, "send")
    try {
      const session = await signUp()
      const item = await saveItem(session, "queue me")
      await saveItem(session, "queue me")
      await request(`/items/${item.id}`, {
        method: "PATCH",
        session,
        json: { text: "queue me, edited" },
      })

      expect(send.mock.calls.map(([body]) => body)).toEqual([
        { itemId: item.id },
        { itemId: item.id },
      ])
    } finally {
      send.mockRestore()
    }
  })

  it("lists items newest first", async () => {
    const session = await signUp()
    const first = await saveItem(session, "first note")
    const second = await saveItem(session, "second note")

    const items = await listItems(session)

    expect(items.map((item) => item.id)).toEqual([second.id, first.id])
    expect(items[0]).toMatchObject({
      status: "pending",
      excerpt: "second note",
      title: null,
      kind: null,
    })
  })

  it("rejects empty and whitespace-only text without creating an item", async () => {
    const session = await signUp()

    const responses = await Promise.all([
      save(session, ""),
      save(session, "   \n\t  "),
    ])

    for (const response of responses) {
      expect(response.status).toBe(400)
      expect((await response.json<ErrorBody>()).error.code).toBe(
        "invalid_request"
      )
    }
    expect(await listItems(session)).toEqual([])
  })

  it("keeps multi-paragraph text as one item with its line breaks", async () => {
    const session = await signUp()
    const text =
      "Meeting with Priya\n\n- ship the beta\n- hire a designer\n\nNext: Friday"

    const item = await saveItem(session, text)

    const detail = await (await getItem(session, item.id)).json<ItemDetail>()
    expect(detail.rawText).toBe(text)
    expect(await listItems(session)).toHaveLength(1)
  })

  it("stores non-English and mixed-language text exactly as entered", async () => {
    const session = await signUp()
    const texts = [
      "कल सुबह डॉक्टर मेहता से मिलना है",
      "Mixed: आज का idea — agentic browser ✨",
      "日本語のメモ",
    ]

    for (const text of texts) {
      const item = await saveItem(session, text)
      const detail = await (await getItem(session, item.id)).json<ItemDetail>()
      expect(detail.rawText).toBe(text)
    }
  })

  it("turns the same text saved twice into one item with two captures", async () => {
    const session = await signUp()
    const first = await saveItem(session, "Same thought")

    const again = await save(session, "Same thought")
    expect(again.status).toBe(200)
    const second = await again.json<ItemDetail>()
    await saveItem(session, "A different thought")

    expect(second.id).toBe(first.id)
    const detail = await (await getItem(session, first.id)).json<ItemDetail>()
    expect(detail.captures).toHaveLength(2)
    expect(await listItems(session)).toHaveLength(2)
  })

  it("edits the text and returns the item to pending", async () => {
    const session = await signUp()
    const item = await saveItem(session, "Asian tech browser")

    const response = await request(`/items/${item.id}`, {
      method: "PATCH",
      session,
      json: { text: "Agentic browser" },
    })

    expect(response.status).toBe(200)
    const edited = await response.json<ItemDetail>()
    expect(edited.rawText).toBe("Agentic browser")
    expect(edited.status).toBe("pending")
    const detail = await (await getItem(session, item.id)).json<ItemDetail>()
    expect(detail.rawText).toBe("Agentic browser")
  })

  it("rejects an edit to empty text", async () => {
    const session = await signUp()
    const item = await saveItem(session, "keep me")

    const response = await request(`/items/${item.id}`, {
      method: "PATCH",
      session,
      json: { text: "  " },
    })

    expect(response.status).toBe(400)
    const detail = await (await getItem(session, item.id)).json<ItemDetail>()
    expect(detail.rawText).toBe("keep me")
  })

  it("deletes an item: gone from the list, detail is not found", async () => {
    const session = await signUp()
    const kept = await saveItem(session, "keep")
    const doomed = await saveItem(session, "delete me")

    const response = await request(`/items/${doomed.id}`, {
      method: "DELETE",
      session,
    })

    expect(response.status).toBe(204)
    expect((await listItems(session)).map((item) => item.id)).toEqual([kept.id])
    const detail = await getItem(session, doomed.id)
    expect(detail.status).toBe(404)
    expect((await detail.json<ErrorBody>()).error.code).toBe("not_found")
  })

  it("brings a deleted item back when the same text is saved again", async () => {
    const session = await signUp()
    const item = await saveItem(session, "second thoughts")
    await request(`/items/${item.id}`, { method: "DELETE", session })

    const again = await saveItem(session, "second thoughts")

    expect(again.id).toBe(item.id)
    expect((await listItems(session)).map((entry) => entry.id)).toEqual([
      item.id,
    ])
  })

  it("never shows one user's items to another", async () => {
    const owner = await signUp()
    const other = await signUp()
    const item = await saveItem(owner, "private note")

    expect(await listItems(other)).toEqual([])
    expect((await getItem(other, item.id)).status).toBe(404)
    const edit = await request(`/items/${item.id}`, {
      method: "PATCH",
      session: other,
      json: { text: "hijacked" },
    })
    expect(edit.status).toBe(404)
    const remove = await request(`/items/${item.id}`, {
      method: "DELETE",
      session: other,
    })
    expect(remove.status).toBe(404)

    const detail = await (await getItem(owner, item.id)).json<ItemDetail>()
    expect(detail.rawText).toBe("private note")
  })

  it("lets two users save the same text independently", async () => {
    const first = await signUp()
    const second = await signUp()

    const a = await saveItem(first, "shared words")
    const b = await saveItem(second, "shared words")

    expect(a.id).not.toBe(b.id)
  })

  it("answers not found for ids that are not uuids", async () => {
    const session = await signUp()

    expect((await getItem(session, "not-a-uuid")).status).toBe(404)
  })

  it("requires a session", async () => {
    const responses = await Promise.all([
      request("/items"),
      request("/items", { method: "POST", json: { text: "x" } }),
    ])

    expect(responses.map((response) => response.status)).toEqual([401, 401])
  })
})
