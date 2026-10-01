import { z } from "zod"

import {
  captureUrlItem,
  capturePageItem,
  findCaptureSettings,
  type CapturedItem,
} from "@workspace/db"

import { apiError } from "../api-error.js"
import { safeArticleUrl } from "../article-url.js"
import { contentHash } from "../items/content-hash.js"
import { enqueueOrRefuse } from "../items/enqueue.js"
import { dedupeKey, parseMediaLink } from "../media-url.js"

import type { ExtensionEnv } from "./require-device.js"
import type { Context } from "hono"

const MAX_TEXT_LENGTH = 100_000
const MAX_TITLE_LENGTH = 500

type Trigger = "manual" | "passive"

const captureBody = z.object({
  url: z.string().trim().min(1),
  title: z
    .string()
    .trim()
    .max(MAX_TITLE_LENGTH)
    .transform((value) => (value === "" ? null : value))
    .optional(),
  text: z.string().trim().max(MAX_TEXT_LENGTH).optional(),
  trigger: z.enum(["manual", "passive"]),
})

// Videos and PDFs are fetched from their link by the server's own handling; the page the
// browser shows for them has no useful text.
function isLinkOnly(url: string): boolean {
  return (
    parseMediaLink(url) !== null ||
    new URL(url).pathname.toLowerCase().endsWith(".pdf")
  )
}

// A manual capture is always indexed. A passive one needs passive capture switched on and not
// paused, and follows the user's chosen handling. Null means the capture must be refused.
async function shouldIndexNow(
  c: Context<ExtensionEnv>,
  trigger: Trigger
): Promise<boolean | null> {
  if (trigger === "manual") return true
  const settings = await findCaptureSettings(c.var.db, c.var.userId)
  if (!settings.passiveEnabled || settings.paused) return null
  return settings.passiveMode === "index"
}

async function dedupeToken(url: string): Promise<string> {
  const link = parseMediaLink(url)
  return contentHash(`url:${link ? dedupeKey(link) : url}`)
}

async function respond(
  c: Context<ExtensionEnv>,
  { item, created, run }: CapturedItem
): Promise<Response> {
  if (item.status === "pending") {
    const refused = await enqueueOrRefuse(c, { itemId: item.id, run })
    if (refused) return refused
  }
  return c.json(
    { id: item.id, status: item.status, created },
    created ? 201 : 200
  )
}

export async function createCapture(c: Context<ExtensionEnv>) {
  const parsed = captureBody.safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) {
    return apiError(c, 400, "invalid_request", "Invalid capture.")
  }
  const { title, text, trigger } = parsed.data
  const url = safeArticleUrl(parsed.data.url)
  if (!url) {
    return apiError(
      c,
      400,
      "invalid_request",
      "Only public web pages can be captured."
    )
  }

  if (isLinkOnly(url)) {
    if (trigger === "passive") {
      return apiError(
        c,
        400,
        "invalid_request",
        "Videos and PDFs are only saved on request."
      )
    }
    return respond(
      c,
      await captureUrlItem(c.var.db, {
        userId: c.var.userId,
        sourceUrl: url,
        sourceNote: null,
        contentHash: await dedupeToken(url),
      })
    )
  }

  if (!text) {
    return apiError(
      c,
      400,
      "invalid_request",
      "This page had no readable text."
    )
  }
  const indexNow = await shouldIndexNow(c, trigger)
  if (indexNow === null) {
    return apiError(c, 409, "conflict", "Passive capture is off.")
  }
  return respond(
    c,
    await capturePageItem(c.var.db, {
      userId: c.var.userId,
      sourceUrl: url,
      title: title ?? null,
      text,
      contentHash: await dedupeToken(url),
      indexNow,
    })
  )
}
