import { expect, test } from "vitest"

import { describeAuthError } from "./auth-client"

test("wrong credentials give a clear sign-in error", () => {
  expect(
    describeAuthError({ code: "INVALID_EMAIL_OR_PASSWORD", status: 401 })
  ).toBe("Email or password is incorrect.")
})
