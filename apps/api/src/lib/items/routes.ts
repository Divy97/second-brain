import { Hono, type Context } from "hono"
import { z } from "zod"

import {
  captureTextItem,
  findItem,
  InvalidCursorError,
  listItems,
  replaceItemText,
  softDeleteItem,
  type ItemRef,
} from "@workspace/db"

import { apiError } from "../api-error.js"
import { contentHash } from "./content-hash.js"

import type { AppEnv } from "../app-env.js"
import type { ProcessItemParams } from "../process-item-workflow.js"

const MAX_TEXT_LENGTH = 100_000
const PAGE_SIZE = 50
const itemId = z.uuid()

const textBody = z.object({
  text: z
    .string('Send the note as JSON: { "text": "..." }.')
    .max(MAX_TEXT_LENGTH, "Notes can be at most 100,000 characters.")
    .trim()
    .min(1, "Write something before saving."),
})

type ParsedText = { ok: true; text: string } | { ok: false; message: string }

async function parseText(c: Context<AppEnv>): Promise<ParsedText> {
  const parsed = textBody.safeParse(await c.req.json().catch(() => ({})))
  return parsed.success
    ? { ok: true, text: parsed.data.text }
    : {
        ok: false,
        message: parsed.error.issues[0]?.message ?? "Invalid note.",
      }
}

function itemRef(c: Context<AppEnv>): ItemRef | null {
  const parsed = itemId.safeParse(c.req.param("id"))
  return parsed.success ? { userId: c.var.userId, itemId: parsed.data } : null
}

const invalidText = (c: Context<AppEnv>, message: string) =>
  apiError(c, 400, "invalid_request", message)

const notFound = (c: Context<AppEnv>) =>
  apiError(c, 404, "not_found", "This item does not exist or was deleted.")

async function enqueue(c: Context<AppEnv>, itemId: string): Promise<void> {
  const message: ProcessItemParams = { itemId }
  await c.env.ITEMS_QUEUE.send(message)
}

export const itemRoutes = new Hono<AppEnv>()

itemRoutes.post("/", async (c) => {
  const parsed = await parseText(c)
  if (!parsed.ok) return invalidText(c, parsed.message)

  const { item, created } = await captureTextItem(c.var.db, {
    userId: c.var.userId,
    text: parsed.text,
    contentHash: await contentHash(parsed.text),
  })
  // Re-queue a repeat capture that is still pending, so a lost queue send heals on retry.
  if (item.status === "pending") {
    try {
      await enqueue(c, item.id)
    } catch (error) {
      console.error("queue send failed", item.id, error)
      return apiError(
        c,
        503,
        "queue_unavailable",
        "Your note is saved, but processing could not start. Save it again to retry."
      )
    }
  }
  return c.json(item, created ? 201 : 200)
})

itemRoutes.get("/", async (c) => {
  try {
    const page = await listItems(c.var.db, {
      userId: c.var.userId,
      limit: PAGE_SIZE,
      cursor: c.req.query("cursor"),
    })
    return c.json(page)
  } catch (error) {
    if (error instanceof InvalidCursorError) {
      return apiError(c, 400, "invalid_request", "That page link is invalid.")
    }
    throw error
  }
})

itemRoutes.get("/:id", async (c) => {
  const ref = itemRef(c)
  const item = ref && (await findItem(c.var.db, ref))
  return item ? c.json(item) : notFound(c)
})

itemRoutes.patch("/:id", async (c) => {
  const ref = itemRef(c)
  if (!ref) return notFound(c)
  const parsed = await parseText(c)
  if (!parsed.ok) return invalidText(c, parsed.message)

  const result = await replaceItemText(c.var.db, ref, {
    text: parsed.text,
    contentHash: await contentHash(parsed.text),
  })
  if (result.outcome === "not_found") return notFound(c)
  if (result.outcome === "duplicate") {
    return apiError(
      c,
      409,
      "duplicate",
      "Another saved item already has exactly this text."
    )
  }
  await enqueue(c, ref.itemId)
  const item = await findItem(c.var.db, ref)
  return item ? c.json(item) : notFound(c)
})

itemRoutes.delete("/:id", async (c) => {
  const ref = itemRef(c)
  const deleted = ref && (await softDeleteItem(c.var.db, ref))
  return deleted ? c.body(null, 204) : notFound(c)
})
