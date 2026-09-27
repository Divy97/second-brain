import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm"

import { items, messages, threads } from "../schema.js"

import type { Database } from "../database.js"
import type { ItemKind } from "./item-types.js"

export interface ThreadRef {
  userId: string
  threadId: string
}

export interface ThreadSummary {
  id: string
  title: string
  createdAt: Date
}

export interface ThreadMessage {
  id: string
  role: "user" | "assistant"
  text: string
  citedItemIds: string[]
  createdAt: Date
}

export interface SourceCard {
  id: string
  title: string | null
  kind: ItemKind | null
  capturedAt: Date
}

const ownedThread = (ref: ThreadRef) =>
  and(
    eq(threads.id, ref.threadId),
    eq(threads.userId, ref.userId),
    isNull(threads.deletedAt)
  )

export async function createThread(
  db: Database,
  userId: string
): Promise<ThreadSummary> {
  const [thread] = await db
    .insert(threads)
    .values({ userId, title: "" })
    .returning({
      id: threads.id,
      title: threads.title,
      createdAt: threads.createdAt,
    })
  if (!thread) throw new Error("thread insert returned no row")
  return thread
}

// A thread without a question yet has an empty title and stays out of the list.
export function listThreads(
  db: Database,
  userId: string
): Promise<ThreadSummary[]> {
  return db
    .select({
      id: threads.id,
      title: threads.title,
      createdAt: threads.createdAt,
    })
    .from(threads)
    .where(
      and(
        eq(threads.userId, userId),
        isNull(threads.deletedAt),
        ne(threads.title, "")
      )
    )
    .orderBy(desc(threads.createdAt), desc(threads.id))
}

export async function findThread(
  db: Database,
  ref: ThreadRef
): Promise<(ThreadSummary & { messages: ThreadMessage[] }) | undefined> {
  const [thread] = await db
    .select({
      id: threads.id,
      title: threads.title,
      createdAt: threads.createdAt,
    })
    .from(threads)
    .where(ownedThread(ref))
  if (!thread) return undefined
  const rows = await db
    .select({
      id: messages.id,
      role: messages.role,
      text: messages.text,
      citedItemIds: messages.citedItemIds,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.threadId, ref.threadId))
    .orderBy(asc(messages.createdAt), asc(messages.id))
  return { ...thread, messages: rows }
}

export async function threadExists(
  db: Database,
  ref: ThreadRef
): Promise<boolean> {
  const [row] = await db
    .select({ id: threads.id })
    .from(threads)
    .where(ownedThread(ref))
  return Boolean(row)
}

// The question and its answer land together; the first question becomes the title.
export async function appendExchange(
  db: Database,
  ref: ThreadRef,
  exchange: { question: string; answer: string; citedItemIds: string[] }
): Promise<ThreadMessage | undefined> {
  return db.transaction(async (tx) => {
    const [thread] = await tx
      .select({ title: threads.title })
      .from(threads)
      .where(ownedThread(ref))
      .for("update")
    if (!thread) return undefined
    if (thread.title === "") {
      await tx
        .update(threads)
        .set({ title: exchange.question })
        .where(eq(threads.id, ref.threadId))
    }
    const [, answer] = await tx
      .insert(messages)
      .values([
        { threadId: ref.threadId, role: "user", text: exchange.question },
        {
          threadId: ref.threadId,
          role: "assistant",
          text: exchange.answer,
          citedItemIds: exchange.citedItemIds,
        },
      ])
      .returning({
        id: messages.id,
        role: messages.role,
        text: messages.text,
        citedItemIds: messages.citedItemIds,
        createdAt: messages.createdAt,
      })
    return answer
  })
}

export async function listSourceCards(
  db: Database,
  input: { userId: string; itemIds: string[] }
): Promise<SourceCard[]> {
  if (input.itemIds.length === 0) return []
  return db
    .select({
      id: items.id,
      title: items.title,
      kind: items.kind,
      capturedAt: items.capturedAt,
    })
    .from(items)
    .where(
      and(
        eq(items.userId, input.userId),
        isNull(items.deletedAt),
        inArray(items.id, input.itemIds)
      )
    )
}

export async function softDeleteThread(
  db: Database,
  ref: ThreadRef
): Promise<boolean> {
  const deleted = await db
    .update(threads)
    .set({ deletedAt: new Date() })
    .where(ownedThread(ref))
    .returning({ id: threads.id })
  return deleted.length > 0
}

export async function listRecentMessages(
  db: Database,
  input: { threadId: string; limit: number }
): Promise<ThreadMessage[]> {
  const rows = await db
    .select({
      id: messages.id,
      role: messages.role,
      text: messages.text,
      citedItemIds: messages.citedItemIds,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.threadId, input.threadId))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(input.limit)
  return rows.reverse()
}

export async function listLiveItemIds(
  db: Database,
  input: { userId: string; itemIds: string[] }
): Promise<Set<string>> {
  if (input.itemIds.length === 0) return new Set()
  const rows = await db
    .select({ id: items.id })
    .from(items)
    .where(
      and(
        eq(items.userId, input.userId),
        isNull(items.deletedAt),
        inArray(items.id, input.itemIds)
      )
    )
  return new Set(rows.map((row) => row.id))
}
