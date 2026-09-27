# Postgres client lifecycle on Workers: postgres.js teardown, Hyperdrive, workerd sockets, vitest

Researched 2026-09-27 against primary sources: postgres.js 3.4.9 source (installed at `node_modules/.bun/postgres@3.4.9/node_modules/postgres`, paths below are relative to that), porsager/postgres issues, developers.cloudflare.com (raw `index.md` pages), cloudflare/workerd source (`master`), miniflare 5.20260925.0-alpha and @cloudflare/vitest-plugin 1.2.8 as installed, brianc/node-postgres source (`master`) and npm registry, drizzle-orm 0.45.3 type declarations as installed. Discussion input, not decisions. Anything inferred rather than read is marked **[inference]**.

## Problem as observed

`apps/api` creates `postgres(connectionString, { max: 5, fetch_types: false, prepare: true })` per request (`packages/db/src/index.ts:24-33`).

- (a) Never closing the clients exhausts local Postgres (`sorry, too many clients already`) over a long test run.
- (b) Closing them with `client.end({ timeout: 5 })` (`apps/api/src/lib/request-context.ts:17`, `apps/api/src/lib/items-queue.ts:38`, `apps/api/src/lib/pipeline/process-item.ts:50`) produces hundreds of `Unhandled Rejection: TypeError: This socket has been closed.` at `cf/polyfills.js:201`.

---

## Q1. Why the rejection escapes `read()`'s try/catch

### Code path (postgres@3.4.9)

1. `connect()` starts the read loop fire-and-forget. Nothing handles its promise: `tcp.ssl ? readFirst() : read()` (`cf/polyfills.js:163`).
2. `read()` catches a failed `reader.read()` and calls `error(err)` **from inside the `catch` block** (`cf/polyfills.js:197-206`).
3. `error()` emits `'error'` and then `'close'` on a `node:events` `EventEmitter` (`cf/polyfills.js:213-216`; the emitter is created at `cf/polyfills.js:133`).
4. The connection registers its listeners once, when it creates the socket: `x.on('error', error)`, `x.on('close', closed)` (`cf/src/connection.js:141-142`).
5. `sql.end()` → `end()` → `terminate()` → `socket.end(<Terminate 'X'>)` (`cf/src/connection.js:415-436`). The polyfill's `end(data)` writes and then calls `tcp.raw.close()` (`cf/polyfills.js:186-190`).
6. `tcp.raw.close()` resolves `raw.closed` → polyfill `close()` → `emit('close')` (`cf/polyfills.js:152-156`, `173-179`). That runs `connection.closed()`, which calls **`socket.removeAllListeners()`** (`cf/src/connection.js:449`).
7. workerd's `Socket.close()` force-cancels the readable side with `js.typeError("This socket has been closed.")` (workerd `src/workerd/api/sockets.c++` ~L826-833 at commit `40507849`, https://github.com/cloudflare/workerd/blob/40507849dc4bf8b74cfc76b775a67541c2ee75bf/src/workerd/api/sockets.c%2B%2B). The comment there says queued operations "are rejected with this reason". So the pending `await tcp.reader.read()` at `polyfills.js:201` rejects.
8. The `catch` calls `error(err)` → `tcp.emit('error', err)` with **zero listeners**, because step 6 removed them. An `EventEmitter` rethrows an `'error'` event that has no listener. That throw happens inside the `catch`, so `read()`'s promise rejects. Nobody awaits that promise (step 1), so it becomes an unhandled rejection. The stack points at L201 because the rethrown object is the original `TypeError`.

Reproduced in isolation with the same shape (`/private/tmp/claude-501/ee-race.mjs`, Node 25.2.1): removing all listeners and then rejecting the pending read prints `UNHANDLED REJECTION: This socket has been closed.`

This happens with both graceful `end()` and `end({ timeout })`, since both end in `raw.close()` while a read is pending. `idle_timeout` and `max_lifetime` call the same `end` (`cf/src/connection.js:77-78`), so they hit it too. `readFirst()` (the SSL path) has no try/catch at all (`cf/polyfills.js:208-211`).

### Known issue: yes, open, unfixed

| Issue                                                                                   | Status                    | Content                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [porsager/postgres#1196](https://github.com/porsager/postgres/issues/1196) (2026-08-20) | OPEN, no maintainer reply | The exact trace above: the `read()`/`error()`/`removeAllListeners()` race. Suggests `tcp.listenerCount('error') && tcp.emit('error', err)`, or `read().catch(() => {})`.                                                                                                                       |
| [porsager/postgres#1202](https://github.com/porsager/postgres/issues/1202) (2026-08-28) | OPEN                      | Same root cause, seen as `Stream was cancelled.` at `polyfills.js:201` under `@cloudflare/vitest-plugin`: "vitest exits non-zero on an unhandled error even when every test passes". Reporter carries a one-line `patch-package` fix: guard `emit('error')` with `listenerCount('error') > 0`. |
| [porsager/postgres#1203](https://github.com/porsager/postgres/issues/1203)              | OPEN                      | Related cf-build defect: `sql.reserve()` never resolves on a cold pool.                                                                                                                                                                                                                        |

**Fixed version: none.**

- npm `latest` is `3.4.9` (2026-04-05). The `beta` dist-tag is the stale `3.0.0-rc.3`, so there is no 3.5 beta (`npm view postgres dist-tags`).
- `cf/polyfills.js` on `master` still has the unguarded `error()`. That file was last changed on 2023-10-13 (commit `09e6cb5`, via `gh api repos/porsager/postgres/commits?path=cf/polyfills.js`).
- No open PR targets it. [#1109](https://github.com/porsager/postgres/pull/1109) (open since 2025-09) removes the custom net/tls polyfills in favour of workerd's built-in `node:net`, which would remove this code path, but it is unmerged.

**Documented workaround:** only the patch described in #1202. Upstream documents none.

---

## Q2. What Cloudflare documents for closing per-request clients

### `end()` is documented as **unnecessary**

From https://developers.cloudflare.com/hyperdrive/concepts/connection-lifecycle/ (updated Apr 21, 2026):

> "You do **not** need to call `client.end()`, `sql.end()`, `connection.end()` (or similar) to clean up database clients. Workers-to-Hyperdrive connections are automatically cleaned up when the request or invocation ends, including when a Workflow or Queue consumer completes, or when a Durable Object hibernates or is evicted when idle."

> "When your Worker finishes processing a request, the database client is automatically garbage collected and the edge connection to Hyperdrive is cleaned up. Hyperdrive keeps the underlying connection to your origin database open in its pool for reuse."

Neither driver page's example calls `end()` or `ctx.waitUntil(...)`:

- The Postgres.js page (https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/postgres-js/) says "creating a new client on each request is fast and recommended", with `max: 5` "due to Workers' limits on concurrent external connections", `fetch_types: false` and `prepare: true`.
- The node-postgres page (https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/node-postgres/) shows `new Client(...)`, `connect()` and `query()` with no `end()`.

`ctx.waitUntil(client.end())` is not recommended anywhere in the current docs. #1202 claims the docs recommend it, but the current pages do not.

Clients must be created **inside** handlers and never at global scope. A global driver-level pool "will leave you with stale connections that result in failed queries and hard errors" (same lifecycle page). The TCP sockets page says the same: "TCP sockets cannot be created in global scope and shared across requests" (https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/).

### Workflows: one connection per step, cleaned up when the invocation ends

> "If you use Hyperdrive in a Workflow, create a new connection inside each `step.do()` and run your queries in that same step. Do not reuse a Hyperdrive-backed connection across steps."
> — https://developers.cloudflare.com/workflows/build/rules-of-workflows/

The lifecycle page puts cleanup at the point where "a Workflow … completes", not at the end of each step. **[inference]** Per-step clients therefore accumulate open sockets until the invocation ends. In production that is harmless: they are edge sockets to Hyperdrive, and "Hyperdrive does not limit the number of concurrent client connections from your Workers" (https://developers.cloudflare.com/hyperdrive/platform/limits/). Origin connections are capped at about 20 (Free) or about 100 (Paid) per configuration.

### What the runtime does with open sockets when a request ends

The workerd `IoContext` class comment says:

> "When the IoContext is destroyed, all outstanding I/O objects and tasks created through it are destroyed immediately, even if objects on the JS heap still refer to them."
> — `src/workerd/io/io-context.h` ~L262-279, https://github.com/cloudflare/workerd/blob/master/src/workerd/io/io-context.h

A socket's connection state is held in an `IoOwn<ConnectionData>` (`src/workerd/api/sockets.h` L323), so it is destroyed along with its request's `IoContext`. For non-actor requests, the context is drained once the response is done and all `waitUntil` tasks finish. For **actor (Durable Object) requests**, it lasts "until either all tasks have finished …, or a new incoming request has been received …, or the actor is shut down" (`io-context.h`, the `drain()` comment ~L136-145).

So in production, workerd closes an unclosed socket when the invocation's context goes away. That is the mechanism behind Cloudflare's "you do not need to call end()".

### Local dev and vitest behave differently

**1. There is no Hyperdrive pool locally.** Each Worker socket is a real Postgres backend.

- Docs: "When using `localConnectionString`, Hyperdrive's connection pooling and query caching do not take effect. Your Worker connects directly to the database without going through Hyperdrive." (https://developers.cloudflare.com/hyperdrive/configuration/local-development/)
- Code: miniflare maps a Postgres URL with no `sslmode` (default `"disable"`) to a workerd `external` TCP service pointing straight at the database host and port. It only inserts a Node proxy for TLS modes (`miniflare/dist/src/index.js` L116452-116481 and the `parseSslMode` default at L116492).
- Our `vitest.config.ts` passes `hyperdrives: { HYPERDRIVE: inject("databaseUrl") }`, so every postgres.js connection opened in tests uses up one of local Postgres's `max_connections` slots.

**2. Test bodies run inside a never-evicted Durable Object.**

- The vitest plugin runs tests in `__VITEST_POOL_WORKERS_RUNNER_DURABLE_OBJECT__` with `unsafePreventEviction: true` (`@cloudflare/vitest-plugin/dist/pool/index.mjs` L64596-64600).
- **[inference]** Any client created by code called directly from a test body is owned by that actor's long-lived context. That covers `connect(...)` in `test/pipeline.test.ts:149,328,346` and `processItem` driven directly, per the comment in `vitest.config.ts`. From the `drain()` semantics above, such a context is never torn down during the run, so its sockets stay open until workerd exits. This fits symptom (a): the harness does not reproduce production's per-invocation cleanup for these calls.
- `exports.default.fetch()` is documented as running "in the same isolate/context as tests" (https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/). Whether it gets its own `IoContext` is not stated (see Open items).

**3. Miniflare's local Hyperdrive proxy has its own leaks, but they don't apply to us.** [workers-sdk#15843](https://github.com/cloudflare/workers-sdk/issues/15843) (proxy servers leak across `setOptions()`) and [#15768](https://github.com/cloudflare/workers-sdk/issues/15768) (proxy crashes on a client-socket error) only affect TLS `sslmode` bindings. Our `sslmode=disable` path bypasses the proxy.

---

## Q3. node-postgres (`pg`) in workerd

**Cloudflare's recommended driver:**

> "Node-postgres (`pg`) is the recommended driver for connecting to your Postgres database from JavaScript or TypeScript Workers."
> — https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/

The minimum version is `8.16.3` (node-postgres driver page). Current `pg` is `8.23.0` and depends on `pg-cloudflare ^1.4.0` (`npm view pg`).

**Teardown in `pg-cloudflare`:**

- Its shim has the same shape as postgres.js: `_listen().catch((e) => this.emit('error', e))` (`packages/pg-cloudflare/src/index.ts` L48-50, https://github.com/brianc/node-postgres/blob/master/packages/pg-cloudflare/src/index.ts).
- It handles the rejection, and pg's `Connection` never calls `removeAllListeners()` on the stream. It registers `reportStreamError` once and keeps it (`packages/pg/lib/connection.js` L54-61). So the postgres.js "emit with no listener" race does not exist in pg.
- **[inference, unverified]** A late `TypeError: This socket has been closed.` has no `.code`, so it is not filtered by the `_ending && (ECONNRESET|EPIPE)` guard (`connection.js` L56). It would reach `client._handleErrorEvent` → `client.emit('error')` (`packages/pg/lib/client.js` L416-423). That throws if the app has not attached `client.on('error')`. Needs a spike.

**Teardown fixes are merged but not released:**

| Change                                                                                                                                                                                     | Merged     | In a release? |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------------- |
| [#3735](https://github.com/brianc/node-postgres/pull/3735) "safely end closed sockets" (fixes [#3689](https://github.com/brianc/node-postgres/issues/3689), `end()` throws `null.close()`) | 2026-08-12 | No            |
| [#3747](https://github.com/brianc/node-postgres/pull/3747) write callback overload used by `Connection.end()`                                                                              | 2026-08-14 | No            |
| [#3752](https://github.com/brianc/node-postgres/pull/3752) "prevent Client.end() from hanging" (fixes [#3152](https://github.com/brianc/node-postgres/issues/3152))                        | 2026-09-11 | No            |

The latest `pg-cloudflare` on npm is `1.4.0`, published 2026-05-18 (`npm view pg-cloudflare time`). So `await client.end()` in workerd on released `pg` is not verified clean either.

There is also an open production bug: [#3757](https://github.com/brianc/node-postgres/issues/3757), where a single large statement (~124 KB) kills the connection on Workers.

**Cost of switching (drizzle-orm 0.45.3):**

- Result shape: with `drizzle-orm/postgres-js`, `db.execute()` returns a `RowList` (an array) (`postgres-js/session.d.ts` L58-59). With `drizzle-orm/node-postgres`, it returns a `pg` `QueryResult` (`{ rows, rowCount, … }`) (`node-postgres/session.d.ts` L57-59). That means 5 raw `execute` call sites in `packages/db/src` (`index.ts:40`, `queries/items.ts:84`, `queries/pipeline.ts:76`, `queries/search.ts:98,101,129`) plus 4 in tests would change from `const [row] = …` / `rows` to `.rows`.
- Transactions: the same `db.transaction` API. With a `Client`, drizzle runs the transaction on that client; with a `Pool`, it checks out a client and releases it (`node-postgres/session.js` L180-193). The 4 `db.transaction` call sites need no change.
- Connecting: `pg.Client` needs an explicit `await client.connect()` per invocation. Drizzle's docs show `drizzle({ client: pool })` from `drizzle-orm/node-postgres` (https://orm.drizzle.team/docs/get-started-postgresql).
- `prepare: true`: pg only uses named prepared statements when a query is given a `name`. **[inference]** Drizzle 0.45 does not name queries by default, so Hyperdrive's prepared-statement caching behaviour would differ from today. Not verified.

Switching does **not** give a verified clean `end()` today, and Cloudflare says `end()` is not needed. For this problem it is cost without benefit.

---

## Q4. Recommendation

The principle is Cloudflare's documented model: **a client is owned by the invocation that created it, and the runtime tears it down with that invocation. Production code does not call `end()`.** The unhandled rejections come entirely from calling `end()`, which the docs say is unnecessary. The connection exhaustion comes from the test harness running production code inside a context that never ends.

1. **Fetch handler.** Create the client per request inside the handler (Hono middleware is fine). Remove `c.executionCtx.waitUntil(close())` (`request-context.ts:17`). Source: connection-lifecycle page.
2. **Queue consumer.** Create one client per `queue()` invocation and do not close it (`items-queue.ts:38`). Source: same page, "including when a … Queue consumer completes".
3. **Workflow steps.** Create the client inside each `step.do()` and use it only in that step (rules-of-workflows). Do not `await close()` at the end of a step (`process-item.ts:50`). Accumulating sockets within one invocation is expected and harmless against Hyperdrive.
4. **Ownership seam.** Functions such as `processItem` should take a `Database` rather than create and close one. The entrypoint (the step or handler) owns the lifecycle. This fixes the test leak without production code knowing about tests:
   - Tests that call domain functions directly open **one** client per test file and close it in `afterAll`. The runner DO context never ends, so the test owns the teardown.
   - Tests that exercise entrypoints go through `exports.default.fetch`, `createMessageBatch` + the queue handler, or `introspectWorkflow`.
5. **postgres.js options.** Keep Cloudflare's documented `{ max: 5, fetch_types: false, prepare: true }`.
   - `max: 1` is not required for correctness. drizzle transactions use `sql.begin`, which reserves a connection. postgres.js only rejects a bare `BEGIN` on a multi-connection pool (`UNSAFE_TRANSACTION`, `cf/src/connection.js:608`).
   - Do **not** add `idle_timeout` or `max_lifetime` as a cleanup mechanism. They go through the same `end()` → `raw.close()` path (`cf/src/connection.js:77-78`, `1044-1063`), so they hit the same race. The cf build defaults both to `null`, and `max` to 3 when `globalThis.Cloudflare` is set (`cf/src/index.js:450-455`).
6. **The remaining `end()` in tests (step 4) still hits #1196/#1202.** The correct fix is upstream: the one-line `listenerCount('error')` guard, which both issue reporters proposed. Until it is released:
   - Contribute that PR to porsager/postgres.
   - Carry exactly that change with `bun patch postgres@3.4.9`, linked to the PR, and delete it on upgrade.

   This is the standard mechanism for an upstream defect with a known fix, not a behavioural workaround. It is the only point where teardown happens, and it is test-only.

7. **Stay on postgres.js for now.** Revisit `pg` once `pg-cloudflare` > 1.4.0 ships #3735/#3747/#3752 and a spike shows `await client.end()` is clean in workerd.

---

## Open items

1. **Whether `exports.default.fetch()` from a test gets its own `IoContext`.** If it does, sockets from HTTP-driven tests are reclaimed per call. If it runs in the runner DO's context, they are not. The docs say only "same isolate/context". Verify empirically by counting `pg_stat_activity` rows before and after N `exports.default.fetch` calls with `close()` removed.
2. **Whether Workflow instances under `introspectWorkflow` release their sockets when `run()` completes locally.** Measure the same way.
3. **Whether released `pg@8.23.0` / `pg-cloudflare@1.4.0` `client.end()` in workerd emits a late `'error'`.** See the Q3 inference.
4. **Upstream movement on porsager/postgres#1196/#1202 and #1109.** None as of 2026-09-27.
5. **Optional test-topology alternative:** put a transaction-mode pooler (PgBouncer) in front of local Postgres to mirror Hyperdrive's pooling. Not researched here, including its prepared-statement support.
