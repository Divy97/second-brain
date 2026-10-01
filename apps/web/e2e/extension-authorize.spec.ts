import { expect, test, type Page } from "@playwright/test"

const validParams = new URLSearchParams({
  label: "Chrome on MacBook",
  code_challenge: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
  redirect_uri: "https://test-extension/callback",
})

test("redirects unauthenticated users to sign-in", async ({ page }) => {
  await page.goto(`/extension/authorize?${validParams}`)
  await expect(page).toHaveURL(/\/sign-in/)
})

test("shows device name and permissions for authenticated users", async ({
  page,
}) => {
  await signInTestUser(page)
  await page.goto(`/extension/authorize?${validParams}`)

  await expect(page.getByText("Chrome on MacBook")).toBeVisible()
  await expect(page.getByText("Save pages you visit")).toBeVisible()
  await expect(page.getByText("Manage your capture settings")).toBeVisible()
  await expect(page.getByRole("button", { name: "Approve" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible()
})

test("rejects missing parameters", async ({ page }) => {
  await signInTestUser(page)
  await page.goto("/extension/authorize?label=Test")
  await expect(page.getByText("Invalid connection request")).toBeVisible()
})

test("approving connects the device and posts to API", async ({ page }) => {
  await signInTestUser(page)
  const captured: { body: unknown } = { body: null }
  await page.route("**/api/extension/authorize", async (route) => {
    captured.body = route.request().postDataJSON()
    await route.fulfill({
      json: { redirectTo: "https://test-extension/callback?code=test-code" },
    })
  })

  await page.goto(`/extension/authorize?${validParams}`)
  await page.getByRole("button", { name: "Approve" }).click()

  await page.waitForResponse("**/api/extension/authorize")
  expect(captured.body).toEqual({
    label: "Chrome on MacBook",
    codeChallenge: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
    redirectUri: "https://test-extension/callback",
  })
})

test("cancelling closes without connecting", async ({ page }) => {
  await signInTestUser(page)
  await page.goto(`/extension/authorize?${validParams}`)
  await page.getByRole("button", { name: "Cancel" }).click()
  await expect(page).toHaveURL("/home")
})

async function signInTestUser(page: Page) {
  await page.route("**/api/auth/get-session", async (route) => {
    await route.fulfill({
      json: {
        session: { id: "test-session", userId: "test-user" },
        user: { id: "test-user", email: "test@example.com", name: "Test User" },
      },
    })
  })
}
