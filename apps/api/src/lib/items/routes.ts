import { Hono, type Context } from "hono"
import { z } from "zod"

import {
  captureTextItem,
  captureFileItem,
  findItem,
  findItemFile,
  InvalidCursorError,
  listItems,
  replaceItemText,
  requeueItem,
  softDeleteItem,
  type ItemRef,
  type PipelineJob,
} from "@workspace/db"

import { apiError } from "../api-error.js"
import { contentHash } from "./content-hash.js"
import { stalledRunAfterMs } from "../config.js"

import type { AppEnv } from "../app-env.js"

const MAX_TEXT_LENGTH = 100_000
const MAX_AUDIO_SIZE = 25 * 1024 * 1024
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

// Answers 503 when the queue refuses the job: the note is saved, and saving it again (or
// retrying) re-queues it.
async function enqueueOrRefuse(
  c: Context<AppEnv>,
  job: PipelineJob
): Promise<Response | null> {
  try {
    await c.env.ITEMS_QUEUE.send(job)
    return null
  } catch (error) {
    console.error("queue send failed", job.itemId, error)
    return apiError(
      c,
      503,
      "queue_unavailable",
      "Your note is saved, but processing could not start. Try again shortly."
    )
  }
}

export const itemRoutes = new Hono<AppEnv>()

itemRoutes.post("/", async (c) => {
  const parsed = await parseText(c)
  if (!parsed.ok) return invalidText(c, parsed.message)

  const { item, created, run } = await captureTextItem(c.var.db, {
    userId: c.var.userId,
    text: parsed.text,
    contentHash: await contentHash(parsed.text),
  })
  // Re-queue a repeat capture that is still pending, so a lost queue send heals on retry.
  if (item.status === "pending") {
    const refused = await enqueueOrRefuse(c, { itemId: item.id, run })
    if (refused) return refused
  }
  return c.json(item, created ? 201 : 200)
})

const audioTypes = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/ogg",
])

function validAudioSignature(bytes: Uint8Array, type: string): boolean {
  const text = (start: number, end: number) =>
    String.fromCharCode(...bytes.slice(start, end))
  if (type === "audio/wav" || type === "audio/x-wav") {
    return text(0, 4) === "RIFF" && text(8, 12) === "WAVE"
  }
  if (type === "audio/webm") return bytes[0] === 0x1a && bytes[1] === 0x45
  if (type === "audio/ogg") return text(0, 4) === "OggS"
  if (type === "audio/mp4" || type === "audio/x-m4a") {
    return text(4, 8) === "ftyp"
  }
  return text(0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] ?? 0) >= 0xe0)
}

itemRoutes.post("/audio", async (c) => {
  const size = Number(c.req.header("content-length"))
  if (size > MAX_AUDIO_SIZE + 4096) {
    return invalidText(c, "Audio files can be at most 25 MB.")
  }
  const form = await c.req.raw.formData().catch(() => null)
  const file = form?.get("file")
  if (!(file instanceof File)) return invalidText(c, "Choose an audio file.")
  if (!file.size || file.size > MAX_AUDIO_SIZE) {
    return invalidText(c, "Audio files must be between 1 byte and 25 MB.")
  }
  if (!audioTypes.has(file.type)) {
    return invalidText(c, "Choose a WAV, WebM, MP3, M4A, or Ogg audio file.")
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!validAudioSignature(bytes, file.type)) {
    return invalidText(c, "That file does not appear to be valid audio.")
  }
  const hash = await crypto.subtle.digest("SHA-256", bytes)
  const contentHash = `voice:${Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("")}`
  const fileKey = `${c.var.userId}/${crypto.randomUUID()}`
  await c.env.ITEM_FILES.put(fileKey, bytes, {
    httpMetadata: { contentType: file.type },
  })
  let capture: Awaited<ReturnType<typeof captureFileItem>>
  try {
    capture = await captureFileItem(c.var.db, {
      userId: c.var.userId,
      contentHash,
      fileKey,
      fileName: file.name.slice(0, 255),
      mimeType: file.type,
      fileSize: file.size,
    })
  } catch (error) {
    await c.env.ITEM_FILES.delete(fileKey)
    throw error
  }
  if (!capture.created) await c.env.ITEM_FILES.delete(fileKey)
  if (capture.item.status === "pending") {
    const refused = await enqueueOrRefuse(c, {
      itemId: capture.item.id,
      run: capture.run,
    })
    if (refused) return refused
  }
  return c.json(capture.item, capture.created ? 201 : 200)
})

itemRoutes.get("/:id/file", async (c) => {
  const ref = itemRef(c)
  const file = ref && (await findItemFile(c.var.db, ref))
  if (!file) return notFound(c)
  const object = await c.env.ITEM_FILES.get(file.key)
  if (!object) return notFound(c)
  return new Response(object.body, {
    headers: {
      "content-type": file.mimeType,
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "cache-control": "private, no-store",
    },
  })
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
  const refused = await enqueueOrRefuse(c, {
    itemId: ref.itemId,
    run: result.run,
  })
  if (refused) return refused
  const item = await findItem(c.var.db, ref)
  return item ? c.json(item) : notFound(c)
})

itemRoutes.delete("/:id", async (c) => {
  const ref = itemRef(c)
  const file = ref && (await findItemFile(c.var.db, ref))
  const deleted = ref && (await softDeleteItem(c.var.db, ref))
  if (deleted && file) await c.env.ITEM_FILES.delete(file.key)
  return deleted ? c.body(null, 204) : notFound(c)
})

function requeueRoute(
  allowedFrom: ("pending" | "ready" | "failed")[],
  conflictMessage: string,
  options: { recoverStalled?: boolean } = {}
) {
  return async (c: Context<AppEnv>) => {
    const ref = itemRef(c)
    if (!ref) return notFound(c)
    const result = await requeueItem(
      c.var.db,
      ref,
      allowedFrom,
      options.recoverStalled
        ? new Date(Date.now() - stalledRunAfterMs)
        : undefined
    )
    if (result.outcome === "not_found") return notFound(c)
    if (result.outcome === "conflict") {
      return apiError(c, 409, "conflict", conflictMessage)
    }
    const refused = await enqueueOrRefuse(c, result.job)
    if (refused) return refused
    const item = await findItem(c.var.db, ref)
    return item ? c.json(item) : notFound(c)
  }
}

itemRoutes.post(
  "/:id/retry",
  requeueRoute(
    ["failed", "pending"],
    "This note is already processing or ready. Reprocess it instead.",
    { recoverStalled: true }
  )
)

itemRoutes.post(
  "/:id/reprocess",
  requeueRoute(
    ["ready", "failed"],
    "This note is still being processed. Try again when it is ready."
  )
)
