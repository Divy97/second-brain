import { expect, test, type Page } from "@playwright/test"

const mockDevices = {
  apiKeys: [
    {
      id: "device-1",
      name: "Chrome on MacBook",
      start: "sbx_",
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      lastRequest: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      enabled: true,
    },
    {
      id: "device-2",
      name: "Firefox on Linux",
      start: "sbx_",
      createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      lastRequest: null,
      enabled: true,
    },
  ],
}

test("shows connected devices with names and timestamps", async ({ page }) => {
  await signInWithDevices(page, mockDevices)
  await page.goto("/settings")

  await expect(
    page.getByRole("heading", { name: "Connected Devices" })
  ).toBeVisible()
  await expect(page.getByText("Chrome on MacBook")).toBeVisible()
  await expect(page.getByText("Firefox on Linux")).toBeVisible()
  await expect(
    page.getByRole("button", { name: /Disconnect Chrome/i })
  ).toBeVisible()
})

test("shows empty state when no devices", async ({ page }) => {
  await signInWithDevices(page, { apiKeys: [] })
  await page.goto("/settings")

  await expect(
    page.getByText("No devices connected. Install the browser extension")
  ).toBeVisible()
})

test("disconnecting a device removes it from the list", async ({ page }) => {
  let devices = { ...mockDevices }
  await page.route("**/api/auth/get-session", async (route) => {
    await route.fulfill({
      json: {
        session: { id: "test-session", userId: "test-user" },
        user: { id: "test-user", email: "test@example.com", name: "Test" },
      },
    })
  })
  await page.route("**/api/auth/api-key/list", async (route) => {
    await route.fulfill({ json: devices })
  })
  await page.route("**/api/auth/api-key/delete", async (route) => {
    const body = route.request().postDataJSON() as { keyId: string }
    devices = {
      apiKeys: devices.apiKeys.filter((d) => d.id !== body.keyId),
    }
    await route.fulfill({ json: { success: true } })
  })

  await page.goto("/settings")
  await expect(page.getByText("Chrome on MacBook")).toBeVisible()

  await page.getByRole("button", { name: /Disconnect Chrome/i }).click()

  await expect(page.getByText("Chrome on MacBook")).not.toBeVisible()
  await expect(page.getByText("Firefox on Linux")).toBeVisible()
})

async function signInWithDevices(page: Page, devices: typeof mockDevices) {
  await page.route("**/api/auth/get-session", async (route) => {
    await route.fulfill({
      json: {
        session: { id: "test-session", userId: "test-user" },
        user: { id: "test-user", email: "test@example.com", name: "Test" },
      },
    })
  })
  await page.route("**/api/auth/api-key/list", async (route) => {
    await route.fulfill({ json: devices })
  })
}
