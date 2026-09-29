import { expect, test } from "@playwright/test"

test("uploading audio shows a saved voice note and its player", async ({
  page,
}) => {
  const item = {
    id: "87d7e748-bfa5-4c5e-bc17-d101f4ed58ba",
    type: "voice",
    status: "pending",
    kind: null,
    title: null,
    excerpt: "",
    capturedAt: "2026-09-29T00:00:00Z",
    rawText: "",
    cleanText: null,
    summary: null,
    language: null,
    tags: [],
    failureReason: null,
    error: null,
    updatedAt: "2026-09-29T00:00:00Z",
    entities: [],
    captures: ["2026-09-29T00:00:00Z"],
    fileName: "memo.wav",
    mimeType: "audio/wav",
    fileSize: 16,
  }
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({
      json: {
        session: { id: "session-1", token: "test", userId: "user-1" },
        user: { id: "user-1", email: "test@example.com", name: "Test" },
      },
    })
  )
  await page.route("**/keys", (route) =>
    route.fulfill({ json: { openrouter: { set: true, last4: "1234" } } })
  )
  await page.route("**/items", (route) =>
    route.fulfill({ json: { items: [], nextCursor: null } })
  )
  await page.route("**/items/audio", (route) =>
    route.fulfill({ status: 201, json: item })
  )
  await page.route(`**/items/${item.id}`, (route) =>
    route.fulfill({ json: item })
  )
  await page.route(`**/items/${item.id}/file`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "audio/wav",
      body: Buffer.from("RIFF$___WAVEfmt "),
    })
  )

  await page.goto("/home")
  await page.getByLabel("Upload audio").setInputFiles({
    name: "memo.wav",
    mimeType: "audio/wav",
    buffer: Buffer.from("RIFF$___WAVEfmt "),
  })
  await expect(page.getByText("memo.wav")).toBeVisible()
  await page.getByRole("button", { name: "Save audio" }).click()
  await expect(page.getByRole("link", { name: /Voice note/ })).toBeVisible()
  await page.getByRole("link", { name: /Voice note/ }).click()
  await expect(
    page.getByRole("heading", { name: "Recording and transcript" })
  ).toBeVisible()
  await expect(page.locator("audio[controls]")).toBeVisible()
})
