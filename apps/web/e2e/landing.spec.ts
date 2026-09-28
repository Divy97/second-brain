import { expect, test } from "@playwright/test"

test("landing leads to sign-up", async ({ page }) => {
  await page.goto("/")
  await expect(
    page.getByRole("heading", { name: "Make room for more." })
  ).toBeVisible()
  await page.getByRole("link", { name: "Get started" }).click()
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
