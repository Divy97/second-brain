import { describe, expect, it } from "vitest"

import { asDevice, connectDevice } from "./support/extension.js"
import { request, signUp } from "./support/http.js"

interface CaptureResult {
  id: string
  status: "pending" | "stored" | "processing" | "ready" | "failed"
  created: boolean
}

const article = {
  url: "https://news.example.com/members/long-read",
  title: "A long read behind a login",
  text: "The full text of an article only a signed-in reader can see.",
}

async function deviceFor(label = "Chrome") {
  const session = await signUp()
  const { token } = await connectDevice(session, label)
  return { session, token }
}

async function saveSettings(
  token: string,
  settings: Record<string, unknown>
): Promise<void> {
  const current = await (await asDevice(token, "/settings")).json<object>()
  const response = await asDevice(token, "/settings", {
    method: "PUT",
    json: { ...current, ...settings },
  })
  expect(response.status).toBe(200)
}

function capture(
  token: string,
  body: Record<string, unknown>
): Promise<Response> {
  return asDevice(token, "/captures", { method: "POST", json: body })
}

describe("extension capture", () => {
  it("indexes a manual capture straight away using the text the browser sent", async () => {
    const { session, token } = await deviceFor()

    const response = await capture(token, { ...article, trigger: "manual" })

    expect(response.status).toBe(201)
    const result = await response.json<CaptureResult>()
    expect(result.status).toBe("pending")
    expect(result.created).toBe(true)

    const detail = await request(`/items/${result.id}`, { session })
    expect(detail.status).toBe(200)
    expect(await detail.json()).toMatchObject({
      type: "url",
      sourceUrl: article.url,
      rawText: article.text,
      title: article.title,
    })
  })

  it("refuses passive captures until the user turns passive capture on", async () => {
    const { token } = await deviceFor()

    const response = await capture(token, { ...article, trigger: "passive" })

    expect(response.status).toBe(409)
  })

  it("starts with passive capture off and storing only", async () => {
    const { token } = await deviceFor()

    const response = await asDevice(token, "/settings")

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      passiveEnabled: false,
      passiveMode: "store",
      paused: false,
      blocklist: [],
    })
  })

  it("stores a passive capture without indexing it when the setting says store", async () => {
    const { token } = await deviceFor()
    await saveSettings(token, { passiveEnabled: true, passiveMode: "store" })

    const response = await capture(token, { ...article, trigger: "passive" })

    expect(response.status).toBe(201)
    expect((await response.json<CaptureResult>()).status).toBe("stored")
  })

  it("indexes a passive capture when the setting says index", async () => {
    const { token } = await deviceFor()
    await saveSettings(token, { passiveEnabled: true, passiveMode: "index" })

    const response = await capture(token, { ...article, trigger: "passive" })

    expect((await response.json<CaptureResult>()).status).toBe("pending")
  })

  it("refuses passive captures while the user has paused them", async () => {
    const { token } = await deviceFor()
    await saveSettings(token, { passiveEnabled: true, paused: true })

    const response = await capture(token, { ...article, trigger: "passive" })

    expect(response.status).toBe(409)
  })

  it("keeps each user's settings separate", async () => {
    const first = await deviceFor()
    const second = await deviceFor()
    await saveSettings(first.token, { passiveEnabled: true })

    const response = await asDevice(second.token, "/settings")

    expect(await response.json()).toMatchObject({ passiveEnabled: false })
  })

  it("still indexes a manual capture when passive capture is off", async () => {
    const { token } = await deviceFor()

    const response = await capture(token, { ...article, trigger: "manual" })

    expect((await response.json<CaptureResult>()).status).toBe("pending")
  })

  it("does not create a duplicate when the same page is saved twice", async () => {
    const { token } = await deviceFor()
    const first = await (
      await capture(token, { ...article, trigger: "manual" })
    ).json<CaptureResult>()

    const again = await capture(token, { ...article, trigger: "manual" })

    expect(again.status).toBe(200)
    expect(await again.json()).toMatchObject({ id: first.id, created: false })
  })

  it("indexes a stored page when the user later saves it by hand", async () => {
    const { token } = await deviceFor()
    await saveSettings(token, { passiveEnabled: true, passiveMode: "store" })
    const stored = await (
      await capture(token, { ...article, trigger: "passive" })
    ).json<CaptureResult>()
    expect(stored.status).toBe("stored")

    const saved = await capture(token, { ...article, trigger: "manual" })

    expect(await saved.json()).toMatchObject({
      id: stored.id,
      status: "pending",
    })
  })

  it("does not downgrade an indexed page when it is visited again passively", async () => {
    const { token } = await deviceFor()
    await saveSettings(token, { passiveEnabled: true, passiveMode: "store" })
    const indexed = await (
      await capture(token, { ...article, trigger: "manual" })
    ).json<CaptureResult>()

    const visit = await capture(token, { ...article, trigger: "passive" })

    expect(await visit.json()).toMatchObject({
      id: indexed.id,
      status: "pending",
    })
  })

  it("sends only the link for a video page, ignoring any page text", async () => {
    const { session, token } = await deviceFor()
    const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

    const response = await capture(token, {
      url,
      title: "A video",
      text: "scraped player chrome that must not be saved",
      trigger: "manual",
    })

    expect(response.status).toBe(201)
    const { id } = await response.json<CaptureResult>()
    const detail = await (
      await request(`/items/${id}`, { session })
    ).json<{
      rawText: string
      sourceUrl: string
    }>()
    expect(detail.sourceUrl).toBe(url)
    expect(detail.rawText).not.toContain("scraped player chrome")
  })

  it("accepts a PDF link with no text and indexes it from the link", async () => {
    const { token } = await deviceFor()

    const response = await capture(token, {
      url: "https://files.example.com/paper.pdf",
      trigger: "manual",
    })

    expect(response.status).toBe(201)
    expect((await response.json<CaptureResult>()).status).toBe("pending")
  })

  it("never captures a video or PDF page passively", async () => {
    const { token } = await deviceFor()
    await saveSettings(token, { passiveEnabled: true, passiveMode: "index" })

    for (const url of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://files.example.com/paper.pdf",
    ]) {
      const response = await capture(token, { url, trigger: "passive" })
      expect(response.status, url).toBe(400)
    }
  })

  it("requires text for an ordinary page", async () => {
    const { token } = await deviceFor()

    const response = await capture(token, {
      url: article.url,
      trigger: "manual",
    })

    expect(response.status).toBe(400)
  })

  it("refuses text over the size limit", async () => {
    const { token } = await deviceFor()

    const response = await capture(token, {
      ...article,
      text: "x".repeat(100_001),
      trigger: "manual",
    })

    expect(response.status).toBe(400)
  })

  it("refuses addresses that are not public web pages", async () => {
    const { token } = await deviceFor()

    for (const url of [
      "chrome://settings",
      "file:///etc/passwd",
      "http://localhost:3000/admin",
      "http://192.168.0.1/",
    ]) {
      const response = await capture(token, {
        ...article,
        url,
        trigger: "manual",
      })
      expect(response.status, url).toBe(400)
    }
  })
})
