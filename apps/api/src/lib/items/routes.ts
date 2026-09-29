import { Hono, type Context } from "hono"
import { z } from "zod"

import {
  completeFileDeletion,
  captureTextItem,
  captureFileItem,
  captureUrlItem,
  findItem,
  findItemFile,
  InvalidCursorError,
  listItems,
  queueFileDeletion,
  replaceItemText,
  requeueItem,
  softDeleteItem,
  type ItemRef,
  type PipelineJob,
} from "@workspace/db"

import { apiError } from "../api-error.js"
import { safeArticleUrl } from "../article-url.js"
import { stalledRunAfterMs } from "../config.js"
import { dedupeKey, parseMediaLink } from "../media-url.js"
import { contentHash } from "./content-hash.js"

import type { AppEnv } from "../app-env.js"

const MAX_TEXT_LENGTH = 100_000
const MAX_AUDIO_SIZE = 25 * 1024 * 1024
const MAX_IMAGE_SIZE = 10 * 1024 * 1024
const PAGE_SIZE = 50
const itemId = z.uuid()

const textBody = z.object({
  text: z
    .string('Send the note as JSON: { "text": "..." }.')
    .max(MAX_TEXT_LENGTH, "Notes can be at most 100,000 characters.")
    .trim()
    .min(1, "Write something before saving."),
})

const urlBody = z.object({
  url: z.string().trim().min(1, "Paste a URL before saving."),
  note: z.string().trim().max(MAX_TEXT_LENGTH).optional(),
})

type ParsedText = { ok: true; text: string } | { ok: false; message: string }

type ParsedUrl =
  | { ok: true; url: string; note: string | null }
  | { ok: false; message: string }

async function parseText(c: Context<AppEnv>): Promise<ParsedText> {
  const parsed = textBody.safeParse(await c.req.json().catch(() => ({})))
  return parsed.success
    ? { ok: true, text: parsed.data.text }
    : {
        ok: false,
        message: parsed.error.issues[0]?.message ?? "Invalid note.",
      }
}

async function parseUrl(c: Context<AppEnv>): Promise<ParsedUrl> {
  const parsed = urlBody.safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid URL.",
    }
  }
  const url = safeArticleUrl(parsed.data.url)
  if (!url) return { ok: false, message: "Paste a public HTTP or HTTPS URL." }
  return { ok: true, url, note: parsed.data.note ?? null }
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

itemRoutes.post("/url", async (c) => {
  const parsed = await parseUrl(c)
  if (!parsed.ok) return invalidText(c, parsed.message)

  // Dedupe on the media itself, so every link form for one video or post is one item.
  // The link the user actually saved is kept, so timestamps still open where they meant.
  const link = parseMediaLink(parsed.url)
  const dedupeUrl = link ? dedupeKey(link) : parsed.url
  const { item, created, run } = await captureUrlItem(c.var.db, {
    userId: c.var.userId,
    sourceUrl: parsed.url,
    sourceNote: parsed.note,
    contentHash: await contentHash(`url:${dedupeUrl}`),
  })
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
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"])
const fileUploadRules = {
  voice: {
    maxSize: MAX_AUDIO_SIZE,
    label: "Audio files",
    chooseMessage: "Choose an audio file.",
    typeMessage: "Choose a WAV, WebM, MP3, M4A, or Ogg audio file.",
    invalidKind: "audio",
    validType: (type: string) => audioTypes.has(type),
    validSignature: validAudioSignature,
  },
  image: {
    maxSize: MAX_IMAGE_SIZE,
    label: "Images",
    chooseMessage: "Choose a photo.",
    typeMessage: "Choose a JPEG, PNG, or WebP image.",
    invalidKind: "image",
    validType: (type: string) => imageTypes.has(type),
    validSignature: validImageSignature,
  },
  pdf: {
    maxSize: MAX_AUDIO_SIZE,
    label: "PDFs",
    chooseMessage: "Choose a PDF.",
    typeMessage: "Choose a PDF file.",
    invalidKind: "PDF",
    validType: (type: string) => type === "application/pdf",
    validSignature: (bytes: Uint8Array) => validPdfSignature(bytes),
  },
} as const

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

function validImageSignature(bytes: Uint8Array, type: string): boolean {
  const text = (start: number, end: number) =>
    String.fromCharCode(...bytes.slice(start, end))
  if (type === "image/png") {
    return (
      bytes
        .slice(0, 8)
        .every(
          (byte, index) => byte === [137, 80, 78, 71, 13, 10, 26, 10][index]
        ) && bytes.length >= 8
    )
  }
  if (type === "image/webp") {
    return text(0, 4) === "RIFF" && text(8, 12) === "WEBP"
  }
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}

function validPdfSignature(bytes: Uint8Array): boolean {
  return (
    String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-" &&
    String.fromCharCode(...bytes.slice(-1024)).includes("%%EOF")
  )
}

async function uploadFile(c: Context<AppEnv>, type: "voice" | "image" | "pdf") {
  const rule = fileUploadRules[type]
  const size = Number(c.req.header("content-length"))
  if (size > rule.maxSize + 4096) {
    return invalidText(
      c,
      `${rule.label} can be at most ${rule.maxSize / 1024 / 1024} MB.`
    )
  }
  const form = await c.req.raw.formData().catch(() => null)
  const file = form?.get("file")
  if (!(file instanceof File)) return invalidText(c, rule.chooseMessage)
  if (!file.size || file.size > rule.maxSize) {
    return invalidText(
      c,
      `${rule.label} must be between 1 byte and ${rule.maxSize / 1024 / 1024} MB.`
    )
  }
  if (!rule.validType(file.type)) return invalidText(c, rule.typeMessage)
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!rule.validSignature(bytes, file.type)) {
    return invalidText(
      c,
      `That file does not appear to be valid ${rule.invalidKind}.`
    )
  }
  const hash = await crypto.subtle.digest("SHA-256", bytes)
  const contentHash = `${type}:${Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("")}`
  const fileKey = `${c.var.userId}/${crypto.randomUUID()}`
  await queueFileDeletion(c.var.db, fileKey)
  try {
    await c.env.ITEM_FILES.put(fileKey, bytes, {
      httpMetadata: { contentType: file.type },
    })
  } catch (error) {
    console.error("file storage failed", error)
    return apiError(
      c,
      503,
      "storage_unavailable",
      "File could not be saved. Try again."
    )
  }
  let capture: Awaited<ReturnType<typeof captureFileItem>>
  try {
    capture = await captureFileItem(c.var.db, {
      userId: c.var.userId,
      type,
      contentHash,
      fileKey,
      fileName: file.name.slice(0, 255),
      mimeType: file.type,
      fileSize: file.size,
    })
  } catch (error) {
    console.error("file capture failed", error)
    return apiError(
      c,
      503,
      "storage_unavailable",
      "File could not be saved. Try again."
    )
  }
  if (!capture.created) {
    try {
      await c.env.ITEM_FILES.delete(fileKey)
      await completeFileDeletion(c.var.db, fileKey)
    } catch (error) {
      console.error("duplicate file cleanup queued", fileKey, error)
    }
  }
  if (capture.item.status === "pending") {
    const refused = await enqueueOrRefuse(c, {
      itemId: capture.item.id,
      run: capture.run,
    })
    if (refused) return refused
  }
  return c.json(capture.item, capture.created ? 201 : 200)
}

itemRoutes.post("/audio", (c) => uploadFile(c, "voice"))
itemRoutes.post("/image", (c) => uploadFile(c, "image"))
itemRoutes.post("/pdf", (c) => uploadFile(c, "pdf"))

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
  if (result.outcome === "not_found") {
    const item = await findItem(c.var.db, ref)
    return item
      ? apiError(c, 409, "conflict", "Only typed notes can be edited.")
      : notFound(c)
  }
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
  if (deleted && file) {
    try {
      await c.env.ITEM_FILES.delete(file.key)
      await completeFileDeletion(c.var.db, file.key)
    } catch (error) {
      console.error("file deletion queued for retry", file.key, error)
    }
  }
  return deleted ? c.body(null, 204) : notFound(c)
})

function requeueRoute(
  allowedFrom: ("pending" | "ready" | "failed")[],
  conflictMessage: string,
  options: { recoverStalled?: boolean; resetExtraction?: boolean } = {}
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
        : undefined,
      options.resetExtraction
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
    "This note is still being processed. Try again when it is ready.",
    { resetExtraction: true }
  )
)
