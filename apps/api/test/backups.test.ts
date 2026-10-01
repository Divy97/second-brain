import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"

import { asDevice, connectDevice } from "./support/extension.js"
import { signUp } from "./support/http.js"
import api from "../src/index.js"

const nightly = {
  cron: "0 2 * * *",
  scheduledTime: Date.UTC(2026, 8, 30, 2),
  noRetry: () => undefined,
}
const backupsOn = { ...env, NIGHTLY_BACKUPS: "on" }

describe("nightly backups", () => {
  it("writes database and R2 backups on the nightly cron", async () => {
    const session = await signUp()
    await env.ITEM_FILES.put(`${session.userId}/note.webm`, "voice bytes")

    await api.scheduled(nightly, backupsOn)

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

  it("backs up each user's capture settings, including their blocklist", async () => {
    const session = await signUp()
    const { token } = await connectDevice(session)
    await asDevice(token, "/settings", {
      method: "PUT",
      json: {
        passiveEnabled: true,
        passiveMode: "store",
        paused: false,
        blocklist: ["bank.example.com"],
      },
    })

    await api.scheduled(nightly, backupsOn)

    const object = await env.BACKUPS.get(
      "backups/2026-09-30/db/capture_settings/000000.json"
    )
    const rows =
      await object?.json<{ user_id: string; blocklist: string[] }[]>()
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          user_id: session.userId,
          blocklist: ["bank.example.com"],
        }),
      ])
    )
  })

  it("writes nothing while the backup flag is off", async () => {
    await api.scheduled(
      { ...nightly, scheduledTime: Date.UTC(2026, 9, 1, 2) },
      { ...env, NIGHTLY_BACKUPS: "off" }
    )

    const listed = await env.BACKUPS.list({ prefix: "backups/2026-10-01/" })
    expect(listed.objects).toEqual([])
  })

  it("is off unless the flag is set", () => {
    expect(env.NIGHTLY_BACKUPS).toBe("off")
  })

  it("deletes backups older than the retention window after a successful run", async () => {
    await env.BACKUPS.put("backups/2026-09-01/db/items/000000.json", "[]")
    await env.BACKUPS.put("backups/2026-09-23/db/items/000000.json", "[]")
    await env.BACKUPS.put("backups/2026-09-24/r2/a/file.webm", "bytes")

    await api.scheduled(nightly, backupsOn)

    const keys = (await env.BACKUPS.list({ prefix: "backups/" })).objects.map(
      (object) => object.key
    )
    expect(keys).not.toContain("backups/2026-09-01/db/items/000000.json")
    expect(keys).not.toContain("backups/2026-09-23/db/items/000000.json")
    expect(keys).toContain("backups/2026-09-24/r2/a/file.webm")
    expect(keys).toContain("backups/2026-09-30/db/items/000000.json")
  })
})
