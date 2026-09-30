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

interface SocialSignInBody {
  provider: string
  callbackURL: string
  newUserCallbackURL: string
  errorCallbackURL: string
}

test("sign-in starts Google sign-in and returns to the page it came from", async ({
  page,
}) => {
  let body: SocialSignInBody | null = null
  await page.route("**/api/auth/sign-in/social", async (route) => {
    body = route.request().postDataJSON() as SocialSignInBody
    await route.fulfill({
      json: {
        url: "http://localhost:3000/sign-in?error=account_not_linked",
        redirect: true,
      },
    })
  })
  await page.goto("/sign-in?next=%2Fitems%2F42")

  await page.getByRole("button", { name: "Continue with Google" }).click()

  await expect(
    page.getByText(
      "An account with this email already exists. Sign in with your password."
    )
  ).toBeVisible()
  expect(body).toEqual({
    provider: "google",
    callbackURL: "/items/42",
    newUserCallbackURL: "/items/42",
    errorCallbackURL: "/sign-in?next=%2Fitems%2F42",
  })
})

test("sign-up offers Google sign-in too", async ({ page }) => {
  await page.goto("/sign-up")
  await expect(
    page.getByRole("button", { name: "Continue with Google" })
  ).toBeVisible()
})

test("a cancelled Google sign-in explains itself on return", async ({
  page,
}) => {
  await page.goto("/sign-in?error=access_denied")
  await expect(page.getByText("Google sign-in was cancelled.")).toBeVisible()
})

test("an unknown Google failure shows a generic message", async ({ page }) => {
  await page.goto("/sign-in?error=state_mismatch")
  await expect(
    page.getByText("Could not sign in with Google. Try again.")
  ).toBeVisible()
})
