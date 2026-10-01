import { z } from "zod"

import {
  countStoredItems,
  deleteStoredItem,
  findItem,
  indexStoredItems,
  InvalidCursorError,
  listItems,
} from "@workspace/db"

import { apiError } from "../api-error.js"
import { enqueueAllOrRefuse } from "../items/enqueue.js"

import type { ExtensionEnv } from "./extension-env.js"
import type { Context } from "hono"

const MAX_PAGE_SIZE = 100
const DEFAULT_PAGE_SIZE = 50

const pageQuery = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
  cursor: z.string().optional(),
})

const bulkBody = z.object({
  ids: z.array(z.uuid()).min(1).max(MAX_PAGE_SIZE),
})

const itemIdSchema = z.uuid()

const notFound = (c: Context<ExtensionEnv>) =>
  apiError(c, 404, "not_found", "This page is not in your Stored items.")

function hostOf(url: string | null): string {
  try {
    return url ? new URL(url).host : ""
  } catch {
    return ""
  }
}

export async function listStoredItems(c: Context<ExtensionEnv>) {
  const query = pageQuery.safeParse(c.req.query())
  if (!query.success) {
    return apiError(c, 400, "invalid_request", "Invalid page request.")
  }
  try {
    const [page, waiting] = await Promise.all([
      listItems(c.var.db, {
        userId: c.var.userId,
        status: "stored",
        ...query.data,
      }),
      countStoredItems(c.var.db, c.var.userId),
    ])
    return c.json({
      items: page.items.map((item) => ({
        id: item.id,
        url: item.sourceUrl,
        host: hostOf(item.sourceUrl),
        title: item.title,
        capturedAt: item.capturedAt,
        status: item.status,
      })),
      waiting,
      nextCursor: page.nextCursor,
    })
  } catch (error) {
    if (error instanceof InvalidCursorError) {
      return apiError(c, 400, "invalid_request", "Invalid cursor.")
    }
    throw error
  }
}

export async function indexStoredItem(c: Context<ExtensionEnv>) {
  const id = itemIdSchema.safeParse(c.req.param("id"))
  if (!id.success) return notFound(c)

  const jobs = await indexStoredItems(c.var.db, c.var.userId, [id.data])
  const refused = await enqueueAllOrRefuse(c, jobs)
  if (refused) return refused
  if (jobs.length > 0) return c.json({ id: id.data, status: "pending" })

  const item = await findItem(c.var.db, {
    userId: c.var.userId,
    itemId: id.data,
  })
  return item ? c.json({ id: id.data, status: item.status }) : notFound(c)
}

export async function indexManyStoredItems(c: Context<ExtensionEnv>) {
  const body = bulkBody.safeParse(await c.req.json().catch(() => ({})))
  if (!body.success) {
    return apiError(
      c,
      400,
      "invalid_request",
      "Choose between 1 and 100 pages."
    )
  }
  const jobs = await indexStoredItems(c.var.db, c.var.userId, body.data.ids)
  const refused = await enqueueAllOrRefuse(c, jobs)
  if (refused) return refused
  return c.json({ queued: jobs.length })
}

export async function removeStoredItem(c: Context<ExtensionEnv>) {
  const id = itemIdSchema.safeParse(c.req.param("id"))
  if (!id.success) return notFound(c)
  const deleted = await deleteStoredItem(c.var.db, {
    userId: c.var.userId,
    itemId: id.data,
  })
  return deleted ? c.body(null, 204) : notFound(c)
}
