import { Hono, type Context } from "hono"
import { z } from "zod"

import {
  captureTextItem,
  findItem,
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
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const textBody = z.object({
  text: z.string().max(MAX_TEXT_LENGTH).trim().min(1),
})

async function parseText(c: Context<AppEnv>): Promise<string | null> {
  const parsed = textBody.safeParse(await c.req.json().catch(() => null))
  return parsed.success ? parsed.data.text : null
}

function itemRef(c: Context<AppEnv>): ItemRef | null {
  const itemId = c.req.param("id")
  return itemId && uuidPattern.test(itemId)
    ? { userId: c.var.userId, itemId }
    : null
}

const emptyText = (c: Context<AppEnv>) =>
  apiError(c, 400, "invalid_request", "Write something before saving.")

const notFound = (c: Context<AppEnv>) =>
  apiError(c, 404, "not_found", "This item does not exist or was deleted.")

async function enqueue(c: Context<AppEnv>, itemId: string): Promise<void> {
  const message: ProcessItemParams = { itemId }
  await c.env.ITEMS_QUEUE.send(message)
}

export const itemRoutes = new Hono<AppEnv>()

itemRoutes.post("/", async (c) => {
  const text = await parseText(c)
  if (text === null) return emptyText(c)

  const { item, created } = await captureTextItem(c.var.db, {
    userId: c.var.userId,
    text,
    contentHash: await contentHash(text),
  })
  if (created) await enqueue(c, item.id)
  return c.json(item, created ? 201 : 200)
})

itemRoutes.get("/", async (c) => {
  const page = await listItems(c.var.db, {
    userId: c.var.userId,
    limit: PAGE_SIZE,
    cursor: c.req.query("cursor"),
  })
  return c.json(page)
})

itemRoutes.get("/:id", async (c) => {
  const ref = itemRef(c)
  const item = ref && (await findItem(c.var.db, ref))
  return item ? c.json(item) : notFound(c)
})

itemRoutes.patch("/:id", async (c) => {
  const ref = itemRef(c)
  if (!ref) return notFound(c)
  const text = await parseText(c)
  if (text === null) return emptyText(c)

  const result = await replaceItemText(c.var.db, ref, {
    text,
    contentHash: await contentHash(text),
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
