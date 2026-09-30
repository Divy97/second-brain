import { describe, expect, it } from "vitest"

import { googleSignInErrorMessage, googleSignInOptions } from "./google-sign-in"

describe("googleSignInErrorMessage", () => {
  it("shows nothing when there is no error", () => {
    expect(googleSignInErrorMessage(null)).toBeNull()
  })

  it("tells a user with a password account to use it", () => {
    expect(googleSignInErrorMessage("account_not_linked")).toBe(
      "An account with this email already exists. Sign in with your password."
    )
  })

  it("explains a cancelled Google sign-in", () => {
    expect(googleSignInErrorMessage("access_denied")).toBe(
      "Google sign-in was cancelled."
    )
  })

  it("falls back to a generic message for anything else", () => {
    expect(googleSignInErrorMessage("state_mismatch")).toBe(
      "Could not sign in with Google. Try again."
    )
  })
})

describe("googleSignInOptions", () => {
  it("returns to the requested page on success and to the auth page on error", () => {
    expect(googleSignInOptions("sign-in", "/items/42?from=ask")).toEqual({
      provider: "google",
      callbackURL: "/items/42?from=ask",
      newUserCallbackURL: "/items/42?from=ask",
      errorCallbackURL: "/sign-in?next=%2Fitems%2F42%3Ffrom%3Dask",
    })
  })

  it("keeps the error page plain when heading to the default page", () => {
    expect(googleSignInOptions("sign-up", "/home").errorCallbackURL).toBe(
      "/sign-up"
    )
  })
})
