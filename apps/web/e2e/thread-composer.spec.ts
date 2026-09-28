import { expect, test } from "@playwright/test"

test("long conversations open with the latest answer and reply box in view", async ({
  page,
}) => {
  const messages = Array.from({ length: 12 }, (_, index) => ({
    id: `message-${index}`,
    role: index % 2 === 0 ? "user" : "assistant",
    text:
      index === 11
        ? "The latest answer"
        : `Earlier message ${index}. ${"Some saved context. ".repeat(20)}`,
    createdAt: "2026-09-29T00:00:00Z",
    sources: [],
  }))
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({
      json: {
        session: { id: "session-1", token: "test", userId: "user-1" },
        user: { id: "user-1", email: "test@example.com", name: "Test" },
      },
    })
  )
  await page.route("**/threads/demo-thread", (route) =>
    route.request().resourceType() === "document"
      ? route.continue()
      : route.fulfill({
          json: {
            id: "demo-thread",
            title: "Long conversation",
            createdAt: "2026-09-29T00:00:00Z",
            messages,
          },
        })
  )
  await page.route("**/threads/demo-thread/messages", (route) => {
    messages.push(
      {
        id: "new-question",
        role: "user",
        text: "Another question",
        createdAt: "2026-09-29T00:00:00Z",
        sources: [],
      },
      {
        id: "new-answer",
        role: "assistant",
        text: "The new answer",
        createdAt: "2026-09-29T00:00:00Z",
        sources: [],
      }
    )
    return route.fulfill({ json: messages.at(-1) })
  })

  await page.goto("/threads/demo-thread")
  const composer = page.getByRole("textbox", { name: "Ask a follow-up" })
  await expect(composer).toBeVisible()
  await expect(page.getByText("The latest answer")).toBeInViewport()
  await expect(composer).toBeInViewport()

  await page.evaluate(() => {
    scrollTo(0, 0)
  })
  await expect(composer).toBeInViewport()
  await composer.fill("Another question")
  await composer.press("Enter")
  await expect(page.getByText("The new answer")).toBeInViewport()
  await expect(composer).toBeInViewport()

  if ((page.viewportSize()?.width ?? 0) < 640) {
    const composerBox = await composer.boundingBox()
    const navBox = await page
      .getByRole("navigation", { name: "Main mobile" })
      .boundingBox()
    if (!composerBox || !navBox) throw new Error("Missing phone controls")
    expect(composerBox.y + composerBox.height).toBeLessThan(navBox.y)
  }
})
