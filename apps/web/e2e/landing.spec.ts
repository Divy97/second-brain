import { expect, test } from "@playwright/test"

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({ json: null })
  )
})

test("landing leads to sign-up", async ({ page }) => {
  await page.goto("/")
  await expect(
    page.getByRole("heading", { name: "Save anything. Then just ask." })
  ).toBeVisible()
  await page.getByRole("link", { name: "Start remembering" }).first().click()
  await expect(
    page.getByRole("heading", { name: "Create your account" })
  ).toBeVisible()
  await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible()
})

test("single theme fits the viewport", async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" })
  await page.goto("/")
  await expect(
    page.getByRole("heading", { name: "Save anything. Then just ask." })
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  expect(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).colorScheme
    )
  ).toBe("light")
  await page.screenshot({
    path: testInfo.outputPath("homepage.png"),
    fullPage: true,
  })
})

test("phone header and hero fit at 100% zoom", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await page.goto("/")
  const wordmark = page.getByRole("link", { name: "second brain" }).first()
  const heading = page.getByRole("heading", { level: 1 })
  const cta = page.getByRole("link", { name: "Start remembering" }).first()
  const markBox = await wordmark.boundingBox()
  expect(markBox?.height).toBeLessThan(48)
  expect(
    parseFloat(await heading.evaluate((el) => getComputedStyle(el).fontSize))
  ).toBeLessThanOrEqual(54)
  expect((await cta.boundingBox())?.y).toBeLessThan(667)
  await page.getByRole("button", { name: "Menu" }).click()
  await expect(page.getByRole("navigation", { name: "Mobile" })).toBeVisible()
})

test("desktop hero uses a readable scale", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto("/")
  const heading = page.getByRole("heading", { level: 1 })
  expect(
    parseFloat(await heading.evaluate((el) => getComputedStyle(el).fontSize))
  ).toBeLessThanOrEqual(80)
})

test("homepage explains every capture format and sourced conversations", async ({
  page,
}) => {
  await page.goto("/")
  for (const name of ["Notes", "Voice", "Photos", "PDFs", "Links"]) {
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible()
  }
  await expect(
    page.getByRole("heading", { name: "Answers with a paper trail." })
  ).toBeVisible()
  await expect(page.getByText(/OpenRouter API key/).first()).toBeVisible()
})

test("homepage offers the browser extension honestly, pending Store review", async ({
  page,
}) => {
  await page.goto("/")
  await expect(
    page.getByRole("heading", { name: "Right from your browser." })
  ).toBeVisible()
  const cta = page.getByRole("button", {
    name: "Coming soon on the Chrome Web Store",
  })
  await expect(cta).toBeVisible()
  await expect(cta).toBeDisabled()
  await expect(page.getByRole("link", { name: "Add to Chrome" })).toHaveCount(0)
  await expect(page.getByText("Coming soon", { exact: true })).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Save automatically as you browse" })
  ).toBeVisible()
})

test("navigation stays put while a refreshed session resolves", async ({
  page,
}) => {
  let releaseSession: () => void = () => {
    throw new Error("Session gate not initialized")
  }
  let sessionReady = new Promise<void>((resolve) => {
    releaseSession = resolve
  })
  await page.route("**/api/auth/get-session", async (route) => {
    await sessionReady
    await route.fulfill({
      json: {
        session: { id: "s", token: "test", userId: "u" },
        user: { id: "u", email: "test@example.com", name: "Test" },
      },
    })
  })
  await page.route("**/api/items", (route) =>
    route.fulfill({ json: { items: [], nextCursor: null } })
  )
  await page.route("**/api/keys", (route) =>
    route.fulfill({ json: { openrouter: { set: true, last4: "1234" } } })
  )
  await page.goto("/home")
  const nav = page.getByRole("navigation", { name: "Main", exact: true })
  const mobile = page.getByRole("navigation", { name: "Main mobile" })
  const visibleNav = (await nav.isVisible()) ? nav : mobile
  const before = await visibleNav.boundingBox()
  releaseSession()
  await expect(
    page.getByRole("button", { name: "Sign out test@example.com" })
  ).toBeVisible()
  const after = await visibleNav.boundingBox()
  expect(after).toEqual(before)
  sessionReady = new Promise<void>((resolve) => {
    releaseSession = resolve
  })
  await page.reload()
  await expect(
    page.getByRole("status", { name: "Loading page", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("textbox", { name: "Note", exact: true })
  ).toBeHidden()
  expect(await visibleNav.boundingBox()).toEqual(after)
  releaseSession()
  await expect(
    page.getByRole("textbox", { name: "Note", exact: true })
  ).toBeVisible()
  expect(await visibleNav.boundingBox()).toEqual(after)
})

test("reduced motion keeps controls still and keyboard focus visible", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/sign-in")
  const google = page.getByRole("button", { name: "Continue with Google" })
  await expect(google.locator("img")).toBeVisible()
  expect(
    await google
      .locator("img")
      .evaluate(
        (image: HTMLImageElement) => image.complete && image.naturalWidth > 0
      )
  ).toBe(true)
  const before = await google.boundingBox()
  await google.hover()
  expect(await google.boundingBox()).toEqual(before)
  await google.focus()
  await page.keyboard.press("Tab")
  const email = page.getByRole("textbox", { name: "Email", exact: false })
  await expect(email).toBeFocused()
  expect(await email.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe(
    "none"
  )
})

for (const route of [
  "/home",
  "/threads",
  "/items/demo",
  "/threads/demo",
  "/settings",
]) {
  test(`loading preserves the ${route} layout`, async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.route("**/api/auth/get-session", (request) =>
      request.fulfill({
        json: {
          session: { id: "s", token: "test", userId: "u" },
          user: { id: "u", email: "test@example.com", name: "Test" },
        },
      })
    )
    let release: () => void = () => {
      throw new Error("Data gate not initialized")
    }
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route(/\/api\/(items|threads|keys)(\/.*)?$/, async (request) => {
      await pending
      await request.fulfill({
        status: 503,
        json: { error: { code: "unavailable", message: "Try again" } },
      })
    })
    await page.goto(route)
    await expect(
      page.getByRole("button", { name: "Sign out test@example.com" })
    ).toBeVisible()
    await expect(page.locator('[aria-busy="true"]').first()).toBeVisible()
    if (route.startsWith("/items/"))
      await expect(page.getByRole("link", { name: "All notes" })).toBeVisible()
    if (route.startsWith("/threads/"))
      await expect(
        page.getByRole("link", { name: "All questions" })
      ).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true)
    await page.screenshot({
      path: testInfo.outputPath("loading.png"),
      fullPage: true,
    })
    release()
  })
}
