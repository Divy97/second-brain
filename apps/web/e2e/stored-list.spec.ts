import { expect, test, type Page } from "@playwright/test"

const mockStoredItems = {
  items: [
    {
      id: "item-1",
      url: "https://example.com/article-1",
      host: "example.com",
      title: "Interesting Article",
      capturedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      status: "stored",
    },
    {
      id: "item-2",
      url: "https://blog.example.com/post",
      host: "blog.example.com",
      title: null,
      capturedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      status: "stored",
    },
  ],
  waiting: 2,
  nextCursor: null,
}

test("shows stored items with count badge", async ({ page }) => {
  await signInWithStored(page, mockStoredItems)
  await page.goto("/stored")

  await expect(page.getByRole("heading", { name: "Stored" })).toBeVisible()
  await expect(page.getByText("Interesting Article")).toBeVisible()
  await expect(
    page.getByRole("button", { name: /Index/i }).first()
  ).toBeVisible()
})

test("shows empty state when no stored items", async ({ page }) => {
  await signInWithStored(page, { items: [], waiting: 0, nextCursor: null })
  await page.goto("/stored")

  await expect(
    page.getByText("No stored pages. Turn on passive capture")
  ).toBeVisible()
})

test("indexing a single item removes it from the list", async ({ page }) => {
  let items = { ...mockStoredItems }
  await page.route("**/api/auth/get-session", async (route) => {
    await route.fulfill({
      json: {
        session: { id: "test-session", userId: "test-user" },
        user: { id: "test-user", email: "test@example.com", name: "Test" },
      },
    })
  })
  await page.route("**/api/stored", async (route) => {
    await route.fulfill({ json: items })
  })
  await page.route("**/api/stored/item-1/index", async (route) => {
    items = {
      items: items.items.filter((i) => i.id !== "item-1"),
      waiting: 1,
      nextCursor: null,
    }
    await route.fulfill({ json: { id: "item-1", status: "pending" } })
  })

  await page.goto("/stored")
  await expect(page.getByText("Interesting Article")).toBeVisible()

  await page.getByRole("button", { name: /Index Interesting Article/i }).click()

  await expect(page.getByText("Interesting Article")).not.toBeVisible()
})

test("selecting and bulk indexing works", async ({ page }) => {
  await signInWithStored(page, mockStoredItems)
  await page.route("**/api/stored/index", async (route) => {
    await route.fulfill({ json: { queued: 2 } })
  })

  await page.goto("/stored")
  await page.getByText("Select all").click()
  await expect(
    page.getByRole("button", { name: /Index 2 selected/i })
  ).toBeVisible()
})

async function signInWithStored(page: Page, stored: typeof mockStoredItems) {
  await page.route("**/api/auth/get-session", async (route) => {
    await route.fulfill({
      json: {
        session: { id: "test-session", userId: "test-user" },
        user: { id: "test-user", email: "test@example.com", name: "Test" },
      },
    })
  })
  await page.route("**/api/stored", async (route) => {
    await route.fulfill({ json: stored })
  })
}
