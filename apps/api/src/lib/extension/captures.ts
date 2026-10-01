import { z } from "zod"

import {
  capturePageItem,
  captureUrlItem,
  findCaptureSettings,
  type CapturedItem,
  type Database,
} from "@workspace/db"

import { apiError } from "../api-error.js"
import { safeArticleUrl } from "../article-url.js"
import { contentHash } from "../items/content-hash.js"
import { enqueueOrRefuse } from "../items/enqueue.js"
import { dedupeKey, parseMediaLink } from "../media-url.js"

import type { ExtensionEnv } from "./extension-env.js"
import type { Context } from "hono"

const MAX_TEXT_LENGTH = 100_000
const MAX_TITLE_LENGTH = 500

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

type Trigger = z.infer<typeof captureBody>["trigger"]

interface ParsedCapture {
  url: string
  title: string | null
  text: string | undefined
  trigger: Trigger
}

type Handling = "index" | "store" | "refuse"

type CaptureContext = Context<ExtensionEnv>

function parseCapture(
  body: unknown
): { ok: true; capture: ParsedCapture } | { ok: false; message: string } {
  const parsed = captureBody.safeParse(body)
  if (!parsed.success) return { ok: false, message: "Invalid capture." }
  const url = safeArticleUrl(parsed.data.url)
  if (!url) {
    return { ok: false, message: "Only public web pages can be captured." }
  }
  return {
    ok: true,
    capture: {
      url,
      title: parsed.data.title ?? null,
      text: parsed.data.text,
      trigger: parsed.data.trigger,
    },
  }
}

function isLinkOnly(url: string): boolean {
  return (
    parseMediaLink(url) !== null ||
    new URL(url).pathname.toLowerCase().endsWith(".pdf")
  )
}

async function handlingFor(
  db: Database,
  userId: string,
  trigger: Trigger
): Promise<Handling> {
  if (trigger === "manual") return "index"
  const settings = await findCaptureSettings(db, userId)
  if (!settings.passiveEnabled || settings.paused) return "refuse"
  return settings.passiveMode
}

// Dedupes on the media itself, so every link form of one video is one item.
function urlContentHash(url: string): Promise<string> {
  const link = parseMediaLink(url)
  return contentHash(`url:${link ? dedupeKey(link) : url}`)
}

async function replyWithCapture(
  c: CaptureContext,
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

async function captureLink(
  c: CaptureContext,
  capture: ParsedCapture
): Promise<Response> {
  if (capture.trigger === "passive") {
    return apiError(
      c,
      400,
      "invalid_request",
      "Videos and PDFs are only saved on request."
    )
  }
  return replyWithCapture(
    c,
    await captureUrlItem(c.var.db, {
      userId: c.var.userId,
      sourceUrl: capture.url,
      sourceNote: null,
      contentHash: await urlContentHash(capture.url),
    })
  )
}

async function capturePage(
  c: CaptureContext,
  capture: ParsedCapture
): Promise<Response> {
  if (!capture.text) {
    return apiError(
      c,
      400,
      "invalid_request",
      "This page had no readable text."
    )
  }
  const handling = await handlingFor(c.var.db, c.var.userId, capture.trigger)
  if (handling === "refuse") {
    return apiError(c, 409, "conflict", "Passive capture is off.")
  }
  return replyWithCapture(
    c,
    await capturePageItem(c.var.db, {
      userId: c.var.userId,
      sourceUrl: capture.url,
      title: capture.title,
      text: capture.text,
      contentHash: await urlContentHash(capture.url),
      indexNow: handling === "index",
    })
  )
}

export async function createCapture(c: CaptureContext): Promise<Response> {
  const parsed = parseCapture(await c.req.json().catch(() => ({})))
  if (!parsed.ok) return apiError(c, 400, "invalid_request", parsed.message)
  return isLinkOnly(parsed.capture.url)
    ? captureLink(c, parsed.capture)
    : capturePage(c, parsed.capture)
}
