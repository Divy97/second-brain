import { expect, test, type Page } from "@playwright/test"

const defaultSettings = {
  passiveEnabled: false,
  passiveMode: "store" as const,
  paused: false,
  blocklist: [] as string[],
}

test("shows capture settings section", async ({ page }) => {
  await signInWithSettings(page, defaultSettings)
  await page.goto("/settings")

  await expect(
    page.getByRole("heading", { name: "Capture Settings" })
  ).toBeVisible()
  await expect(page.getByText("Record pages as you browse")).toBeVisible()
})

test("enabling passive capture shows additional options", async ({ page }) => {
  await signInWithSettings(page, defaultSettings)
  await page.goto("/settings")

  await expect(page.getByText("When a page is captured")).not.toBeVisible()

  const responsePromise = page.waitForResponse("**/api/capture-settings")
  await page.getByRole("switch", { name: "Record pages as you browse" }).click()
  await responsePromise

  await expect(page.getByText("When a page is captured")).toBeVisible()
  await expect(page.getByRole("switch", { name: "Paused" })).toBeVisible()
})

test("shows blocklist entries and can add new ones", async ({ page }) => {
  await signInWithSettings(page, {
    ...defaultSettings,
    blocklist: ["bank.example.com"],
  })
  await page.goto("/settings")

  await expect(page.getByText("bank.example.com")).toBeVisible()

  await page.getByPlaceholder("example.com").fill("mail.example.com")
  await page.getByRole("button", { name: /Add to blocklist/i }).click()

  await expect(page.getByText("mail.example.com")).toBeVisible()
})

async function signInWithSettings(
  page: Page,
  settings: typeof defaultSettings
) {
  let currentSettings = { ...settings }
  await page.route("**/api/auth/get-session", async (route) => {
    await route.fulfill({
      json: {
        session: { id: "test-session", userId: "test-user" },
        user: { id: "test-user", email: "test@example.com", name: "Test" },
      },
    })
  })
  await page.route("**/api/capture-settings", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: currentSettings })
    } else {
      currentSettings = route.request().postDataJSON() as typeof defaultSettings
      await route.fulfill({ json: currentSettings })
    }
  })
  await page.route("**/api/auth/api-key/list", async (route) => {
    await route.fulfill({ json: { apiKeys: [] } })
  })
  await page.route("**/api/keys", async (route) => {
    await route.fulfill({ json: { openrouter: { set: false } } })
  })
}
