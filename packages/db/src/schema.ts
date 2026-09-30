import { sql, type SQL } from "drizzle-orm"
import {
  boolean,
  customType,
  date,
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

export const generateId = (): string => uuidv7()

const id = () => uuid("id").primaryKey().$defaultFn(generateId)

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

export const captureQualityEnum = pgEnum("capture_quality", ["full", "partial"])

export const keyProviderEnum = pgEnum("key_provider", ["openrouter"])

export const paidServiceEnum = pgEnum("paid_service", ["transcript", "reader"])

export const partialReasonEnum = pgEnum("partial_reason", ["allowance_used"])

export const messageRoleEnum = pgEnum("message_role", ["user", "assistant"])

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name"),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

// Better Auth reads these by property name; they must match its core schema field names.
export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestampTz("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)]
)

export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestampTz("access_token_expires_at"),
    refreshTokenExpiresAt: timestampTz("refresh_token_expires_at"),
    scope: text("scope"),
    idToken: text("id_token"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("accounts_user_id_idx").on(t.userId),
    uniqueIndex("accounts_provider_account_idx").on(t.providerId, t.accountId),
  ]
)

export const verifications = pgTable(
  "verifications",
  {
    id: id(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestampTz("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)]
)

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

export const paidLookupUsage = pgTable(
  "paid_lookup_usage",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    service: paidServiceEnum("service").notNull(),
    count: integer("count").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day, t.service] })]
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
    captureQuality: captureQualityEnum("capture_quality"),
    partialReason: partialReasonEnum("partial_reason"),
    failureReason: text("failure_reason"),
    error: text("error"),
    contentHash: text("content_hash").notNull(),
    fileKey: text("file_key"),
    fileName: text("file_name"),
    mimeType: text("mime_type"),
    fileSize: integer("file_size"),
    sourceUrl: text("source_url"),
    sourceNote: text("source_note"),
    pipelineRun: integer("pipeline_run").notNull().default(0),
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
    uniqueIndex("items_user_content_hash_idx")
      .on(t.userId, t.contentHash)
      .where(sql`${t.deletedAt} is null`),
    index("items_user_captured_at_idx")
      .on(t.userId, t.capturedAt.desc(), t.id.desc())
      .where(sql`${t.deletedAt} is null`),
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

export const fileDeletions = pgTable("file_deletions", {
  id: id(),
  fileKey: text("file_key").notNull().unique(),
  createdAt: createdAt(),
})

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

export const facts = pgTable(
  "facts",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    searchText: text("search_text").notNull(),
    embedding: vector("embedding", {
      dimensions: EMBEDDING_DIMENSIONS,
    }).notNull(),
    embeddingModel: text("embedding_model").notNull(),
    embeddingDimensions: integer("embedding_dimensions").notNull(),
    tsv: tsvector("tsv").generatedAlwaysAs(
      (): SQL => sql`to_tsvector('simple', ${facts.searchText})`
    ),
    sourceItemId: uuid("source_item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    validFrom: timestampTz("valid_from").notNull().defaultNow(),
    validTo: timestampTz("valid_to"),
    createdAt: createdAt(),
  },
  (t) => [
    index("facts_user_valid_idx").on(t.userId, t.validTo),
    index("facts_source_item_idx").on(t.sourceItemId),
    index("facts_embedding_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops")
    ),
    index("facts_tsv_idx").using("gin", t.tsv),
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
