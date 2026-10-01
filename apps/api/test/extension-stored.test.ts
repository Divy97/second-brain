import { describe, expect, it } from "vitest"

import { asDevice, connectDevice } from "./support/extension.js"
import { request, signUp } from "./support/http.js"

interface StoredItem {
  id: string
  url: string
  host: string
  title: string | null
  capturedAt: string
  status: string
}

interface StoredList {
  items: StoredItem[]
  waiting: number
  nextCursor: string | null
}

async function deviceFor() {
  const session = await signUp()
  const { token } = await connectDevice(session)
  await asDevice(token, "/settings", {
    method: "PUT",
    json: {
      passiveEnabled: true,
      passiveMode: "store",
      paused: false,
      blocklist: [],
    },
  })
  return { session, token }
}

async function visit(token: string, slug: string): Promise<string> {
  const response = await asDevice(token, "/captures", {
    method: "POST",
    json: {
      url: `https://blog.example.com/${slug}`,
      title: `Post ${slug}`,
      text: `Private body of ${slug}`,
      trigger: "passive",
    },
  })
  expect(response.status).toBe(201)
  return (await response.json<{ id: string }>()).id
}

async function stored(token: string, query = ""): Promise<StoredList> {
  const response = await asDevice(token, `/stored${query}`)
  expect(response.status).toBe(200)
  return response.json<StoredList>()
}

describe("extension stored items", () => {
  it("lists stored pages newest first with listing fields only", async () => {
    const { token } = await deviceFor()
    await visit(token, "first")
    await visit(token, "second")

    const list = await stored(token)

    expect(list.items.map((item) => item.title)).toEqual([
      "Post second",
      "Post first",
    ])
    expect(list.items[0]).toEqual({
      id: expect.any(String) as string,
      url: "https://blog.example.com/second",
      host: "blog.example.com",
      title: "Post second",
      capturedAt: expect.any(String) as string,
      status: "stored",
    })
    expect(JSON.stringify(list)).not.toContain("Private body")
  })

  it("counts every stored page that is waiting, not just the page returned", async () => {
    const { token } = await deviceFor()
    for (const slug of ["a", "b", "c"]) await visit(token, slug)

    const list = await stored(token, "?limit=2")

    expect(list.items).toHaveLength(2)
    expect(list.waiting).toBe(3)
    expect(list.nextCursor).not.toBeNull()
    const rest = await stored(token, `?limit=2&cursor=${list.nextCursor}`)
    expect(rest.items).toHaveLength(1)
    expect(rest.nextCursor).toBeNull()
  })

  it("shows only the signed-in user's stored pages", async () => {
    const mine = await deviceFor()
    const theirs = await deviceFor()
    await visit(mine.token, "mine")
    await visit(theirs.token, "theirs")

    const list = await stored(mine.token)

    expect(list.items.map((item) => item.title)).toEqual(["Post mine"])
  })

  it("indexes one stored page, which then leaves the stored list", async () => {
    const { session, token } = await deviceFor()
    const id = await visit(token, "keep")

    const response = await asDevice(token, `/stored/${id}/index`, {
      method: "POST",
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ id, status: "pending" })
    expect((await stored(token)).items).toEqual([])
    const detail = await request(`/items/${id}`, { session })
    expect((await detail.json<{ status: string }>()).status).toBe("pending")
  })

  it("treats indexing an already indexed page as a no-op", async () => {
    const { token } = await deviceFor()
    const id = await visit(token, "keep")
    await asDevice(token, `/stored/${id}/index`, { method: "POST" })

    const again = await asDevice(token, `/stored/${id}/index`, {
      method: "POST",
    })

    expect(again.status).toBe(200)
    expect(await again.json()).toEqual({ id, status: "pending" })
  })

  it("cannot index another user's page", async () => {
    const mine = await deviceFor()
    const theirs = await deviceFor()
    const id = await visit(theirs.token, "theirs")

    const response = await asDevice(mine.token, `/stored/${id}/index`, {
      method: "POST",
    })

    expect(response.status).toBe(404)
    expect((await stored(theirs.token)).items).toHaveLength(1)
  })

  it("indexes many stored pages at once and reports how many were queued", async () => {
    const { token } = await deviceFor()
    const ids = [await visit(token, "a"), await visit(token, "b")]
    await visit(token, "c")

    const response = await asDevice(token, "/stored/index", {
      method: "POST",
      json: { ids },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ queued: 2 })
    expect((await stored(token)).items.map((item) => item.title)).toEqual([
      "Post c",
    ])
  })

  it("ignores other users' pages in a bulk index", async () => {
    const mine = await deviceFor()
    const theirs = await deviceFor()
    const foreign = await visit(theirs.token, "theirs")

    const response = await asDevice(mine.token, "/stored/index", {
      method: "POST",
      json: { ids: [foreign] },
    })

    expect(await response.json()).toEqual({ queued: 0 })
    expect((await stored(theirs.token)).items).toHaveLength(1)
  })

  it("rejects a bulk index with no ids or too many", async () => {
    const { token } = await deviceFor()

    for (const ids of [
      [],
      Array.from({ length: 101 }, () => crypto.randomUUID()),
    ]) {
      const response = await asDevice(token, "/stored/index", {
        method: "POST",
        json: { ids },
      })
      expect(response.status).toBe(400)
    }
  })

  it("deletes a stored page", async () => {
    const { token } = await deviceFor()
    const id = await visit(token, "junk")

    const response = await asDevice(token, `/stored/${id}`, {
      method: "DELETE",
    })

    expect(response.status).toBe(204)
    expect((await stored(token)).items).toEqual([])
  })

  it("will not delete a page that has already been indexed", async () => {
    const { token } = await deviceFor()
    const id = await visit(token, "keep")
    await asDevice(token, `/stored/${id}/index`, { method: "POST" })

    const response = await asDevice(token, `/stored/${id}`, {
      method: "DELETE",
    })

    expect(response.status).toBe(404)
  })
})
