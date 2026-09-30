import { afterEach, expect, test, vi } from "vitest"

import { describeAuthError } from "./auth-client"

afterEach(() => {
  vi.unstubAllGlobals()
})

test("wrong credentials give a clear sign-in error", () => {
  expect(
    describeAuthError({ code: "INVALID_EMAIL_OR_PASSWORD", status: 401 })
  ).toBe("Email or password is incorrect.")
})

test("sessions are read through the web origin so the cookie stays first-party", async () => {
  vi.resetModules()
  vi.stubGlobal("window", { location: { origin: "https://app.example" } })
  const fetchMock = vi.fn(() => Promise.resolve(Response.json(null)))
  vi.stubGlobal("fetch", fetchMock)
  const { authClient: browserClient } = await import("./auth-client")

  await browserClient.getSession()

  const [target] = fetchMock.mock.calls[0] as unknown as [unknown]
  expect(String(target)).toBe("https://app.example/api/auth/get-session")
})
