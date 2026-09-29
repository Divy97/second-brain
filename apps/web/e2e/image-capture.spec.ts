import { expect, test } from "@playwright/test"

test("a photo can be previewed, saved, and opened with its extracted text", async ({
  page,
}) => {
  const item = {
    id: "3d362681-8ea3-4cff-b6cf-f7c5b27b9900",
    type: "image",
    status: "ready",
    captureQuality: "full",
    kind: "image",
    title: "Lisbon itinerary",
    excerpt: "Take bus 28 to Alfama",
    capturedAt: "2026-09-29T00:00:00Z",
    rawText: "Take bus 28 to Alfama\n\nA handwritten itinerary.",
    cleanText: "Take bus 28 to Alfama",
    summary: "A handwritten itinerary.",
    language: "en",
    tags: [],
    failureReason: null,
    error: null,
    updatedAt: "2026-09-29T00:00:00Z",
    entities: [],
    captures: ["2026-09-29T00:00:00Z"],
    fileName: "itinerary.png",
    mimeType: "image/png",
    fileSize: 68,
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
  await page.route("**/items/image", (route) =>
    route.fulfill({ status: 201, json: item })
  )
  await page.route(`**/items/${item.id}`, (route) =>
    route.fulfill({ json: item })
  )
  await page.route(`**/items/${item.id}/file`, (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9n0XcAAAAASUVORK5CYII=",
        "base64"
      ),
    })
  )

  await page.goto("/home")
  await page.getByRole("tab", { name: "Photo" }).click()
  await expect(page.getByLabel("Take photo")).toHaveAttribute(
    "capture",
    "environment"
  )
  await page.getByLabel("Upload photo").setInputFiles({
    name: "itinerary.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9n0XcAAAAASUVORK5CYII=",
      "base64"
    ),
  })
  await expect(page.getByAltText("Photo preview")).toBeVisible()
  await page.getByRole("button", { name: "Save photo" }).click()
  await page.getByRole("link", { name: /Lisbon itinerary/ }).click()
  await expect(page.getByAltText("itinerary.png")).toBeVisible()
  await expect(
    page.getByRole("link", { name: "Open original photo" })
  ).toHaveAttribute(
    "href",
    /\/items\/3d362681-8ea3-4cff-b6cf-f7c5b27b9900\/file$/
  )
  await expect
    .poll(() =>
      page
        .getByAltText("itinerary.png")
        .evaluate((image) => (image as HTMLImageElement).naturalWidth)
    )
    .toBeGreaterThan(0)
  await expect(
    page.getByText("Take bus 28 to Alfama", { exact: true })
  ).toBeVisible()
})
