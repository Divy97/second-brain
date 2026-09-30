import { expect, test } from "@playwright/test"

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({ json: null })
  )
})

test("video examples reveal answers from the selected sample source", async ({
  page,
}) => {
  await page.goto("/")
  await expect(page.getByText("YouTube & Instagram, remembered")).toBeVisible()
  await page.getByRole("button", { name: "What was that focus tip?" }).click()
  await expect(page.getByRole("status")).toContainText(
    "Put your phone in another room"
  )
  await expect(page.getByRole("status")).toContainText("YouTube transcript")
  await page.getByRole("button", { name: "What went in that recipe?" }).click()
  await expect(page.getByRole("status")).toContainText(
    "White beans, cherry tomatoes"
  )
  await expect(page.getByRole("status")).toContainText("Instagram caption")
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
})

for (const mode of ["sign-in", "sign-up"]) {
  test(`${mode} fields have useful placeholders`, async ({ page }) => {
    await page.goto(`/${mode}`)
    await expect(page.getByRole("textbox", { name: "Email" })).toHaveAttribute(
      "placeholder",
      "you@example.com"
    )
    await expect(page.locator("#password")).toHaveAttribute(
      "placeholder",
      mode === "sign-up"
        ? "Create a password (8+ characters)"
        : "Enter your password"
    )
  })
}

test("explicit sign-out returns to marketing while protected routes still require sign-in", async ({
  page,
}) => {
  let signedIn = true
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({
      json: signedIn
        ? {
            session: { id: "s", token: "t", userId: "u" },
            user: { id: "u", email: "test@example.com", name: "Test" },
          }
        : null,
    })
  )
  await page.route("**/api/auth/sign-out", (route) => {
    signedIn = false
    return route.fulfill({ json: { success: true } })
  })
  await page.route("**/api/items", (route) =>
    route.fulfill({ json: { items: [], nextCursor: null } })
  )
  await page.route("**/api/keys", (route) =>
    route.fulfill({ json: { openrouter: { set: true, last4: "1234" } } })
  )
  await page.goto("/home")
  await page.getByRole("button", { name: "Sign out test@example.com" }).click()
  await expect(page).toHaveURL("/")
  await expect(
    page.getByRole("link", { name: "Start remembering" }).first()
  ).toBeVisible()
  await page.goto("/settings")
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fsettings$/)
})

test("mobile menu paints above the hero and its links stay clickable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 440, height: 956 })
  await page.goto("/")
  await page.getByRole("button", { name: "Menu" }).click()
  const menu = page.getByRole("navigation", { name: "Mobile", exact: true })
  await expect(menu).toBeVisible()
  await expect
    .poll(() =>
      menu.evaluate((element) => {
        const box = element.getBoundingClientRect()
        return [0.25, 0.5, 0.75].every((x) =>
          [0.25, 0.5, 0.75].every((y) =>
            element.contains(
              document.elementFromPoint(
                box.x + box.width * x,
                box.y + box.height * y
              )
            )
          )
        )
      })
    )
    .toBe(true)
  await menu.getByRole("link", { name: "Get started" }).click()
  await expect(page).toHaveURL("/sign-up")
})
