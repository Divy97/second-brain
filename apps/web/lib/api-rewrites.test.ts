import { describe, expect, it } from "vitest"

import { apiRewrites } from "./api-rewrites"

const worker = "https://worker.example"

function destinationFor(path: string): string | null {
  for (const { source, destination } of apiRewrites(worker)) {
    const pattern = source.replace(/:path\*$/, "(.*)")
    const match = new RegExp(`^${pattern}$`).exec(path)
    if (match) return destination.replace(":path*", match[1] ?? "")
  }
  return null
}

describe("apiRewrites", () => {
  it("forwards auth routes to the Worker's auth routes unchanged", () => {
    expect(destinationFor("/api/auth/get-session")).toBe(
      `${worker}/api/auth/get-session`
    )
    expect(destinationFor("/api/auth/callback/google")).toBe(
      `${worker}/api/auth/callback/google`
    )
  })

  it.each(["items", "threads", "keys", "health"])(
    "forwards /api/%s to the Worker without the prefix",
    (route) => {
      expect(destinationFor(`/api/${route}`)).toBe(`${worker}/${route}`)
      expect(destinationFor(`/api/${route}/abc/file`)).toBe(
        `${worker}/${route}/abc/file`
      )
    }
  )

  it.each(["/items", "/threads", "/settings", "/status", "/home"])(
    "leaves the %s page alone",
    (page) => {
      expect(destinationFor(page)).toBeNull()
    }
  )

  it("tolerates a trailing slash on the Worker origin", () => {
    expect(
      apiRewrites(`${worker}/`)[0]?.destination.startsWith(`${worker}/api`)
    ).toBe(true)
  })
})
