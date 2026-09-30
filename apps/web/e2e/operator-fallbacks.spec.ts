import { expect, test, type Page } from "@playwright/test"

const signedIn = async (page: Page) => {
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({
      json: {
        session: { id: "session-1", token: "test", userId: "user-1" },
        user: { id: "user-1", email: "test@example.com", name: "Test" },
      },
    })
  )
}

test("settings asks for the OpenRouter key and nothing else", async ({
  page,
}) => {
  await signedIn(page)
  await page.route("**/keys", (route) =>
    route.fulfill({ json: { openrouter: { set: false } } })
  )

  await page.goto("/settings")

  await expect(
    page.getByRole("heading", { name: "OpenRouter key" })
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: /Transcript key/ })
  ).toHaveCount(0)
  await expect(page.getByRole("heading", { name: /Reader key/ })).toHaveCount(0)
  await expect(page.getByText(/Supadata and Jina/)).toBeVisible()
})

test("a capture left partial by the daily limit says why and offers Reprocess", async ({
  page,
}) => {
  const item = {
    id: "5b1f0c0e-7d57-4a2a-9f11-4a54f9d7e001",
    type: "url",
    status: "ready",
    captureQuality: "partial",
    partialReason: "allowance_used",
    kind: "video",
    title: "Agentic browsers explained",
    excerpt: "https://www.youtube.com/watch?v=abcdefghi02",
    capturedAt: "2026-10-05T10:00:00Z",
    rawText: "https://www.youtube.com/watch?v=abcdefghi02",
    cleanText: null,
    summary: null,
    language: "en",
    tags: [],
    failureReason: null,
    error: null,
    updatedAt: "2026-10-05T10:00:00Z",
    entities: [],
    captures: ["2026-10-05T10:00:00Z"],
    fileName: null,
    mimeType: null,
    fileSize: null,
    sourceUrl: "https://www.youtube.com/watch?v=abcdefghi02",
    sourceNote: null,
  }
  await signedIn(page)
  await page.route("**/keys", (route) =>
    route.fulfill({ json: { openrouter: { set: true, last4: "1234" } } })
  )
  await page.route(`**/items/${item.id}`, (route) =>
    route.request().resourceType() === "document"
      ? route.continue()
      : route.fulfill({ json: item })
  )

  await page.goto(`/items/${item.id}`)

  await expect(
    page.getByText(
      "Saved, but the transcript or article text was not captured because today's limit is used."
    )
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "Reprocess" })).toBeVisible()
})
