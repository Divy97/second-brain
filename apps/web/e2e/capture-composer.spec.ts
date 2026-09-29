import { expect, test, type Page } from "@playwright/test"

async function signIn(page: Page) {
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({
      json: {
        session: { id: "session-1", token: "test", userId: "user-1" },
        user: { id: "user-1", email: "test@example.com", name: "Test" },
      },
    })
  )
  await page.route("**/keys", (route) =>
    route.fulfill({ json: { openrouter: { set: true, last4: "1234" } } })
  )
  await page.route("**/items", (route) =>
    route.fulfill({ json: { items: [], nextCursor: null } })
  )
}

test("one composer shows a single capture type at a time", async ({ page }) => {
  await signIn(page)
  await page.goto("/home")

  await expect(page.getByRole("tab", { name: "Note" })).toHaveAttribute(
    "aria-selected",
    "true"
  )
  await expect(
    page.getByRole("textbox", { name: "Note", exact: true })
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "Record audio" })).toBeHidden()
  await expect(
    page.getByRole("textbox", { name: "Link", exact: true })
  ).toBeHidden()

  await page.getByRole("tab", { name: "Link" }).click()
  await expect(
    page.getByRole("textbox", { name: "Link", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("textbox", { name: "Note", exact: true })
  ).toBeHidden()
})

test("switching capture type keeps an unsaved note", async ({ page }) => {
  await signIn(page)
  await page.goto("/home")

  await page
    .getByRole("textbox", { name: "Note", exact: true })
    .fill("Call the framer")
  await page.getByRole("tab", { name: "PDF" }).click()
  await expect(page.getByLabel("Upload PDF")).toBeAttached()
  await page.getByRole("tab", { name: "Note" }).click()
  await expect(
    page.getByRole("textbox", { name: "Note", exact: true })
  ).toHaveValue("Call the framer")
})

test("arrow keys move between capture types", async ({ page }) => {
  await signIn(page)
  await page.goto("/home")

  await page.getByRole("tab", { name: "Note" }).focus()
  await page.keyboard.press("ArrowRight")
  await expect(page.getByRole("tab", { name: "Voice" })).toBeFocused()
  await expect(page.getByRole("button", { name: "Record audio" })).toBeVisible()
  await page.keyboard.press("ArrowLeft")
  await page.keyboard.press("ArrowLeft")
  await expect(page.getByRole("tab", { name: "Link" })).toBeFocused()
})

test("a chosen PDF can be removed before saving", async ({ page }) => {
  await signIn(page)
  await page.goto("/home")

  await page.getByRole("tab", { name: "PDF" }).click()
  const save = page.getByRole("button", { name: "Save PDF" })
  await expect(save).toBeDisabled()
  await page.getByLabel("Upload PDF").setInputFiles({
    name: "lease.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4"),
  })
  await expect(page.getByText("lease.pdf")).toBeVisible()
  await expect(save).toBeEnabled()
  await page.getByRole("button", { name: "Remove lease.pdf" }).click()
  await expect(page.getByText("lease.pdf")).toBeHidden()
  await expect(save).toBeDisabled()
})
