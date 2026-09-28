import { expect, test } from "@playwright/test"

test("landing leads to sign-up", async ({ page }) => {
  await page.goto("/")
  await expect(
    page.getByRole("heading", { name: "Make room for more." })
  ).toBeVisible()
  await page.getByRole("link", { name: "Start remembering" }).first().click()
  await expect(
    page.getByRole("heading", { name: "Create your account" })
  ).toBeVisible()
  await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible()
})

test("single theme fits the viewport", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" })
  await page.goto("/")
  await expect(
    page.getByRole("heading", { name: "Make room for more." })
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
