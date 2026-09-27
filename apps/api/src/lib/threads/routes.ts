import { Hono, type Context } from "hono"
import { z } from "zod"

import { OpenRouterError } from "@workspace/ai"
import {
  appendExchange,
  createThread,
  findThread,
  listLiveItemIds,
  listRecentMessages,
  listSourceCards,
  listThreads,
  softDeleteThread,
  threadExists,
  type ThreadMessage,
  type ThreadRef,
} from "@workspace/db"

import { apiError } from "../api-error.js"
import { askQuestion, toHistory } from "../ask/index.js"
import { retrieval } from "../config.js"

import type { AppEnv } from "../app-env.js"

const MAX_QUESTION_LENGTH = 2_000
const threadId = z.uuid()

const askBody = z.object({
  question: z
    .string("Send the question as JSON.")
    .max(
      MAX_QUESTION_LENGTH,
      `Questions can be at most ${MAX_QUESTION_LENGTH.toLocaleString("en")} characters.`
    )
    .trim()
    .min(1, "Type a question first."),
  timezone: z
    .string()
    .refine((zone) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: zone })
        return true
      } catch {
        return false
      }
    }, "Unknown timezone.")
    .default("UTC"),
})

function threadRef(c: Context<AppEnv>): ThreadRef | null {
  const parsed = threadId.safeParse(c.req.param("id"))
  return parsed.success ? { userId: c.var.userId, threadId: parsed.data } : null
}

const notFound = (c: Context<AppEnv>) =>
  apiError(c, 404, "not_found", "This thread does not exist or was deleted.")

async function withSources(c: Context<AppEnv>, messages: ThreadMessage[]) {
  const cards = await listSourceCards(c.var.db, {
    userId: c.var.userId,
    itemIds: [...new Set(messages.flatMap((message) => message.citedItemIds))],
  })
  const byId = new Map(cards.map((card) => [card.id, card]))
  return messages.map(({ citedItemIds, ...message }) => ({
    ...message,
    sources: citedItemIds.flatMap((id) => byId.get(id) ?? []),
  }))
}

async function followUpContext(c: Context<AppEnv>, ref: ThreadRef) {
  const recent = await listRecentMessages(c.var.db, {
    threadId: ref.threadId,
    limit: retrieval.historyMessages,
  })
  const live = await listLiveItemIds(c.var.db, {
    userId: ref.userId,
    itemIds: [...new Set(recent.flatMap((message) => message.citedItemIds))],
  })
  return toHistory(recent, live)
}

function modelFailure(c: Context<AppEnv>, error: OpenRouterError): Response {
  switch (error.kind) {
    case "invalid_key":
      return apiError(
        c,
        422,
        "invalid_key",
        "OpenRouter rejected your key. Replace it in settings."
      )
    case "insufficient_credits":
      return apiError(
        c,
        422,
        "insufficient_credits",
        "Your OpenRouter credits ran out. Add credits, then ask again."
      )
    default:
      return apiError(
        c,
        503,
        "model_unavailable",
        "The model is unavailable right now. Try again in a moment."
      )
  }
}

export const threadRoutes = new Hono<AppEnv>()

threadRoutes.post("/", async (c) => {
  const thread = await createThread(c.var.db, c.var.userId)
  return c.json(thread, 201)
})

threadRoutes.get("/", async (c) => {
  return c.json({ threads: await listThreads(c.var.db, c.var.userId) })
})

threadRoutes.get("/:id", async (c) => {
  const ref = threadRef(c)
  const thread = ref && (await findThread(c.var.db, ref))
  if (!thread) return notFound(c)
  return c.json({ ...thread, messages: await withSources(c, thread.messages) })
})

threadRoutes.post("/:id/messages", async (c) => {
  const ref = threadRef(c)
  if (!ref || !(await threadExists(c.var.db, ref))) return notFound(c)
  const parsed = askBody.safeParse(await c.req.json().catch(() => ({})))
  if (!parsed.success) {
    return apiError(
      c,
      400,
      "invalid_request",
      parsed.error.issues[0]?.message ?? "Invalid question."
    )
  }

  let result
  try {
    result = await askQuestion(c.var.db, c.env, {
      userId: c.var.userId,
      question: parsed.data.question,
      timezone: parsed.data.timezone,
      now: new Date(),
      history: await followUpContext(c, ref),
    })
  } catch (error) {
    if (error instanceof OpenRouterError) return modelFailure(c, error)
    throw error
  }
  if (!result.ok) {
    return apiError(
      c,
      422,
      "missing_key",
      "Add your OpenRouter key in settings to ask questions."
    )
  }

  const message = await appendExchange(c.var.db, ref, {
    question: parsed.data.question,
    answer: result.answer.text,
    citedItemIds: result.answer.citedItemIds,
  })
  if (!message) return notFound(c)
  const [withCards] = await withSources(c, [message])
  return c.json(withCards)
})

threadRoutes.delete("/:id", async (c) => {
  const ref = threadRef(c)
  const deleted = ref && (await softDeleteThread(c.var.db, ref))
  return deleted ? c.body(null, 204) : notFound(c)
})
