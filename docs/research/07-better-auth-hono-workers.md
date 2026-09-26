# Better Auth on Hono + Cloudflare Workers (Hyperdrive, Drizzle, cross-origin Next.js client), plus Web Crypto AES-GCM

Research date: 2026-09-27. Sources: better-auth docs as MDX in `better-auth/better-auth` (`docs/content/docs/**`, commit `d1f7853`, 2026-09-26), better-auth source on GitHub (same commit) and the published `better-auth@1.7.6` tarball, `npm view`, hono.dev plus the `hono@4.13.9` tarball, developers.cloudflare.com, the `cloudflare/workerd` source, MDN, RFC 6265 and NIST SP 800-38D. Doc pages are cited by their better-auth.com URL. The MDX was read from the repo because it is identical and greppable. Two GitHub issues are cited as field reports; they are flagged as such.

Context: `apps/api` is a Hono 4.13 Worker (`nodejs_compat`, `compatibility_date` 2026-09-08) using Drizzle 0.45 and postgres.js over Hyperdrive, with a client built per request by `connect()` in `packages/db/src/index.ts`. `apps/web` is Next.js 16 on `http://localhost:3000`, and the API is on `http://localhost:8787`. `users.id` is a Postgres `uuid` filled with UUIDv7 in app code. Tests run in workerd through `@cloudflare/vitest-plugin`.

## TL;DR / decisions that matter

1. **Versions.** `better-auth@1.7.6` is `latest` (published 2026-09-24). It needs no Worker-relevant peer; every peer is optional, including `drizzle-orm ^0.45.2 || >=1.0.0-rc.1 <2.0.0`, which our 0.45 satisfies. The Drizzle adapter is now its own package, `@better-auth/drizzle-adapter@1.7.6`, and the docs import from it. `better-auth/adapters/drizzle` still exists but is only `export * from "@better-auth/drizzle-adapter"`. **The CLI moved.** `@better-auth/cli` is deprecated on npm ("Package no longer supported"; latest 1.4.21). The new CLI is the `auth` package (`npx auth@latest generate`) and needs Node ≥ 22.12.
2. **Password hashing does not fit the 10 ms CPU budget of the Workers Free plan.** Default is scrypt `N=16384, r=16, p=1, dkLen=64`. In workerd, Wrangler resolves the `workerd` export condition, which selects native `node:crypto` `scrypt`, not the pure-JS `@noble/hashes` fallback. workerd's async `scrypt` computes synchronously inside the request (source below), so all of it counts as CPU time. The same parameters take **~40 ms** in Node 25 on an Apple M4 (local measurement). **Decision: Workers Paid (30 s default CPU), keeping default scrypt.** PBKDF2 through Web Crypto is not a good alternative: workerd hard-caps PBKDF2 at **100,000 iterations**, and its own source calls that "WAY below the recommended minimum". Only use a custom `emailAndPassword.password.{hash,verify}` if Free is non-negotiable (see 1.3).
3. **Instantiate per request.** Better Auth's Workers examples build `auth` at module scope from `import { env } from "cloudflare:workers"`. That conflicts with Hyperdrive guidance to create the postgres.js client per request, and Workers forbid I/O outside a request context. Build `db` and then `betterAuth({...})` inside a Hono middleware, put it on `c`, and close the client with `executionCtx.waitUntil`. This also avoids open issue [#10315](https://github.com/better-auth/better-auth/issues/10315), where a per-isolate cached auth instance hangs forever after an aborted first request.
4. **`NODE_ENV` is not what you think on Workers.** Better Auth reads `NODE_ENV` through a Proxy over `globalThis.process.env` (`env.NODE_ENV`), not as the literal `process.env.NODE_ENV` that Wrangler replaces at build time. So `isProduction` is false in deployed Workers unless `NODE_ENV` is a real var. That silently changes three defaults: **rate limiting stays off**, the **default secret does not throw**, and **cookie `Secure` falls back to the `baseURL` scheme**. **Decision: always pass `secret`, `baseURL` and `rateLimit.enabled` explicitly from `env`.**
5. **IDs: set `advanced.database.generateId: () => uuidv7()`.** The default is a 32-char base62 string, which a Postgres `uuid` column rejects. `"uuid"` mode on pg leaves generation to the DB (`gen_random_uuid()`, v4). Its validation regex also only accepts UUID versions 1–5, so v7 is rejected on its `forceAllowId` path. `uuid` columns are fine: the Drizzle schema check compares only column names, nullability and defaults, not types.
6. **Schema: map to plural tables with `drizzleAdapter(db, { provider: "pg", schema, usePlural: true })`.** Add `emailVerified boolean not null default false` and `image text` to `users`. Add new `sessions`, `accounts` and `verifications` tables (columns in §3.3). Schema keys and Drizzle _property_ names must be the Better Auth field names (`emailVerified`, `userId`, …); SQL column names can be snake_case. Write the schema by hand. The CLI only emits `uuid` ids in `"uuid"` mode and emits `timestamp` without time zone.
7. **Cookies across `localhost:3000` → `localhost:8787` work with defaults.** Ports are ignored for "site" (MDN, RFC 6265 §8.5), so it is same-site. The defaults are `SameSite=Lax; HttpOnly; Path=/`. `Secure` and the `__Secure-` prefix only apply when `baseURL` starts with `https://`. The session lasts 7 days and slides forward once a day of use, so "stay signed in" works out of the box. For production, put web and API under one registrable domain or proxy the API. The docs warn Safari ITP drops cross-domain auth cookies.
8. **CORS.** Register `hono/cors` before the auth route with `origin: <web origin>` and `credentials: true`, and add the same origin to `trustedOrigins`. Hono reflects `Access-Control-Request-Headers` when `allowHeaders` is empty, so `Content-Type: application/json` preflights pass. The client sends `credentials: "include"` by default.
9. **Encrypting user API keys: use native Web Crypto AES-256-GCM** with a dedicated 32-byte secret, a fresh 12-byte random IV per encryption and the default 128-bit tag. Store `base64(iv ‖ ciphertext+tag)`. Better Auth's `symmetricEncrypt` (`better-auth/crypto`) is XChaCha20-Poly1305 in pure JS (`@noble/ciphers`), keyed by SHA-256 of the auth secret. It works, but it couples API-key encryption to the auth secret.

---

## 1. Versions, Workers guidance, password hashing

### 1.1 npm (2026-09-27)

| Package                        | Latest                  | Notes                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `better-auth`                  | 1.7.6 (2026-09-24)      | deps: `@better-auth/core`, `@better-auth/drizzle-adapter` (+ kysely/prisma/mongo/memory adapters), `better-call@1.4.0`, `@noble/hashes ^2.2.0`, `@noble/ciphers ^2.2.0`, `jose ^6.2.3`, `zod ^4.5.4`, `kysely`. **All peers optional**: `drizzle-orm ^0.45.2 \|\| >=1.0.0-rc.1 <2.0.0`, `drizzle-kit >=0.31.4`, `react ^18 \|\| ^19`, `next ^14 \|\| ^15 \|\| ^16`, `pg ^8`, … |
| `@better-auth/drizzle-adapter` | 1.7.6                   | peers: `drizzle-orm ^0.45.2 \|\| >=1.0.0-rc.1 <2.0.0`, `@better-auth/core ^1.7.6`, `@better-auth/utils 0.4.2`                                                                                                                                                                                                                                                                  |
| `auth` (the CLI)               | 1.7.6                   | `bin: { auth, better-auth }`, homepage `better-auth.com/docs/concepts/cli`                                                                                                                                                                                                                                                                                                     |
| `@better-auth/cli`             | 1.4.21 (**deprecated**) | npm `deprecated: "Package no longer supported…"`                                                                                                                                                                                                                                                                                                                               |
| `hono`                         | 4.13.9                  | –                                                                                                                                                                                                                                                                                                                                                                              |

Source: `npm view <pkg> version peerDependencies peerDependenciesMeta dependencies deprecated time`.

Install for us: `bun add better-auth @better-auth/drizzle-adapter --filter api` and `bun add better-auth --filter web`. The FAQ says to put them in `dependencies`, not `devDependencies`, and to keep a single `@better-auth/core`/`better-call` version to avoid the "dual module hazard" error `No request state found…` ([FAQ](https://www.better-auth.com/docs/reference/faq)).

### 1.2 Workers-specific guidance in the docs

- **`nodejs_compat` (or `nodejs_als`) is required** because "Better Auth uses `AsyncLocalStorage`" ([Hono integration](https://www.better-auth.com/docs/integrations/hono), [Installation](https://www.better-auth.com/docs/installation)). We already have `nodejs_compat`.
- **Background tasks.** `advanced.backgroundTasks: { handler: waitUntil }` with `import { waitUntil } from "cloudflare:workers"` defers cleanup, rate-limit updates and emails until after the response. The docs warn it "introduces eventual consistency" ([Options → backgroundTasks](https://www.better-auth.com/docs/reference/options#backgroundtasks)). This is optional and we don't need it for v1.
- **Programmatic migrations (`getMigrations`)** only work with the built-in Kysely adapter, "not … Drizzle" ([Database](https://www.better-auth.com/docs/concepts/database#programmatic-migrations)). Irrelevant for us, since we use drizzle-kit migrations.
- **Known issues, field reports:**
  - [#8860](https://github.com/better-auth/better-auth/issues/8860) (closed 2026-04-01, v1.4.18): "email/password sign-up exceeds CPU time limit on Cloudflare Workers". The pure-JS scrypt path was "right on the edge", and the fix was native `node:crypto` via `@better-auth/utils` (PR #8685). 1.7.6 ships that fix (see 1.3).
  - [#10315](https://github.com/better-auth/better-auth/issues/10315) (**open**, 2026-07-05): "Lazily-cached init promises hang forever on Cloudflare Workers when the initializing request is aborted". The reporter cached the instance per isolate (`cachedAuth ??= betterAuth(...)`). Per-request instantiation avoids the cached `auth.$context`. The module-level `import("node:async_hooks")` promise in `@better-auth/core/src/async_hooks/index.ts` is still module scope.

### 1.3 Password hashing: algorithm, implementation, CPU

**Docs:** "Better Auth uses `scrypt` to hash passwords … We decided to use `scrypt` because it's natively supported by Node.js." A custom hasher goes in `emailAndPassword.password: { hash, verify }`. Passwords are stored in the `account` table with `providerId` `credential` ([Email & Password → Configuration](https://www.better-auth.com/docs/authentication/email-password#configuration)).

**Source (`better-auth@1.7.6/dist/crypto/password.mjs`)** re-exports `@better-auth/utils/password`:

```js
/**
 * `@better-auth/utils/password` uses the "node" export condition in package.json
 * to automatically pick the right implementation:
 *   - Node.js / Bun / Deno → `node:crypto scrypt` (libuv thread pool, non-blocking)
 *   - Unsupported runtimes → `@noble/hashes scrypt` (pure JS fallback)
 */
```

`@better-auth/utils@0.4.2` `package.json` exports for `./password`:

```json
{
  "workerd": { "import": "./dist/password.node.mjs" },
  "node": { "import": "./dist/password.node.mjs" },
  "import": "./dist/password.mjs"
}
```

Wrangler "specifically attempts to load the **`workerd` key**" from `exports` ([Bundling](https://developers.cloudflare.com/workers/wrangler/bundling/)), so on Workers we get `password.node.mjs`:

```js
import { randomBytes, scrypt } from "node:crypto"
const config = { N: 16384, r: 16, p: 1, dkLen: 64 }
// scrypt(password.normalize("NFKC"), salt, 64, { N, r, p, maxmem: 128 * N * r * 2 })
// hash format: `${saltHex}:${keyHex}` (16-byte random salt, hex)
// verify: `targetKey.toString("hex") === key`
```

(Minor note: `verify` compares hex strings with `===`, not a constant-time comparison.)

**workerd runs "async" scrypt synchronously.** In `cloudflare/workerd` `src/node/internal/crypto_scrypt.ts`, `scrypt()` does `new Promise((res, rej) => { res(cryptoImpl.getScrypt(password, salt, N, r, p, maxmem, keylen)) … })`. The derivation runs in the Promise executor on the isolate thread, with no thread pool. workerd caps scrypt cost at `N*r*p ≤ 2^20` (`DEFAULT_MAX_SCRYPT_COST` in `src/workerd/io/limit-enforcer.h`). Better Auth's `16384*16*1 = 262,144` is under the cap. Cloudflare lists `argon2`/`argon2Sync` as the only unsupported KDF in `node:crypto` ([node:crypto](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/)).

**CPU budget:** Free is "10 ms" CPU per HTTP request, and Paid is "5 min (default: 30 seconds)". "Waiting on network requests (such as `fetch()` calls, KV reads, or database queries) does not count toward CPU time" ([Limits](https://developers.cloudflare.com/workers/platform/limits/)).

**Measured locally** (Node 25.2.1, Apple M4, native scrypt; Workers hardware will differ):

| KDF                                           | ms per hash                   |
| --------------------------------------------- | ----------------------------- |
| scrypt N=16384 r=16 p=1 (Better Auth)         | 39–42                         |
| PBKDF2-SHA256, 100,000 iterations (WebCrypto) | 7.3                           |
| PBKDF2-SHA256, 600,000 iterations             | 42.5 (not allowed on Workers) |

Every sign-up and sign-in pays one hash. Sign-in also hashes for unknown emails and for accounts without a password, "to prevent timing attacks" (source: `api/routes/sign-in.ts`), so the cost can't be skipped.

**Web Crypto PBKDF2 as a replacement.** It is supported (`deriveBits`) ([Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)), and MDN says PBKDF2 is designed for "relatively low-entropy input, such as passwords" ([deriveKey](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey)). **But** workerd enforces `DEFAULT_MAX_PBKDF2_ITERATIONS = 100'000`, with the comment "Note, this current default limit is _WAY_ below the recommended minimum iterations for pbkdf2" (`limit-enforcer.h`). **Recommendation: Paid plan + default scrypt.** If we ever must run on Free, a custom `{ hash, verify }` has this signature (from the docs' Argon2 example):

```ts
emailAndPassword: {
  enabled: true,
  password: {
    hash: (password: string) => Promise<string>,
    verify: (data: { password: string; hash: string }) => Promise<boolean>,
  },
}
```

Changing algorithms later means existing hashes must still verify, so decide before the first real user.

---

## 2. Per-request instantiation, Hono integration, CORS, origins

### 2.1 Why per request

- Hyperdrive + postgres.js: "Create a new client on each request is fast and recommended" because "Hyperdrive maintains the underlying database connection pool", with `max: 5`, `fetch_types: false`, `prepare: true` ([Hyperdrive postgres.js](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/postgres-js/)). This matches our `connect()`.
- "Workers do not allow I/O from outside a request context." A global `env` import is only for env vars, secrets and stubs ([Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/)).
- `drizzleAdapter(db, …)` captures `db` when it is constructed (source: `drizzle-adapter.ts`), so a module-scope `auth` would pin one postgres.js client across requests.

The Better Auth docs show only module-scope instances (Hono, D1 examples). The per-request factory below is our assembly of documented pieces, not an official recipe:

```ts
// apps/api/src/lib/auth.ts  (sketch)
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "@better-auth/drizzle-adapter"
import { schema, type Database } from "@second-brain/db"
import { v7 as uuidv7 } from "uuid"

export function createAuth(env: Env, db: Database) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL, // "http://localhost:8787" in dev
    secret: env.BETTER_AUTH_SECRET, // wrangler secret; never rely on the default
    trustedOrigins: [env.WEB_ORIGIN], // "http://localhost:3000"
    database: drizzleAdapter(db, { provider: "pg", schema, usePlural: true }),
    emailAndPassword: { enabled: true },
    rateLimit: { enabled: env.RATE_LIMIT_ENABLED === "true" },
    advanced: {
      database: { generateId: () => uuidv7() },
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
  })
}
export type Auth = ReturnType<typeof createAuth>
```

```ts
// Hono wiring (sketch)
app.use("/api/auth/*", async (c, next) =>
  cors({ origin: c.env.WEB_ORIGIN, credentials: true })(c, next)
)

app.use("*", async (c, next) => {
  const { db, close } = connect(c.env.HYPERDRIVE.connectionString)
  c.set("db", db)
  c.set("auth", createAuth(c.env, db))
  try {
    await next()
  } finally {
    c.executionCtx.waitUntil(close())
  }
})

app.all("/api/auth/*", (c) => c.get("auth").handler(c.req.raw))
```

The close-after-response pattern is our choice. `ctx.waitUntil(client.end())` is not on the Hyperdrive postgres.js page, the same open item as research 04. Per-request construction reruns Better Auth init (options merge, plugin init, and the Drizzle schema check, which inspects in-memory Drizzle metadata "without opening a connection"; `init-options.ts`). Cost unmeasured; see open items.

### 2.2 Mounting the handler (verbatim, [Hono integration](https://www.better-auth.com/docs/integrations/hono))

```ts
app.all("/api/auth/*", (c) => auth.handler(c.req.raw))
```

"`app.all()` forwards every HTTP method to Better Auth … Register the auth route before any catch-all route." With `new Hono().basePath("/api")`, mount at `/auth/*`. The D1 example on the Database page uses the older `app.on(["POST", "GET"], "/api/auth/*", …)`, which also works. `/get-session` accepts `GET` and `POST` (source: `api/routes/session.ts`).

### 2.3 Session in middleware (verbatim)

```ts
export const sessionMiddleware = createMiddleware<Env>(async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  })
  c.set("session", session)
  await next()
})
```

It returns `{ session, user } | null`. Type it with `typeof auth.$Infer.Session | null`, which for our factory is `Auth["$Infer"]["Session"]`. "Server-side requests made using `auth.api` aren't affected by rate limiting" ([Rate limit](https://www.better-auth.com/docs/concepts/rate-limit)).

### 2.4 CORS (verbatim from the Better Auth Hono page)

```ts
app.use(
  "/api/auth/*",
  cors({
    origin: "http://localhost:3001",
    credentials: true,
  })
)
app.all("/api/auth/*", (c) => auth.handler(c.req.raw))
```

"When `credentials` is enabled, configure an explicit CORS origin instead of `*` and add the same origin to Better Auth's `trustedOrigins`." Hono: "CORS should be called before the route". For env-dependent config, wrap it: `app.use('*', async (c, next) => cors({ origin: c.env.CORS_ORIGIN })(c, next))` ([Hono CORS](https://hono.dev/docs/middleware/builtin/cors)).

Behaviour from the `hono@4.13.9` source (`dist/middleware/cors/index.js`):

- The default `allowMethods` is `GET,HEAD,PUT,POST,DELETE,PATCH,QUERY`.
- With `allowHeaders` empty, a preflight **echoes `Access-Control-Request-Headers`**, so `content-type` is allowed without listing it.
- `credentials: true` sets `Access-Control-Allow-Credentials: true`.
- A string `origin` matches exactly and reflects the request origin.
- Preflights return `204` without calling `next()`.

MDN: with credentials, the server "must not specify the `*` wildcard" for Allow-Origin, Allow-Headers or Allow-Methods, and `Access-Control-Allow-Credentials: true` is required ([CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)). Apply the same CORS middleware to our non-auth API routes that the web app calls with cookies.

### 2.5 `baseURL`, `basePath`, `trustedOrigins`, `secret` ([Options](https://www.better-auth.com/docs/reference/options))

- **`baseURL`** is a string or `{ allowedHosts, protocol, fallback }`. If unset, it falls back to `BETTER_AUTH_URL`, then to the request. "Relying on request inference is not recommended."
- **`basePath`** defaults to `/api/auth`, and a path inside `baseURL` overrides it.
- **`trustedOrigins`** "By default, Better Auth trusts the base URL of your app." It accepts an array, an `async (request) => string[]` (where `request` is `undefined` at init and for `auth.api`), or wildcards (`https://*.example.com`, `localhost:*`-style patterns via dynamic `baseURL`).
- **`secret`** comes from `BETTER_AUTH_SECRET`/`AUTH_SECRET`, else the default `"better-auth-secret-12345678901234567890"`. "In production, if it's not set, it will throw." The source (`context/create-context.ts`) only throws when `isProduction`, and see §9 for why that is false on Workers. It warns if the secret is shorter than 32 chars or low-entropy. Generate one with `openssl rand -base64 32`. `secrets: [{version, value}]` supports rotation.

**CSRF/origin check (source `api/middlewares/origin-check.ts`).** State-changing requests are validated against `trustedOrigins` when:

- the request carries a `Cookie`, or
- Fetch-Metadata headers are present, or
- an `Origin`/`Referer` is present.

A missing or `null` origin on a cookie-bearing request is rejected with `403 MISSING_OR_NULL_ORIGIN`, and an untrusted one with `403 INVALID_ORIGIN`. Cross-site `navigate`-mode logins get `403 CROSS_SITE_NAVIGATION_LOGIN_BLOCKED`. Requests with no cookie, metadata or origin, such as curl, server-to-server calls and our workerd tests, pass. **Test implication:** follow-up requests that replay the session cookie must also send `Origin: <trusted origin>`.

---

## 3. Drizzle adapter and schema

### 3.1 Adapter config (source `drizzle-adapter.ts` `DrizzleAdapterConfig`)

```ts
drizzleAdapter(db, {
  provider: "pg" | "mysql" | "sqlite",
  schema?: Record<string, any>,  // tables keyed by Better Auth model name (or plural)
  usePlural?: boolean,            // keys "users","sessions",… instead of "user","session",…
  debugLogs?: …,
  camelCase?: boolean,            // CLI generation only
  transaction?: boolean,          // default false — multi-step ops run sequentially
  schemaName?: string,            // pg schema namespace for CLI generation
})
```

For pg it sets `supportsUUIDs: true`, `supportsJSON: true` and `supportsArrays: true`.

### 3.2 Mapping to our existing `users` table

The docs give three equivalent routes ([Drizzle adapter](https://www.better-auth.com/docs/adapters/drizzle)):

- `schema: { ...schema, user: schema.users }`, or
- `user: { modelName: "users" }` in the auth config, or
- **`usePlural: true`**, when all tables are plural: "If all your tables are using plural form, you can just pass the `usePlural` option".

Field names: "We map field names based on property you passed to your Drizzle schema", e.g. `email: varchar("email_address", …)`. Alternatively use `user.fields: { email: "email_address" }`. The docs add: "Type inference in your code will still use the original field names" ([Database → Custom Table Names](https://www.better-auth.com/docs/concepts/database#custom-table-names)).

**Schema validation.** `advanced.database.validateSchema` defaults to `true` in source (`checksSchema` returns `validateSchema !== false`). The Options page says "default: `true` outside production", a doc/source mismatch. For Drizzle it reads the schema object "each table by the key it is exported under, each column by its property name" (`schema-check.ts`) and reports three things:

- `missing-table`
- `missing-column`
- `unexpected-required-column`, meaning a non-null column without a default that Better Auth never writes. The message is: "every insert into … fails".

**It does not compare column types**, so `uuid` ids are accepted.

**Decision: `usePlural: true`.** Tables: `users` (existing), `sessions`, `accounts`, `verifications`. There is no clash with existing tables (`users`, `userKeys`, `items`, `itemCaptures`, `chunks`, `entities`, `itemEntities`, `threads`, `messages`). The existing `users.name` is nullable. Better Auth always writes `name`, since the core field is `required: true` and the sign-up body uses `name: z.string()`, so a nullable column passes validation.

**Columns to add to `users`:** `emailVerified` (`boolean`, not null, default `false`; core field `defaultValue: false, input: false`) and `image` (`text`, nullable). Keep `createdAt`/`updatedAt`: Better Auth writes both itself (`defaultValue: () => new Date()`, `onUpdate`).

### 3.3 Core schema ([Database → Core Schema](https://www.better-auth.com/docs/concepts/database#core-schema); required/defaults from `packages/core/src/db/get-tables.ts`)

Types are Better Auth logical types. "Optional" means nullable.

| Table            | Field                                                         | Type    | Constraints                                  |
| ---------------- | ------------------------------------------------------------- | ------- | -------------------------------------------- |
| **user**         | `id`                                                          | string  | PK                                           |
|                  | `name`                                                        | string  | required                                     |
|                  | `email`                                                       | string  | unique, required                             |
|                  | `emailVerified`                                               | boolean | required, default `false`                    |
|                  | `image`                                                       | string  | optional                                     |
|                  | `createdAt`/`updatedAt`                                       | Date    | required                                     |
| **session**      | `id`                                                          | string  | PK                                           |
|                  | `userId`                                                      | string  | FK → user.id `onDelete: cascade`, indexed    |
|                  | `token`                                                       | string  | unique, required                             |
|                  | `expiresAt`                                                   | Date    | required                                     |
|                  | `ipAddress`                                                   | string  | optional                                     |
|                  | `userAgent`                                                   | string  | optional                                     |
|                  | `createdAt`/`updatedAt`                                       | Date    | required                                     |
| **account**      | `id`                                                          | string  | PK                                           |
|                  | `userId`                                                      | string  | FK → user.id cascade, indexed                |
|                  | `accountId`                                                   | string  | required (for credentials = the user's `id`) |
|                  | `providerId`                                                  | string  | required (`"credential"` for email+password) |
|                  | `accessToken`, `refreshToken`, `scope`, `idToken`, `password` | string  | optional                                     |
|                  | `accessTokenExpiresAt`, `refreshTokenExpiresAt`               | Date    | optional                                     |
|                  | `createdAt`/`updatedAt`                                       | Date    | required                                     |
| **verification** | `id`                                                          | string  | PK                                           |
|                  | `identifier`                                                  | string  | required, indexed                            |
|                  | `value`                                                       | string  | required                                     |
|                  | `expiresAt`                                                   | Date    | required                                     |
|                  | `createdAt`/`updatedAt`                                       | Date    | required                                     |

The 1.7 upgrade guide says "Better Auth rejects account lookups when more than one row matches the key" `(providerId, accountId)` ([1.7 upgrade guide](https://www.better-auth.com/docs/guides/1-7-upgrade-guide#check-for-duplicate-account-keys)). The core schema declares no composite unique index, so adding `uniqueIndex(provider_id, account_id)` ourselves is a sensible guard (our inference).

Hand-written Drizzle sketch using our existing helpers (`id()`, `timestampTz`, `createdAt()`, `updatedAt()` in `packages/db/src/schema.ts`):

```ts
export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name"),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

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
    uniqueIndex("accounts_provider_account_uidx").on(t.providerId, t.accountId),
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
```

If `advanced.database.joins: true` is enabled later (it gives 2–3× on `/get-session` per the docs), Drizzle `relations` must be defined and passed in `schema`.

---

## 4. ID generation

Option `advanced.database.generateId` (current name; the old `experimental`/top-level forms are gone). Type from `packages/core/src/types/init-options.ts`:

```ts
generateId?: GenerateIdFn | false | "serial" | "uuid";
export type GenerateIdFn = (options: { model: ModelNames; size?: number }) => string | false;
```

Docs ([Database → ID Generation](https://www.better-auth.com/docs/concepts/database#id-generation)):

- `false`: "allows your database handle all ID generation".
- A function: "You can return `false` or `undefined` from the function to let the database generate the ID for specific models".
- `() => crypto.randomUUID()`: a consistent custom generator.
- `"serial"`: numeric IDs.
- `"uuid"`: "By default, Better-Auth will generate UUIDs for the `id` field for all tables, except adapters that use `PostgreSQL` where we allow the database to generate the UUID automatically."

Default when unset: a random 32-char base62 string (`packages/core/src/utils/id.ts`: `createRandomStringGenerator("a-z","A-Z","0-9")(32)`). **That is invalid for a Postgres `uuid` column.**

Why not `"uuid"` for us (source `packages/core/src/db/adapter/get-id-field.ts`):

- With pg (`supportsUUIDs: true`), `shouldGenerateId` is false, so Better Auth omits `id` and relies on a DB default. The CLI emits `uuid("id").default(sql\`pg_catalog.gen_random_uuid()\`)`, which is v4.
- On the `forceAllowId` path it validates with `/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`, which **rejects version 7**.

**Decision:** `generateId: () => uuidv7()` (uuid package). The value passes through untouched: `transform.input` returns it as is outside `"serial"`/`"uuid"` modes. Better Auth treats `id` as a string (`output: String(value)`). postgres.js sends the string, and Postgres coerces it to `uuid`. Foreign keys (`userId`) are the same strings.

---

## 5. CLI vs hand-written schema

- Command: `npx auth@latest generate`. Options: `--config`, `--output`, `--adapter prisma|drizzle|kysely`, `--dialect postgresql|mysql|sqlite|mongodb`, `-y`. For Drizzle the output "goes to schema.ts in your project root" ([CLI](https://www.better-auth.com/docs/concepts/cli)). Then `drizzle-kit generate` and `drizzle-kit migrate`. `migrate` is Kysely-only. `npx auth check schema --config …` validates the Drizzle schema object offline ("do not confirm that migrations have been applied").
- **Config loading.** The CLI loads `auth.ts` with jiti and needs "to default export your auth instance or to export as a variable named auth" (`auth@1.7.6/dist/index.mjs`). It **aliases `cloudflare:workers` to an inert Proxy stub** so Worker configs link. A factory like `createAuth(env, db)` is not an instance, so CLI use would need a separate `auth.cli.ts` exporting `auth = createAuth(stubEnv, stubDb)`.
- **CLI output for pg** (same file):
  - `id` is `text('id').primaryKey()` unless `generateId === "uuid"`, which gives `uuid(...).default(gen_random_uuid())`.
  - Dates are `timestamp('…')` **without time zone**.
  - Booleans are `boolean(...)`.
  - Names are snake_case unless `camelCase: true`.
- **Decision: hand-write the schema per §3.3.** The CLI can't express UUIDv7 app-generated ids or our `timestamptz` helpers. Use `npx auth check schema` (with a CLI config file) or the runtime schema check to catch drift.

---

## 6. Cookies and sessions across `localhost:3000` → `localhost:8787`

**Names** ([Cookies](https://www.better-auth.com/docs/concepts/cookies)). The format is `${prefix}.${cookie_name}` with prefix `better-auth`:

- `session_token` is always set.
- `session_data` only appears with `session.cookieCache`.
- `dont_remember` is set when `rememberMe: false`.

**Default attributes (source `packages/better-auth/src/cookies/index.ts` `createCookieGetter`):**

```ts
name: `${secureCookiePrefix}${name}`,          // "__Secure-" when secure
attributes: { secure: !!secureCookiePrefix, sameSite: "lax", path: "/", httpOnly: true,
              ...defaultCookieAttributes, ...perCookieAttributes }
```

`secure` resolution order:

1. `advanced.useSecureCookies`
2. dynamic-baseURL `protocol`
3. whether a string `baseURL` starts with `https://`
4. `isProduction`

So in dev (`baseURL: "http://localhost:8787"`) the cookie is `better-auth.session_token; HttpOnly; SameSite=Lax; Path=/`. In prod with an `https` baseURL it is `__Secure-better-auth.session_token; Secure; …`. Override globally with `advanced.defaultCookieAttributes` or per cookie with `advanced.cookies.session_token.attributes`.

**Same-site across ports.** MDN: "Port numbers are ignored when determining the site." `SameSite` uses the schemeful definition (scheme + registrable domain) ([Site](https://developer.mozilla.org/en-US/docs/Glossary/Site)). RFC 6265 §8.5: "Cookies do not provide isolation by port. If a cookie is readable by a service running on one port, the cookie is also readable by a service running on another port of the same server." ([RFC 6265](https://www.rfc-editor.org/rfc/rfc6265#section-8.5)). So `http://localhost:3000` → `http://localhost:8787` is **cross-origin (CORS applies) but same-site**, and `SameSite=Lax` cookies are sent on credentialed `fetch`. MDN also notes "The `https:` requirements are ignored when the `Secure` attribute is set by localhost" and that `__Secure-` cookies "must be set with the `Secure` attribute by a secure page" ([Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)).

**Cross-origin production guidance** ([Cookies → Safari/ITP](https://www.better-auth.com/docs/concepts/cookies#safari-itp-and-cross-domain-setups)). If the API is on a different registrable domain, Safari ITP "may block authentication cookies entirely". The docs give two fixes:

1. A reverse proxy, so the API sits under the web origin.
2. A shared parent domain (`app.example.com` + `api.example.com`) with `advanced.crossSubDomainCookies: { enabled: true, domain: "example.com" }`.

Deploy topology is an open item.

**Expiry** ([Session Management](https://www.better-auth.com/docs/concepts/session-management)): "The session expires after 7 days by default. But whenever the session is used and the `updateAge` is reached, the session expiration is updated to the current time plus the `expiresIn` value." The defaults are `expiresIn: 60*60*24*7` and `updateAge: 60*60*24`. The cookie `maxAge` equals `expiresIn` (source: `sessionMaxAge = options.session?.expiresIn || sec("7d")`). With `rememberMe: false` it is a browser-session cookie ("If false, the user will be signed out when the browser is closed. (default: true)"). **So "stay signed in across visits" works by default** as long as the user returns within 7 days. `GET /get-session` performs the refresh write (`session.deferSessionRefresh` makes GET read-only).

---

## 7. Email + password config and endpoints

Config ([Email & Password](https://www.better-auth.com/docs/authentication/email-password)), with defaults from the doc's options table:

| Option                          | Default                                     |
| ------------------------------- | ------------------------------------------- |
| `enabled`                       | `false`                                     |
| `disableSignUp`                 | `false`                                     |
| `minPasswordLength`             | `8`                                         |
| `maxPasswordLength`             | `128`                                       |
| `autoSignIn`                    | `true` (sign-up creates a session + cookie) |
| `requireEmailVerification`      | `false`                                     |
| `revokeSessionsOnPasswordReset` | `false`                                     |
| `resetPasswordTokenExpiresIn`   | `3600` s                                    |
| `password.{hash,verify}`        | scrypt                                      |

**Enumeration protection:** "With the default configuration, the endpoint still returns a `422` error for existing emails." When `requireEmailVerification: true` or `autoSignIn: false`, sign-up returns the same `200` either way, with `token: null` and a synthetic user.

Endpoints (paths under `basePath` `/api/auth`, taken from the docs `APIMethod` blocks and source):

| Endpoint                         | Body                                                                                                            | Success                                                                                                   |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `POST /sign-up/email`            | `{ name: string, email: string, password: string, image?: string, callbackURL?: string, rememberMe?: boolean }` | `200 { token: string, user }` + `Set-Cookie` (autoSignIn); `{ token: null, user }` when autoSignIn is off |
| `POST /sign-in/email`            | `{ email, password, rememberMe?: boolean = true, callbackURL?: string }`                                        | `200 { redirect: boolean, token: string, url?: string, user }` + `Set-Cookie`                             |
| `POST /sign-out`                 | `{}` (needs session cookie)                                                                                     | `200 { success: true }` (+ provider logout fields when applicable), cookie cleared, session row deleted   |
| `GET` (or `POST`) `/get-session` | –                                                                                                               | `200 { session, user }` or `200 null`                                                                     |

**Error shape.** A thrown `APIError.from(status, { code, message })` is serialized by better-call `toResponse(error.body, { status: statusCode })`, giving a JSON body of `{ "message": string, "code": string }` (sources: `packages/core/src/error/index.ts`, `better-call@1.4.0/dist/to-response.mjs`). The client exposes `error.message`, `error.status` and `error.statusText` ([Client → Handling Errors](https://www.better-auth.com/docs/concepts/client#handling-errors)).

| Case                                          | Status | `code`                                      | `message`                                   |
| --------------------------------------------- | ------ | ------------------------------------------- | ------------------------------------------- |
| Duplicate email on sign-up (default config)   | 422    | `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`     | "User already exists. Use another email."   |
| Invalid email                                 | 400    | `INVALID_EMAIL`                             | "Invalid email"                             |
| Password too short / too long                 | 400    | `PASSWORD_TOO_SHORT` / `PASSWORD_TOO_LONG`  | "Password too short" / "Password too long"  |
| Wrong password / unknown email on sign-in     | 401    | `INVALID_EMAIL_OR_PASSWORD`                 | "Invalid email or password"                 |
| Sign-in with unverified email (when required) | 403    | `EMAIL_NOT_VERIFIED`                        | "Email not verified"                        |
| Sign-up disabled                              | 400    | `EMAIL_PASSWORD_SIGN_UP_DISABLED`           | "Email and password sign up is not enabled" |
| Untrusted / missing origin with cookie        | 403    | `INVALID_ORIGIN` / `MISSING_OR_NULL_ORIGIN` | –                                           |
| Rate limited                                  | 429    | –                                           | –                                           |

Sources: `api/routes/sign-up.ts`, `api/routes/sign-in.ts`, `utils/password.ts`, `packages/core/src/error/codes.ts`. The sign-up email is lowercased (`email.toLowerCase()`) before lookup and insert.

---

## 8. Client (`apps/web`)

From the docs ([Client](https://www.better-auth.com/docs/concepts/client)), verbatim:

```ts
import { createAuthClient } from "better-auth/react"
export const authClient = createAuthClient({
  baseURL: "http://localhost:3000", // The base URL of your auth server
})
```

For us, set `baseURL` to the API origin (`http://localhost:8787`, from `NEXT_PUBLIC_API_URL`). `basePath` defaults to `/api/auth`, or pass the full URL including the path.

- **`credentials: "include"` is the default.** In source (`client/config.ts`) it is `...(isCredentialsSupported ? { credentials: "include" } : {})`. The Hono page also states it: "The Better Auth client uses `credentials: "include"` by default." `fetchOptions` is only needed for overrides (it takes better-fetch options, e.g. `onSuccess`/`onError`).
- API: `authClient.signUp.email({ name, email, password })`, `authClient.signIn.email({ email, password, rememberMe? })` and `authClient.signOut({ fetchOptions: { onSuccess } })`. Each returns `{ data, error }`. `authClient.useSession()` returns `{ data: session, isPending, error, refetch }`.
- Our own (non-auth) API calls from the web app must also use `credentials: "include"`, for example `hc(..., { init: { credentials: "include" } })` if we use Hono RPC ([Hono integration → Hono RPC](https://www.better-auth.com/docs/integrations/hono#hono-rpc)).

---

## 9. Rate limiting, and what behaves differently in workerd

**Rate limiting** ([Rate limit](https://www.better-auth.com/docs/concepts/rate-limit); source `context/create-context.ts`, `api/rate-limiter/index.ts`):

- "Rate limiting is disabled in development mode by default." Source: `enabled: options.rateLimit?.enabled ?? isProduction`.
- Default window: the docs say "60 seconds / 100 requests", but the source default is `window: options.rateLimit?.window || 10`, `max: … || 100`. **Doc/source mismatch.** Set both explicitly.
- Built-in stricter rule: `/sign-in*`, `/sign-up*`, `/change-password*` and `/change-email*` allow **3 requests per 10 s** (source).
- Storage defaults to `"memory"`, or `"secondary-storage"` if one is configured. The docs say memory "may not be suitable … particularly in serverless environments". The memory store is a **module-level `Map`** (source line 16), so it survives per-request instances within one isolate but is not shared across isolates or colos. `storage: "database"` needs a `rateLimit` table (`id`, `key` unique, `count` integer, `lastRequest` bigint epoch ms).
- The client IP comes from `x-forwarded-for` by default. On Cloudflare use `advanced.ipAddress.ipAddressHeaders: ["cf-connecting-ip"]`, which the docs show as the "Cloudflare specific header example".

**`NODE_ENV`/`process.env` on Workers.**

- Better Auth's env shim reads `globalThis.process?.env || Deno… || globalThis.__env__ || globalThis`, and `nodeENV = env.NODE_ENV ?? ""` goes through a Proxy (`@better-auth/core@1.7.6/dist/env/env-impl.mjs`). `isProduction` is computed once at module load.
- Cloudflare: "`process.env.NODE_ENV` is statically replaced at build time and is not a runtime value" ([process](https://developers.cloudflare.com/workers/runtime-apis/nodejs/process/)). The replacement is `"development"` for `wrangler dev` and `"production"` for `wrangler deploy` ([Bundling](https://developers.cloudflare.com/workers/wrangler/bundling/)). The Proxy access `env.NODE_ENV` is not the literal token, so **it is not replaced**.
- `process.env` "will contain any environment variables, secrets…" with `nodejs_compat_populate_process_env`, which is on by default from compatibility date 2025-04-01. Ours is 2026-09-08.

Net effect: in a deployed Worker without a `NODE_ENV` var, `isProduction === false`. That means:

- rate limiting off by default
- default secret accepted without throwing
- `validateSecret` skipped in tests only if `isTest()`

**Pass `secret`, `baseURL` and `rateLimit.enabled` explicitly** instead of setting `NODE_ENV` as a var and hoping module-load ordering picks it up (see open items).

**Other workerd notes:**

- `AsyncLocalStorage` needs `nodejs_compat`.
- Password hashing uses native `node:crypto` (§1.3).
- Signing uses Web Crypto HMAC (`getWebcryptoSubtle().importKey("raw", …, {name:"HMAC",hash:"SHA-256"})` in `crypto/index.mjs`).
- Telemetry defaults to off (`telemetry` "default: `false`", [Options](https://www.better-auth.com/docs/reference/options#telemetry)).

---

## 10. Encrypting user API keys at rest (Web Crypto AES-GCM)

**Availability:** Workers Web Crypto supports AES-GCM encrypt/decrypt/generateKey, HKDF deriveBits/deriveKey, PBKDF2 deriveBits, `crypto.randomUUID()` and a non-standard `timingSafeEqual` ([Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)).

**Parameters** ([AesGcmParams](https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams)):

- `iv`: "must be unique for every encryption operation carried out with a given key … The AES-GCM specification recommends that the IV should be 96 bits long, and typically contains bits from a random number generator … the IV does not have to be secret, just unique: so it is OK … to transmit it in the clear alongside the encrypted message."
- `tagLength`: allowed values are "32, 64, 96, 104, 112, 120, or 128 … `tagLength` is optional and defaults to 128".
- `additionalData`: "will not be encrypted but will be authenticated … the same data must be given in the corresponding call to `decrypt()`".

**NIST SP 800-38D** ([PDF](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf)):

- §5.2.1.1: "For IVs, it is recommended that implementations restrict support to the length of 96 bits".
- §8.2.2 (RBG-based construction): "the length of the random field shall be at least 96 bits".
- §8.3: with random IVs, "The total number of invocations of the authenticated encryption function shall not exceed 2^32 … with the given key."

That limit is far beyond per-user API key volume, but it is a reason to keep a key version in the stored format so we can rotate.

**Key material.**

- Use a dedicated Worker secret holding 32 random bytes (base64, e.g. `openssl rand -base64 32`), imported with `importKey("raw", bytes, "AES-GCM", false, ["encrypt","decrypt"])`. MDN's raw-import example uses `importKey("raw", rawKey, "AES-GCM", true, ["encrypt","decrypt"])` ([importKey](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/importKey)). Use `extractable: false`, since nothing needs to export it.
- HKDF only fits if deriving sub-keys from one high-entropy master. MDN: HKDF is for "high-entropy input … Not suitable for passwords" ([deriveKey](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey)).

Sketch (primitives from MDN; format is our choice):

```ts
const key = await crypto.subtle.importKey(
  "raw",
  base64ToBytes(env.API_KEY_ENCRYPTION_KEY),
  "AES-GCM",
  false,
  ["encrypt", "decrypt"]
)

async function encryptApiKey(
  plaintext: string,
  userId: string
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(userId) },
    key,
    new TextEncoder().encode(plaintext)
  )
  return `v1:${bytesToBase64(concat(iv, new Uint8Array(ciphertext)))}` // tag (16 B) is appended by WebCrypto
}
```

Binding `additionalData` to the owning user id means a ciphertext copied onto another user's row fails to decrypt. That is our design choice, supported by the MDN `additionalData` semantics. Base64: `Buffer` is available under `nodejs_compat`, or use `btoa`/`atob`.

**Better Auth's helper** (`better-auth/crypto`, `dist/crypto/index.mjs`): `symmetricEncrypt({ key, data })` / `symmetricDecrypt({ key, data })`.

- Algorithm: **XChaCha20-Poly1305** via `@noble/ciphers` `managedNonce(xchacha20poly1305)` (pure JS).
- Key: `SHA-256(secret)`.
- Output: hex (nonce prepended by `managedNonce`).
- With versioned `secrets`, output is wrapped as `$ba$<version>$<hex>`.

It is sound AEAD, but it ties API-key ciphertexts to the auth secret's rotation and runs in JS rather than natively. **Decision: own AES-GCM with a separate key.**

---

## Open items / uncertainties

1. **CPU on real Workers hardware.** The ~40 ms scrypt figure is a local M4 Node measurement. Confirm with `wrangler tail` CPU time on a deployed sign-up and sign-in. The recommendation (Paid plan) doesn't depend on the exact number unless it came in under 10 ms, which is implausible.
2. **Per-request init cost.** Unmeasured: `betterAuth()` construction, plugin init and the Drizzle schema check on every request. If it matters, set `advanced.database.validateSchema: false` outside tests and dev. That default is itself inconsistent: `true` in source, "true outside production" in the docs.
3. **Closing postgres.js after the response.** The exact pattern (`executionCtx.waitUntil(close())` after `await next()`) is undocumented on the Hyperdrive page. Same open item as research 04.
4. **Issue [#10315](https://github.com/better-auth/better-auth/issues/10315)** (open): the module-level `node:async_hooks` import promise in `@better-auth/core` could still be affected by aborted first requests even with per-request instances. Watch the issue.
5. **`NODE_ENV` at module load on Workers.** Whether a `NODE_ENV` var in `wrangler.jsonc` is visible in `process.env` at module-evaluation time, which is when `isProduction` is computed, is not stated in Cloudflare's docs. We avoid depending on it by passing options explicitly.
6. **Tests in workerd.**
   - `isTest()` reads `NODE_ENV === "test"` or `TEST`. Whether `@cloudflare/vitest-plugin` sets either inside workerd is unverified. It only affects secret validation warnings.
   - Test requests that replay cookies must send a trusted `Origin` header (§2.5).
7. **Rate-limit defaults.** The docs say a 60 s window and the source says 10 s. Set both explicitly. Memory storage is per isolate. Decide whether v1 needs `storage: "database"` (extra table) or accepts per-isolate limits.
8. **Production topology.** Web and API on the same registrable domain (subdomains + `crossSubDomainCookies`) or behind a proxy, so Safari ITP doesn't drop cookies. Not decided here.
9. **`(providerId, accountId)` unique index.** Not in Better Auth's core schema. Adding it is our inference from the 1.7 upgrade guide.
10. **`@better-auth/utils` verify** compares hex strings with `===` (not constant-time). Low risk for a KDF output, but noted.
