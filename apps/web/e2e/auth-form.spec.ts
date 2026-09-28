import { expect, test } from "@playwright/test"

test("sign-in explains required fields and can reveal the password", async ({
  page,
}) => {
  await page.goto("/sign-in")
  await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible()
  await expect(page.locator("#password")).toBeVisible()
  await expect(page.getByText("Required", { exact: true })).toHaveCount(2)
  const password = page.locator("#password")
  await page.getByRole("button", { name: "Show password" }).click()
  await expect(password).toHaveAttribute("type", "text")
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(page.getByText("Enter your email address.")).toBeVisible()
  await expect(page.getByText("Enter your password.")).toBeVisible()
})

test("sign-up explains invalid email and short password", async ({ page }) => {
  await page.goto("/sign-up")
  await page.getByRole("textbox", { name: "Email" }).fill("invalid")
  await page.locator("#password").fill("short")
  await page.getByRole("button", { name: "Create account" }).click()
  await expect(page.getByText("Enter a valid email address.")).toBeVisible()
  await expect(page.getByText("Use at least 8 characters.")).toBeVisible()
})
