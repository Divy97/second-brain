import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"

import { signUp } from "./support/http.js"
import api from "../src/index.js"

describe("nightly backups", () => {
  it("writes database and R2 backups on the nightly cron", async () => {
    const session = await signUp()
    await env.ITEM_FILES.put(`${session.userId}/note.webm`, "voice bytes")

    await api.scheduled(
      {
        cron: "0 2 * * *",
        scheduledTime: Date.UTC(2026, 8, 30, 2),
        noRetry: () => undefined,
      },
      env
    )

    const listed = await env.BACKUPS.list({
      prefix: "backups/2026-09-30/",
    })
    expect(listed.objects.map((object) => object.key)).toEqual(
      expect.arrayContaining([
        "backups/2026-09-30/db/items/000000.json",
        "backups/2026-09-30/r2/" + session.userId + "/note.webm",
      ])
    )
  })
})
