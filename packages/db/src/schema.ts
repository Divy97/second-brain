import { sql, type SQL } from "drizzle-orm"
import {
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core"
import { v7 as uuidv7 } from "uuid"

export const EMBEDDING_DIMENSIONS = 1024

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector"
  },
})

const id = () =>
  uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7())

const timestampTz = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" })

const createdAt = () => timestampTz("created_at").notNull().defaultNow()

const updatedAt = () =>
  timestampTz("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date())

// Postgres arrays need postgres.js type fetching, which is disabled for Hyperdrive;
// string lists are stored as jsonb instead.
const stringList = (name: string) =>
  jsonb(name).$type<string[]>().notNull().default([])

export const itemTypeEnum = pgEnum("item_type", [
  "text",
  "voice",
  "image",
  "pdf",
  "url",
])

export const itemKindEnum = pgEnum("item_kind", [
  "quote",
  "fact",
  "thought",
  "meeting",
  "link",
  "video",
  "article",
  "image",
  "pdf",
  "other",
])

export const itemStatusEnum = pgEnum("item_status", [
  "pending",
  "processing",
  "ready",
  "failed",
])

export const keyProviderEnum = pgEnum("key_provider", [
  "openrouter",
  "transcript",
  "reader",
])

export const messageRoleEnum = pgEnum("message_role", ["user", "assistant"])

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const userKeys = pgTable(
  "user_keys",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: keyProviderEnum("provider").notNull(),
    encryptedKey: text("encrypted_key").notNull(),
    last4: text("last4").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.provider] })]
)

export const items = pgTable(
  "items",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: itemTypeEnum("type").notNull(),
    kind: itemKindEnum("kind"),
    status: itemStatusEnum("status").notNull().default("pending"),
    failureReason: text("failure_reason"),
    error: text("error"),
    contentHash: text("content_hash").notNull(),
    rawText: text("raw_text").notNull(),
    cleanText: text("clean_text"),
    title: text("title"),
    summary: text("summary"),
    language: text("language"),
    tags: stringList("tags"),
    capturedAt: timestampTz("captured_at").notNull().defaultNow(),
    deletedAt: timestampTz("deleted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("items_user_content_hash_idx").on(t.userId, t.contentHash),
    index("items_user_captured_at_idx").on(t.userId, t.capturedAt),
    index("items_user_kind_idx").on(t.userId, t.kind),
    index("items_user_status_idx").on(t.userId, t.status),
  ]
)

export const itemCaptures = pgTable(
  "item_captures",
  {
    id: id(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    capturedAt: timestampTz("captured_at").notNull().defaultNow(),
  },
  (t) => [index("item_captures_item_id_idx").on(t.itemId)]
)

// search_text is denormalised by the pipeline (chunk text + title + entities + tags):
// a generated column cannot read other tables.
export const chunks = pgTable(
  "chunks",
  {
    id: id(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    text: text("text").notNull(),
    searchText: text("search_text").notNull(),
    embedding: vector("embedding", {
      dimensions: EMBEDDING_DIMENSIONS,
    }).notNull(),
    embeddingModel: text("embedding_model").notNull(),
    embeddingDimensions: integer("embedding_dimensions").notNull(),
    tsv: tsvector("tsv").generatedAlwaysAs(
      (): SQL => sql`to_tsvector('simple', ${chunks.searchText})`
    ),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("chunks_item_idx_idx").on(t.itemId, t.idx),
    index("chunks_embedding_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops")
    ),
    index("chunks_tsv_idx").using("gin", t.tsv),
  ]
)

export const entities = pgTable(
  "entities",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    type: text("type").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("entities_user_normalized_name_type_idx").on(
      t.userId,
      t.normalizedName,
      t.type
    ),
  ]
)

export const itemEntities = pgTable(
  "item_entities",
  {
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.itemId, t.entityId] }),
    index("item_entities_entity_id_idx").on(t.entityId),
  ]
)

export const threads = pgTable(
  "threads",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    createdAt: createdAt(),
    deletedAt: timestampTz("deleted_at"),
  },
  (t) => [index("threads_user_created_at_idx").on(t.userId, t.createdAt)]
)

export const messages = pgTable(
  "messages",
  {
    id: id(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    role: messageRoleEnum("role").notNull(),
    text: text("text").notNull(),
    citedItemIds: stringList("cited_item_ids"),
    createdAt: createdAt(),
  },
  (t) => [index("messages_thread_created_at_idx").on(t.threadId, t.createdAt)]
)
