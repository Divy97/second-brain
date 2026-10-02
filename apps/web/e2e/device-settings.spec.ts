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
  await expect(page.getByText("Never used")).toBeVisible()
  await expect(
    page.getByRole("button", { name: /Disconnect Chrome/i })
  ).toBeVisible()
})

test("shows empty state when no devices", async ({ page }) => {
  await signInWithDevices(page, { apiKeys: [] })
  await page.goto("/settings")

  await expect(
    page.getByText("No devices connected. Create a device key")
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

test("creating a device key shows it once and lists the new device", async ({
  page,
}) => {
  let devices = { apiKeys: [...mockDevices.apiKeys] }
  await mockSession(page)
  await page.route("**/api/auth/api-key/list", async (route) => {
    await route.fulfill({ json: devices })
  })
  await page.route("**/api/devices", async (route) => {
    const body = route.request().postDataJSON() as { label?: string }
    devices = {
      apiKeys: [
        ...devices.apiKeys,
        {
          id: "device-3",
          name: body.label ?? "Browser extension",
          start: "sbx_",
          createdAt: new Date().toISOString(),
          lastRequest: null,
          enabled: true,
        },
      ],
    }
    await route.fulfill({
      status: 201,
      json: {
        key: "sbx_fresh-device-key-123",
        id: "device-3",
        name: body.label,
      },
    })
  })

  await page.goto("/settings")
  await page.getByRole("button", { name: "Create device key" }).click()
  await page.getByLabel("Device name").fill("Brave work profile")
  await page.getByRole("button", { name: "Create key" }).click()

  await expect(page.getByLabel("Your device key")).toHaveValue(
    "sbx_fresh-device-key-123"
  )
  await expect(page.getByText(/won.t be shown again/i)).toBeVisible()
  await expect(page.getByRole("button", { name: "Copy key" })).toBeVisible()

  await page.getByRole("button", { name: "Done" }).click()

  await expect(page.getByLabel("Your device key")).toHaveCount(0)
  await expect(page.getByText("sbx_fresh-device-key-123")).toHaveCount(0)
  await expect(page.getByText("Brave work profile")).toBeVisible()
})

test("explains when the device limit is reached", async ({ page }) => {
  await mockSession(page)
  await page.route("**/api/auth/api-key/list", async (route) => {
    await route.fulfill({ json: mockDevices })
  })
  await page.route("**/api/devices", async (route) => {
    await route.fulfill({
      status: 409,
      json: {
        error: {
          code: "device_limit",
          message: "You have reached the device limit.",
        },
      },
    })
  })

  await page.goto("/settings")
  await page.getByRole("button", { name: "Create device key" }).click()
  await page.getByRole("button", { name: "Create key" }).click()

  await expect(page.getByText(/reached the device limit/i)).toBeVisible()
})

async function mockSession(page: Page) {
  await page.route("**/api/auth/get-session", async (route) => {
    await route.fulfill({
      json: {
        session: { id: "test-session", userId: "test-user" },
        user: { id: "test-user", email: "test@example.com", name: "Test" },
      },
    })
  })
}

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
