# Drizzle ORM + pgvector + Postgres FTS on Cloudflare Workers via Hyperdrive

Researched 2026-09-27 against primary sources (Cloudflare Hyperdrive docs, orm.drizzle.team, drizzle-team GitHub source/issues, pgvector README, PostgreSQL 18 docs, Neon docs, Postgres.js README, npm registry). Discussion input, not decisions. Secondary sources are marked **[secondary]**.

## Version snapshot (npm registry, 2026-09-27)

| Package                           | `latest`                 | Notes                                                                                                                                                                                                                                                     |
| --------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `drizzle-orm`                     | **0.45.3** (2026-09-21)  | `rc` tag = `1.0.0-rc.4`, `beta` = `1.0.0-beta.22`. The Drizzle "get started" page currently tells you to install `drizzle-orm@rc` / `drizzle-kit@rc`. Everything below was checked against docs; API differences in the 1.0 RC are **not** verified here. |
| `drizzle-kit`                     | **0.31.11** (2026-09-21) | `rc` = `1.0.0-rc.4`                                                                                                                                                                                                                                       |
| `postgres` (Postgres.js)          | **3.4.9** (2026-04-05)   | Hyperdrive minimum `3.4.5` (see Q1)                                                                                                                                                                                                                       |
| `pg` (node-postgres)              | **8.23.0** (2026-08-08)  | Hyperdrive minimum `>8.16.3` (see Q1)                                                                                                                                                                                                                     |
| `@neondatabase/serverless`        | 1.1.0                    | **Not needed** with Hyperdrive (see Q6)                                                                                                                                                                                                                   |
| `hono`                            | 4.13.9                   |                                                                                                                                                                                                                                                           |
| `wrangler`                        | 4.141.0                  |                                                                                                                                                                                                                                                           |
| `@cloudflare/vitest-pool-workers` | 0.22.0                   |                                                                                                                                                                                                                                                           |
| `vitest`                          | 5.0.2                    |                                                                                                                                                                                                                                                           |
| `uuid`                            | 14.0.2                   | `v7()` available; ESM-only since `uuid@12`                                                                                                                                                                                                                |
| `@testcontainers/postgresql`      | 12.1.0                   |                                                                                                                                                                                                                                                           |
| `@electric-sql/pglite`            | 0.5.8                    |                                                                                                                                                                                                                                                           |

Source: `npm view <pkg> version|dist-tags` run 2026-09-27.

---

## Q1. Driver Cloudflare recommends with Hyperdrive on Workers

**Recommended driver: node-postgres (`pg`).** Postgres.js is fully supported and is what the Hyperdrive docs use for its "fast per-request client" guidance too.

> "Node-postgres (`pg`) is the recommended driver for connecting to your Postgres database from JavaScript or TypeScript Workers."
> — https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/

Minimum versions (two numbers appear in Cloudflare's own docs — flagging the inconsistency):

| Driver      | connect-to-postgres overview page | Driver-specific page                                                                                                                   |
| ----------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `pg`        | `8.13.0`                          | `pg@>8.16.3` (https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/node-postgres/) |
| Postgres.js | `3.4.4`                           | `3.4.5` (https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/postgres-js/)        |
| Drizzle     | `0.26.2`                          | —                                                                                                                                      |

Use the stricter numbers. Current `latest` of both drivers is far above either.

**`nodejs_compat`:** required for both drivers per the driver pages. The overview page says for compatibility dates `2026-08-04` or later, `nodejs_compat` and `nodejs_compat_v2` are enabled by default; still declare it explicitly.

Wrangler config quoted from the Postgres.js page:

```jsonc
{
  "compatibility_flags": ["nodejs_compat"],
  "compatibility_date": "2026-09-26",
  "hyperdrive": [{ "binding": "HYPERDRIVE", "id": "<id>" }],
}
```

**Exact Postgres.js connection pattern** (verbatim from https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/postgres-js/):

```ts
import postgres from "postgres"

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    // Create a database client that connects to your database via Hyperdrive.
    // Hyperdrive maintains the underlying database connection pool,
    // so creating a new client on each request is fast and recommended.
    const sql = postgres(env.HYPERDRIVE.connectionString, {
      // Limit the connections for the Worker request to 5 due to Workers' limits on concurrent external connections
      max: 5,
      // If you are not using array types in your Postgres schema, disable `fetch_types` to avoid an additional round-trip (unnecessary latency)
      fetch_types: false,
      // This is set to true by default, but certain query generators such as Kysely or queries using sql.unsafe() will set this to false. Hyperdrive will not cache prepared statements when this option is set to false and will require additional round-trips.
      prepare: true,
    })

    try {
      const result = await sql`select * from pg_tables`
      return Response.json({ success: true, result: result })
    } catch (e: any) {
      console.error("Database error:", e.message)
      return Response.error()
    }
  },
} satisfies ExportedHandler<Env>
```

**`ctx.waitUntil(sql.end())` — FLAG:** the _current_ Cloudflare docs (overview, Postgres.js page, pg page, Workers Postgres tutorial) do **not** contain `ctx.waitUntil(sql.end())` / `ctx.waitUntil(client.end())`. Earlier revisions of these pages did; it has since been removed from the examples. What the docs do say is that Hyperdrive owns the pool and per-request clients are cheap. Postgres.js documents `sql.end()` / `sql.end({ timeout })` as the graceful-close API (https://github.com/porsager/postgres README). Recommendation: keep `ctx.waitUntil(sql.end({ timeout: 5 }))` after the response is built — it is harmless, releases the Worker-side socket promptly, and does not block the response. Treat it as our convention, not a Cloudflare-documented requirement.

**Pooling semantics that affect schema/query design** (https://developers.cloudflare.com/hyperdrive/configuration/how-hyperdrive-works/):

- "The Hyperdrive connection pooler operates in transaction mode."
- `SET` is supported within a transaction or individual query; on return to the pool the connection is `RESET`, so session settings do not persist across queries. Relevant for `SET hnsw.ef_search` (Q4): use `SET LOCAL` inside the same transaction as the vector query, or accept the default.
- Named prepared statements are supported with `postgres.js` and `node-postgres`.
- Unsupported (https://developers.cloudflare.com/hyperdrive/reference/supported-databases-and-features/): SQL-level `PREPARE/DISCARD/DEALLOCATE/EXECUTE`, advisory locks, `LISTEN/NOTIFY`, per-session state beyond the documented `SET` exception.
- **Supported Postgres versions listed as `9.0` to `17.x`.** Postgres 18 is not listed as of today. Flag if the Neon project is created on PG18 (Q2, uuidv7).

**Neon-specific:** Hyperdrive's Neon page says to use the **direct (unpooled)** `psql` connection string ("uncheck the connection pooling checkbox") — https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/neon/.

**Local dev:** `localConnectionString` in the `hyperdrive` binding, or env var `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_<BINDING_NAME>` (env var wins). `wrangler dev` connects directly, no caching/pooling; `wrangler dev --remote` uses the real Hyperdrive config and hits production data. — https://developers.cloudflare.com/hyperdrive/configuration/local-development/

---

## Q2. Drizzle ORM schema features

### Drizzle instance for Postgres.js (per request in a Worker)

From https://orm.drizzle.team/docs/get-started-postgresql (Postgres.js tab):

```ts
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

const queryClient = postgres(process.env.DATABASE_URL)
const db = drizzle({ client: queryClient })
```

Cloudflare's Drizzle page (https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/drizzle-orm/) shows the per-request pattern with `pg` (`const db = drizzle(client)` after `client.connect()`), and notes both drivers are supported. Combined Worker pattern for Postgres.js (composition of the two documented snippets, not itself a quoted example):

```ts
const sql = postgres(env.HYPERDRIVE.connectionString, {
  max: 5,
  fetch_types: false,
  prepare: true,
})
const db = drizzle({ client: sql, schema })
// ... queries ...
ctx.waitUntil(sql.end({ timeout: 5 }))
```

`fetch_types: false` caveat from Postgres.js README: type fetching is what makes Postgres.js understand array types; the Cloudflare comment says disable it only "if you are not using array types". `vector` columns are serialised by Drizzle as a JSON-ish string (`JSON.stringify(value)` → `'[1,2,3]'`) and parsed back by string split (drizzle-orm `pg-core/columns/vector_extension/vector.ts`), so vectors do not depend on `fetch_types`. **Flag:** if the schema uses `text[]`/`jsonb[]` style arrays anywhere, verify behaviour with `fetch_types: false` before adopting it.

### `vector` column — first-class, yes

https://orm.drizzle.team/docs/extensions/pg (pgvector section):

```ts
vector({ dimensions: 3 })
halfvec({ dimensions: 3 })
sparsevec({ dimensions: 3 })
bit({ dimensions: 5 })
```

Source signature (`drizzle-orm/src/pg-core/columns/vector_extension/vector.ts`): `vector(name, config: { dimensions: number })`; `getSQLType()` returns `vector(${dimensions})`. `dimensions` is required.

Distance helpers exported from `drizzle-orm`: `l2Distance, l1Distance, innerProduct, cosineDistance, hammingDistance, jaccardDistance` (map to `<->`, `<+>`, `<#>`, `<=>`, `<~>`, `<%>`).

> "There is no specific code to create an extension inside the Drizzle schema. We assume that if you are using vector types, indexes, and queries, you have a PostgreSQL database with the pg_vector extension installed." — same page. See Q3 for the `CREATE EXTENSION` consequence.

### HNSW index with `vector_cosine_ops`

Verbatim from https://orm.drizzle.team/docs/guides/vector-similarity-search:

```ts
import { index, pgTable, serial, text, vector } from "drizzle-orm/pg-core"

export const guides = pgTable(
  "guides",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    url: text("url").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
  },
  (table) => [
    index("embeddingIndex").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops")
    ),
  ]
)
```

Query (same page):

```ts
const similarity = sql<number>`1 - (${cosineDistance(guides.embedding, embedding)})`

const similarGuides = await db
  .select({ name: guides.title, url: guides.url, similarity })
  .from(guides)
  .where(gt(similarity, 0.5))
  .orderBy((t) => desc(t.similarity))
  .limit(4)
```

**Two open drizzle-kit bugs to design around:**

1. **drizzle-kit `push` strips the operator class** on HNSW indexes → Postgres errors `no default operator class for access method "hnsw"`. Issue https://github.com/drizzle-team/drizzle-orm/issues/5792 (filed May 2026 against drizzle-orm 0.45.2; labelled `fixed-in-beta`, still open on the 0.x line). `generate` is reported unaffected; the failing path is `push`. Consequence: **do not use `push` for this schema**; use `generate` + `migrate`, and diff the generated SQL for `vector_cosine_ops` presence on first generate.
2. **`drizzle-kit generate` does not emit `CREATE EXTENSION IF NOT EXISTS vector`** — https://github.com/drizzle-team/drizzle-orm/issues/3929 (open since Jan 2025). See Q3.

Also note https://github.com/drizzle-team/drizzle-orm/issues/4398: the docs' `where(gt(similarity, 0.5))` + `orderBy(desc(similarity))` shape can prevent the HNSW index from being used, because pgvector only uses the index for `ORDER BY <distance> LIMIT n` (pgvector README). Prefer `orderBy(cosineDistance(col, vec)).limit(n)` and filter on similarity in the outer select / app code, then verify with `EXPLAIN`.

### `tsvector` column + generated column + GIN

There is **no built-in `tsvector` column** in `drizzle-orm/pg-core` (checked `drizzle-orm/src/pg-core/columns/index.ts` on `main`: exports are bigint … uuid, varchar, `postgis_extension/geometry`, `vector_extension/{bit,halfvec,sparsevec,vector}`, `custom` — no tsvector). Use `customType`. Drizzle's own generated-columns docs show exactly this (https://orm.drizzle.team/docs/generated-columns, PostgreSQL tab):

```ts
const tsVector = customType<{ data: string }>({
  dataType() {
    return "tsvector"
  },
})

export const test = pgTable(
  "test",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    content: text("content"),
    contentSearch: tsVector("content_search", {
      dimensions: 3, // <- present in the docs snippet; it is a copy-paste artefact and is ignored by this customType. Drop it.
    }).generatedAlwaysAs(
      (): SQL => sql`to_tsvector('english', ${test.content})`
    ),
  },
  (t) => [index("idx_content_search").using("gin", t.contentSearch)]
)
```

Generated-column constraints from that page: Postgres generated columns are **STORED only**; no defaults, no subqueries, cannot reference other generated columns, cannot be used directly in PK/FK/unique. Drizzle emits `GENERATED ALWAYS AS (<expr>) STORED`. For our `'simple'` config, replace `'english'` with `'simple'` (semantics in Q5). Weighted multi-column form (from https://orm.drizzle.team/docs/guides/postgresql-full-text-search):

```ts
sql`setweight(to_tsvector('simple', coalesce(${t.title}, '')), 'A') || setweight(to_tsvector('simple', coalesce(${t.body}, '')), 'B')`
```

Generated column vs trigger: generated column is declarative, versioned by drizzle-kit, and cannot drift; the trade-off is that the expression must be `IMMUTABLE` — the two-argument `to_tsvector(regconfig, text)` is immutable, the one-argument form is not, so always pass the config explicitly. Trigger-maintained columns would require `--custom` migrations; not needed here.

### `pgEnum`

https://orm.drizzle.team/docs/column-types/pg:

```ts
export const moodEnum = pgEnum("mood", ["sad", "ok", "happy"])
export const table = pgTable("table", { mood: moodEnum() })
```

### UUID primary keys / UUIDv7

- Drizzle: `uuid().defaultRandom()` → `DEFAULT gen_random_uuid()` (v4). No `uuidv7` helper in Drizzle. (https://orm.drizzle.team/docs/column-types/pg)
- **Postgres 18 has `uuidv7()` built in**: `uuidv7([shift interval]) → uuid`, "Generates a version 7 (time-ordered) UUID. The timestamp is computed using UNIX timestamp with millisecond precision + sub-millisecond timestamp + random." Also `uuidv4()`, `uuid_extract_timestamp()`, `uuid_extract_version()`. — https://www.postgresql.org/docs/18/functions-uuid.html (PG 18.6 docs)
- **Postgres 17 does not have `uuidv7()`.**
- Neon supports PG 14–18 (18.6 available as of Aug 2026) — https://neon.com/docs/postgresql/postgres-version-policy. **But Hyperdrive's supported-versions page lists `9.0` to `17.x`** (see Q1). PG18 on Neon behind Hyperdrive is undocumented territory; the wire protocol is unchanged so it likely works, but it is not a documented support statement.
- Docker image `pgvector/pgvector:pg18` (pgvector 0.8.6) exists, so local/CI could match PG18 if chosen.

Options:

1. **Pin PG17 everywhere, generate UUIDv7 in app code** with `uuid` (`import { v7 as uuidv7 } from 'uuid'`; needs only `crypto.getRandomValues`, available in Workers — https://github.com/uuidjs/uuid README) and declare the column as `uuid().primaryKey().$defaultFn(() => uuidv7())`. Documented-safe with Hyperdrive today. Downside: rows inserted by raw SQL/psql have no default.
2. **PG18 everywhere**, column `uuid().primaryKey().default(sql\`uuidv7()\`)`. Cleaner, but rides on Hyperdrive's undocumented PG18 support.

Recommendation: option 1 now; the column definition is a one-line change to option 2 later. Decision needed.

### Timestamps in UTC

Drizzle `timestamp({ withTimezone: true, mode: 'string' | 'date', precision })` → `timestamp(p) with time zone`. Docs: `mode: 'string'` "does not perform any mappings" (raw driver string through), `mode: 'date'` maps to/from JS `Date`. (https://orm.drizzle.team/docs/column-types/pg) Use `withTimezone: true` always; `timestamptz` stores an instant, the "UTC" part is a presentation concern of the session `TimeZone`, which is reset per query under Hyperdrive anyway. `mode: 'date'` is the least surprising for app code; `'string'` avoids Date precision loss and timezone parsing if we pass ISO strings straight to the client. Pick one repo-wide.

---

## Q3. drizzle-kit

`drizzle.config.ts` (https://orm.drizzle.team/docs/drizzle-config-file):

```ts
import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: "postgres://user:password@host:port/db" },
})
```

Cloudflare's Drizzle page adds: keep a **direct** `DATABASE_URL` in `.env` for drizzle-kit (never the Hyperdrive string — that only resolves inside a Worker), then `npx drizzle-kit generate` + `npx drizzle-kit migrate`.

Other options (from `drizzle-kit/src/index.ts` on `main`): `migrations?: { table?: string; schema?: string; prefix?: Prefix }` (defaults `__drizzle_migrations` in schema `drizzle`), `casing?: 'camelCase' | 'snake_case'`, `schemaFilter`, `tablesFilter`, `entities.roles`, and:

```ts
extensionsFilters?: 'postgis'[];
```

**`extensionsFilters` is typed as `'postgis'[]` only.** It exists to make drizzle-kit ignore tables that PostGIS creates (`spatial_ref_sys`); it does not create extensions and has no `vector` value. pgvector creates no tables, so nothing to filter.

**`generate` vs `push`** (https://orm.drizzle.team/docs/migrations): `generate` diffs schema against the last snapshot and writes `<timestamp>_<name>.sql` + `meta/_journal.json` + snapshot; `migrate` applies unapplied files and records them; `push` diffs against the live DB and applies DDL with no files. Given issue #5792, this project should use `generate` + `migrate` only.

**Custom SQL migrations:** `npx drizzle-kit generate --custom --name=enable_pgvector` creates an empty migration (https://orm.drizzle.team/docs/drizzle-kit-generate). Put `CREATE EXTENSION IF NOT EXISTS vector;` in it as migration `0000` _before_ the first schema migration, because drizzle-kit will not emit it (issue #3929). Neon also enables via `CREATE EXTENSION IF NOT EXISTS vector;` (https://neon.com/docs/extensions/pgvector). Note: on Neon, `CREATE EXTENSION` runs as the project role which has the needed privilege; in the Docker image the default superuser does.

**Programmatic migrations** (for CI/test setup). `migrate` is exported per driver; the Postgres.js one is `drizzle-orm/postgres-js/migrator` (`drizzle-orm/src/postgres-js/migrator.ts`: `migrate<TSchema>(db: PostgresJsDatabase<TSchema>, config: MigrationConfig)`), with

```ts
export interface MigrationConfig {
  migrationsFolder: string
  migrationsTable?: string
  migrationsSchema?: string
}
```

(`drizzle-orm/src/migrator.ts`). It reads `meta/_journal.json`, splits each file on `--> statement-breakpoint`, hashes it and records it. Documented example (docs show the node-postgres flavour; the Postgres.js import path is the same shape):

```ts
import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"

const db = drizzle(process.env.DATABASE_URL!)
await migrate(db, { migrationsFolder: "./drizzle" })
```

For `migrate()` use a plain Postgres.js client with default `max` (not the Hyperdrive string). Do **not** run migrations from inside the Worker.

---

## Q4. pgvector facts (README, https://github.com/pgvector/pgvector — current release 0.8.6)

- `vector` type: up to **16,000** dimensions stored (`4 * dims + 8` bytes). **HNSW/IVFFlat index limit: 2,000 dims for `vector`, 4,000 for `halfvec`.** Neon repeats the 2,000/4,000 limits (https://neon.com/docs/extensions/pgvector). Embeddings ≤ 2,000 dims (e.g. 768/1024/1536) index fine; 3,072-dim models need `halfvec` or a lower-dim model.
- Operators: `<->` L2, `<#>` negative inner product, `<=>` cosine distance, `<+>` L1, `<~>` Hamming, `<%>` Jaccard.
- Cosine similarity: `1 - (embedding <=> '[3,1,2]')`.
- Index is only used for `ORDER BY <distance> LIMIT n` queries (README, "Querying"/"Indexing" sections).
- HNSW: `CREATE INDEX ON items USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);` — defaults **m = 16, ef_construction = 64**.
- Query-time: `SET hnsw.ef_search = 40;` (default **40**, higher = better recall/slower). Under Hyperdrive use `SET LOCAL` in a transaction (Q1). `SET hnsw.iterative_scan = strict_order;` for filtered queries with low recall (0.8+).
- Build: raise `maintenance_work_mem` so the graph fits in memory.
- Docker: `docker pull pgvector/pgvector:pg17`. Verified tags on Docker Hub: `pg17`, `0.8.6-pg17`, `pg17-bookworm`, `pg17-trixie`, and `pg18` / `0.8.6-pg18` equivalents, all pgvector **0.8.6**, amd64+arm64. Pin `pgvector/pgvector:0.8.6-pg17` for reproducible CI. Neon's pgvector version is not stated on the extension page; check https://neon.com/docs/extensions/pg-extensions when creating the project and keep local ≤ Neon.

---

## Q5. Postgres full-text search + hybrid RRF

From https://www.postgresql.org/docs/current/textsearch-controls.html and .../textsearch-dictionaries.html:

- `to_tsvector([config regconfig,] document text)` tokenises, normalises to lexemes with positions. The `simple` dictionary "operates by converting the input token to lower case and checking it against a file of stop words … the lower-cased form of the word is returned as the normalized lexeme" — **no stemming, language-agnostic**. Good default for mixed-language personal notes; weaker recall on English inflections (`rats` will not match `rat`).
- `websearch_to_tsquery([config,] querytext)`: "never raises syntax errors" so is safe for raw user input; unquoted words → `&`, `"quoted"` → `<->` phrase, `or` → `|`, `-word` → `!`. Examples: `'"supernovae stars" -crab'` → `'supernova' <-> 'star' & !'crab'`. Always pass the same config as the tsvector (`'simple'`).
- `ts_rank([weights,] vector, query [, normalization])` ranks by lexeme frequency; `ts_rank_cd(...)` is cover-density (proximity) and needs positions (so do not `strip()` the tsvector). Normalization bitmask: `0` none (default), `1` divide by `1+log(len)`, `2` divide by length, `4` mean harmonic distance (cd only), `8` unique words, `16` `1+log(unique)`, `32` `rank/(rank+1)` → 0..1. Default weights `{0.1, 0.2, 0.4, 1.0}` for D,C,B,A.
- `setweight(to_tsvector(...), 'A') || setweight(..., 'B')` to combine columns.

Drizzle's FTS guide (https://orm.drizzle.team/docs/guides/postgresql-full-text-search) shows `.where(sql\`${t.search} @@ websearch_to_tsquery('simple', ${q})\`)`style and`rank: sql\`ts_rank_cd(${t.search}, websearch_to_tsquery('simple', ${q}))\``.

**Hybrid search with RRF in one query — [secondary] Supabase docs, https://supabase.com/docs/guides/ai/hybrid-search** (the SQL is plain Postgres; only the `extensions.` schema prefix is Supabase-specific). Schema:

```sql
create table documents (
  id bigint primary key generated always as identity,
  content text,
  fts tsvector generated always as (to_tsvector('english', content)) stored,
  embedding extensions.vector(512)
);
create index on documents using gin(fts);
create index on documents using hnsw (embedding vector_ip_ops);
```

Query core:

```sql
with full_text as (
  select id,
    row_number() over (order by ts_rank_cd(fts, websearch_to_tsquery(query_text)) desc) as rank_ix
  from documents
  where fts @@ websearch_to_tsquery(query_text)
  order by rank_ix
  limit least(match_count, 30) * 2
),
semantic as (
  select id,
    row_number() over (order by embedding <#> query_embedding) as rank_ix
  from documents
  order by rank_ix
  limit least(match_count, 30) * 2
)
select documents.*
from full_text
full outer join semantic on full_text.id = semantic.id
join documents on coalesce(full_text.id, semantic.id) = documents.id
order by
  coalesce(1.0 / (rrf_k + full_text.rank_ix), 0.0) * full_text_weight +
  coalesce(1.0 / (rrf_k + semantic.rank_ix), 0.0) * semantic_weight
  desc
limit least(match_count, 30);
```

with `rrf_k int = 50` and weights `= 1`. For us: swap `<#>` → `<=>` (cosine) with `vector_cosine_ops`, `'english'` → `'simple'`, and pass `'simple'` to `websearch_to_tsquery`. Drizzle can express this with `db.$with('full_text').as(...)` CTEs or a single `db.execute(sql\`...\`)`; no Drizzle-official hybrid example exists. Keep the `ORDER BY distance LIMIT`shape in the`semantic` CTE so the HNSW index is used.

---

## Q6. Testing and the Neon serverless driver

**Neon serverless driver is not needed and does not work through Hyperdrive.** Cloudflare: "you should use a driver like node-postgres or Postgres.js to connect directly to the underlying database instead of the Neon serverless driver. Hyperdrive is optimized for database access for Workers and will perform global connection pooling." (https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/neon/). Neon: "No, this isn't possible. You should use Hyperdrive directly with standard Postgres drivers, like `node-postgres` or `Postgres.js`" — the serverless driver uses WebSockets/HTTP, Hyperdrive needs TCP (https://neon.com/blog/hyperdrive-neon-faq). Confirmed. Do not add `@neondatabase/serverless`.

**Vitest `globalSetup` + Docker Postgres + Drizzle migrations** (https://vitest.dev/config/globalsetup):

- `globalSetup` runs "in a different global scope before test workers are even created, so your tests don't have access to global variables defined here." Export `setup`/`teardown` or a default `setup(project)` returning a teardown fn.
- Pass values with `project.provide('dbUrl', url)` in globalSetup and `inject('dbUrl')` in tests; augment `ProvidedContext` via `declare module 'vitest'`.

Composite pattern (community-standard; the Vitest and Drizzle pieces are each documented above, the combination is ours):

```ts
// vitest.global-setup.ts
import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"
import type { TestProject } from "vitest/node"

export default async function setup(project: TestProject) {
  const url = process.env.DATABASE_URL! // docker compose: pgvector/pgvector:0.8.6-pg17
  const sql = postgres(url, { max: 1 })
  await migrate(drizzle(sql), { migrationsFolder: "packages/db/drizzle" })
  await sql.end()
  project.provide("dbUrl", url)
}
declare module "vitest" {
  export interface ProvidedContext {
    dbUrl: string
  }
}
```

Alternatives seen in the wild: `@testcontainers/postgresql` (`PostgreSqlContainer('pgvector/pgvector:pg17')`) started in globalSetup — avoids needing a compose service in CI but adds Docker-in-Docker concerns; and PGlite in-memory with `pushSchema` from the undocumented `drizzle-kit/api` (https://github.com/drizzle-team/drizzle-orm/issues/4205) — **not viable here** because PGlite would need the pgvector extension and the FTS/HNSW behaviour we are testing, and `pushSchema` is the same code path as the buggy `push` (#5792). Stick with real Postgres + `migrate()`.

Worker-level tests with `@cloudflare/vitest-pool-workers` can point the Hyperdrive binding at the same Docker DB through `localConnectionString` / `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` (Q1 local-dev section). Per-test isolation: wrap each test in a transaction and roll back, or truncate; Hyperdrive is not in the path locally so session state persists normally.

---

## Open items / uncertainties

1. `ctx.waitUntil(sql.end())` is no longer in Cloudflare's examples — keep it as our convention, not a cited requirement.
2. Hyperdrive documents PG `9.0–17.x`; PG18 (for built-in `uuidv7()`) is undocumented there. Decision: PG17 + app-side UUIDv7 (recommended) vs PG18.
3. drizzle-kit `push` breaks HNSW op classes (#5792) — `generate`/`migrate` only; verify `vector_cosine_ops` in the first generated SQL.
4. `CREATE EXTENSION vector` must be a `--custom` migration (#3929); `extensionsFilters` is `'postgis'`-only and unrelated.
5. Drizzle 1.0 RC is the channel the get-started docs push; this doc validated the 0.45.x/0.31.x `latest` APIs only.
6. `fetch_types: false` is safe for `vector` columns; re-check if any Postgres array columns are added.
7. Neon's installed pgvector version was not stated on the extension page — check at project creation and keep the Docker tag ≤ Neon's.
