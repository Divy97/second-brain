# Cloudflare Workers testing, Hyperdrive, Wrangler 4, Hono, Queues, Workflows

Research date: 2026-09-27. Sources: developers.cloudflare.com, cloudflare/workers-sdk and cloudflare/workerd on GitHub, npm registry (`npm view`), hono.dev, and the `wrangler@4.141.0` CLI `--help` output. One secondary source (a dev.to article) is used only for the DOM-lib conflict and is flagged as such.

Context: Turborepo, bun 1.3.5, Node 25 local, vitest ^5.0.2 at root, TypeScript 5.9. Adding `apps/api` (Hono on Workers, Neon Postgres via Hyperdrive, Queues, Workflows). Tests must run inside the Workers runtime against a real local Postgres.

## TL;DR / decisions that matter

1. **The package has been renamed.** `@cloudflare/vitest-pool-workers` is legacy; Cloudflare's docs now install `@cloudflare/vitest-plugin` (`cloudflareTest()` Vite plugin, not `defineWorkersConfig`). Latest: `@cloudflare/vitest-plugin@1.2.8` (published 2026-09-25). `@cloudflare/vitest-pool-workers@0.22.0` was last published 2026-09-18 and is not marked deprecated on npm, but its own CHANGELOG now lives at `packages/vitest-plugin/` (the `packages/vitest-pool-workers` dir no longer exists on `main`). Source: `npm view`, [Vitest integration index](https://developers.cloudflare.com/workers/testing/vitest-integration/), [migration guide](https://developers.cloudflare.com/workers/testing/vitest-integration/migration-guides/migrate-to-vitest-plugin/).
2. **Vitest 5 is NOT supported by either package today.** Both declare `peerDependencies.vitest: ^4.1.0`. Vitest 5 support is an open, unmerged PR ([workers-sdk#15500](https://github.com/cloudflare/workers-sdk/pull/15500), opened 2026-09-03, updated 2026-09-16) fixing open issue [#15618](https://github.com/cloudflare/workers-sdk/issues/15618). With vitest 5.0.x the pool fails to start (`SyntaxError: Unexpected identifier 'file'`). **Action:** `apps/api` must pin `vitest@^4.1.0` (latest 4.x is `4.1.11`) even though the repo root has `vitest ^5.0.2`. Vitest 3 is also out: docs say "requires Vitest 4.1 or later".
3. **Hyperdrive in tests works** via `localConnectionString` in `wrangler.jsonc` (mapped straight into Miniflare's `hyperdrives`) or by overriding `miniflare.hyperdrives` in the plugin options. The `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_<BINDING>` env var is honored by `wrangler dev` but, per source inspection, **not** by the Vitest plugin (see section 1.5).
4. **Queues consumers and Workflows are testable** with dedicated `cloudflare:test` helpers (`createMessageBatch`/`getQueueResult`, `introspectWorkflow`/`introspectWorkflowInstance`); official fixtures exist for both plus Hyperdrive.
5. **`SELF` and `env` from `cloudflare:test` are deprecated** in the new plugin in favour of `import { env, exports } from "cloudflare:workers"` and `exports.default.fetch(...)`.
6. **Node 25 caveat:** `vitest@4.1.11` engines is `^20.0.0 || ^22.0.0 || >=24.0.0` (OK). `wrangler@4.141.0` engines is `>=22.0.0` (OK). `vitest@5.0.2` engines is `^22.12.0 || ^24.0.0 || >=26.0.0` (Node 25 is _not_ in range for vitest 5, but we are not using vitest 5 in `apps/api` anyway).

---

## 1. `@cloudflare/vitest-plugin` (and the legacy `@cloudflare/vitest-pool-workers`)

### 1.1 Versions (npm registry, 2026-09-27)

| Package                           | Latest                                                | Peer `vitest`                                                   | Bundled `wrangler` / `miniflare`                | Published  |
| --------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------- | ---------- |
| `@cloudflare/vitest-plugin`       | 1.2.8                                                 | `^4.1.0` (+ `@vitest/runner ^4.1.0`, `@vitest/snapshot ^4.1.0`) | wrangler 4.141.0 / miniflare 5.20260925.0-alpha | 2026-09-25 |
| `@cloudflare/vitest-pool-workers` | 0.22.0                                                | `^4.1.0`                                                        | wrangler 4.124.0 / miniflare 5.20260815.0-alpha | 2026-09-18 |
| `vitest`                          | 5.0.2 (`latest`), 4.1.11 (`V4` tag), 3.2.7 (`V3` tag) | –                                                               | –                                               | 2026-09-25 |

Source: `npm view <pkg> version peerDependencies dependencies dist-tags time.modified`.

`packages/vitest-plugin/package.json` on `main` still has `"vitest": "^4.1.0"` ([source](https://github.com/cloudflare/workers-sdk/blob/main/packages/vitest-plugin/package.json)). PR #15500 ("Support Vitest 5 … while retaining support for Vitest 4.1.11 … This is a major release because the plugin now requires Workerd's new module registry") is **open, not merged** as of today. Expect a `@cloudflare/vitest-plugin@2.x` when it lands. Flagged: do not build on vitest 5 until that release ships.

Hard prerequisites from the docs: "The `@cloudflare/vitest-plugin` package requires Vitest 4.1 or later", `compatibility_date` `2022-10-31` or later, ES-modules Worker. Source: [Write your first test](https://developers.cloudflare.com/workers/testing/vitest-integration/write-your-first-test/).

### 1.2 Install and `vitest.config.ts` (current, plugin form)

Install (docs, verbatim for bun): `bun add -d vitest@^4.1.0 @cloudflare/vitest-plugin`.

```ts
// apps/api/vitest.config.ts  (verbatim from docs)
import { cloudflareTest } from "@cloudflare/vitest-plugin"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
    }),
  ],
})
```

Documented `cloudflareTest()` options ([Configuration](https://developers.cloudflare.com/workers/testing/vitest-integration/configuration/)):

- `wrangler: { configPath?: string; environment?: string }` — "Path to Wrangler configuration file to load main, compatibility settings and bindings from". Accepts `.toml` and `.json`/`.jsonc`.
- `main?: string` — "Entry point to Worker run in the same isolate/context as tests"; auto-read from the Wrangler config when `wrangler.configPath` is set.
- `miniflare?: SourcelessWorkerOptions & { workers?: WorkerOptions[] }` — Miniflare overrides; merged with Wrangler values and "`miniflare` takes precedence". This is where `hyperdrives`, `queueConsumers`, `compatibilityFlags`, etc. can be overridden.
- Dynamic form: pass an async function `cloudflareTest(({ inject }) => ({...}))` to read values provided by a `globalSetup` script (used by the Hyperdrive fixture to inject a port).

Not documented as options on the new plugin: `singleWorker`, `isolatedStorage` (uncertain whether they still exist; the docs' known-issues page mentions a "shared storage mode (`--max-workers=1 --no-isolate`)" via Vitest CLI flags instead). Flagged as uncertain.

In a Turborepo where root vitest uses workspace projects, the official fixtures use `defineProject` + `mergeConfig` (verbatim from `fixtures/vitest-plugin-examples/workflows/vitest.config.ts`):

```ts
import { cloudflareTest } from "@cloudflare/vitest-plugin"
import { defineProject, mergeConfig } from "vitest/config"
import configShared from "../../../vitest.shared"

export default mergeConfig(
  configShared,
  defineProject({
    plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
  })
)
```

Source: [workers-sdk fixtures/vitest-plugin-examples/workflows](https://github.com/cloudflare/workers-sdk/tree/main/fixtures/vitest-plugin-examples/workflows). Caveat for us: the root uses vitest 5 and the API app needs vitest 4 — a root-level Vitest "projects" setup will not work across two majors. Run the API tests with its own vitest binary via Turborepo `test` task instead. (Inference, not from docs.)

Legacy shape, for reference only (`@cloudflare/vitest-pool-workers`): `defineWorkersConfig({ test: { poolOptions: { workers: { wrangler: { configPath: "./wrangler.jsonc" } } } } })`. Migration is a rename: package name `@cloudflare/vitest-pool-workers` → `@cloudflare/vitest-plugin`, tsconfig types `@cloudflare/vitest-pool-workers/types` → `@cloudflare/vitest-plugin/types`, and a codemod is provided. Source: [Migrate to Vitest plugin](https://developers.cloudflare.com/workers/testing/vitest-integration/migration-guides/migrate-to-vitest-plugin/). Note the migration page does not show `defineWorkersConfig` → `cloudflareTest()` before/after; that config change is implied by the get-started page.

### 1.3 tsconfig for tests (verbatim from docs)

```jsonc
// test/tsconfig.json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "moduleResolution": "bundler",
    "types": ["@cloudflare/vitest-plugin/types"],
  },
  "include": ["./**/*.ts", "../src/worker-configuration.d.ts"],
}
```

Source: [Write your first test](https://developers.cloudflare.com/workers/testing/vitest-integration/write-your-first-test/).

### 1.4 `env`, `SELF` / `exports`, request tests

Current docs import `env` from **`cloudflare:workers`** (not `cloudflare:test`). The plugin's type declarations still export `env` and `SELF` from `cloudflare:test` but both are marked `@deprecated` ("use `import { env } from "cloudflare:workers"`" and "use `import { exports } from "cloudflare:workers"`"). Source: [packages/vitest-plugin/types/cloudflare-test.d.ts](https://github.com/cloudflare/workers-sdk/blob/main/packages/vitest-plugin/types/cloudflare-test.d.ts).

Unit test (verbatim, docs):

```ts
import { env } from "cloudflare:workers"
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test"
import { describe, it, expect } from "vitest"
import worker from "../src"

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>

describe("Hello World worker", () => {
  it("responds with Hello World!", async () => {
    const request = new IncomingRequest("http://example.com/404")
    const ctx = createExecutionContext()
    const response = await worker.fetch(request, env, ctx)
    await waitOnExecutionContext(ctx)
    expect(response.status).toBe(404)
    expect(await response.text()).toBe("Not found")
  })
})
```

Integration test (verbatim, docs) — this is the replacement for `SELF.fetch()`:

```ts
import { exports } from "cloudflare:workers"
import { describe, it, expect } from "vitest"

describe("Hello World worker", () => {
  it("responds with not found and proper status for /404", async () => {
    const response = await exports.default.fetch("http://example.com/404")
    expect(response.status).toBe(404)
    expect(await response.text()).toBe("Not found")
  })
})
```

Docs note: "When using `exports.default.fetch()` for integration tests, your Worker code runs in the same context as the test runner. This means you can use global mocks to control your Worker, but also means your Worker uses the subtly different module resolution behavior provided by Vite." Also: `exports` "does not expose Assets" ([Test APIs](https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/)).

Full `cloudflare:test` export list (from the `.d.ts`): `runInDurableObject`, `runDurableObjectAlarm`, `evictDurableObject`, `listDurableObjectIds`, `reset`, `abortAllDurableObjects`, `evictAllDurableObjects`, `createExecutionContext`, `waitOnExecutionContext`, `createScheduledController`, `createMessageBatch`, `getQueueResult`, `applyD1Migrations`, `adminSecretsStore`, `introspectWorkflowInstance`, `introspectWorkflow`, `createPagesEventContext`, plus deprecated `env`, `SELF`. `fetchMock` is gone; outbound request mocking now points to `@msw/cloudflare` ([Recipes](https://developers.cloudflare.com/workers/testing/vitest-integration/recipes/)).

### 1.5 Hyperdrive in Vitest

Supported. Evidence:

- Official recipe: "Tests using Hyperdrive with a Vitest managed TCP server" — [fixtures/vitest-plugin-examples/hyperdrive](https://github.com/cloudflare/workers-sdk/tree/main/fixtures/vitest-plugin-examples/hyperdrive).
- Fixture `wrangler.jsonc` (verbatim):

```jsonc
{
  "name": "hyperdrive",
  "main": "src/index.ts",
  // don't provide compatibility_date so that vitest will infer the latest one
  "hyperdrive": [
    {
      "binding": "ECHO_SERVER_HYPERDRIVE",
      "id": "00000000000000000000000000000000",
      "localConnectionString": "postgres://user:pass@127.0.0.1/db", // Overridden in `vitest.config.mts`
    },
  ],
}
```

- Fixture `vitest.config.ts` (verbatim) — overrides the connection string with a port injected from `globalSetup`:

```ts
import { cloudflareTest } from "@cloudflare/vitest-plugin"
import { defineProject, mergeConfig } from "vitest/config"
import configShared from "../../../vitest.shared"

export default mergeConfig(
  configShared,
  defineProject({
    plugins: [
      cloudflareTest(({ inject }) => {
        // Provided in `global-setup.ts`
        const echoServerPort = inject("echoServerPort")
        return {
          miniflare: {
            hyperdrives: {
              ECHO_SERVER_HYPERDRIVE: `postgres://user:pass@127.0.0.1:${echoServerPort}/db`,
            },
          },
          wrangler: { configPath: "./wrangler.jsonc" },
        }
      }),
    ],
    test: { globalSetup: ["./global-setup.ts"] },
  })
)
```

- How `localConnectionString` reaches Miniflare: the plugin calls `wrangler.unstable_getMiniflareWorkerOptions(config, environment, …)` ([config.ts](https://github.com/cloudflare/workers-sdk/blob/main/packages/vitest-plugin/src/pool/config.ts)), and Wrangler maps each hyperdrive binding as `[hyperdrive.binding, hyperdrive.localConnectionString ?? ""]` into Miniflare's `hyperdrives` ([packages/wrangler/src/dev/miniflare/index.ts](https://github.com/cloudflare/workers-sdk/blob/main/packages/wrangler/src/dev/miniflare/index.ts), `hyperdriveEntry`).
- **Env var in tests — flagged:** `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_<BINDING>` is applied by `applyHyperdriveEnvVars()` in [packages/wrangler/src/dev.ts](https://github.com/cloudflare/workers-sdk/blob/main/packages/wrangler/src/dev.ts) (the `wrangler dev` path). A repo-wide code search for that string returns only `wrangler/src/dev.ts`, `workers-utils/.../factory.ts`, a vite-plugin playground `.env`, and wrangler e2e tests — nothing in `packages/vitest-plugin`. Conclusion (inference from source, not documented): in Vitest, set the DB URL either in `wrangler.jsonc` `localConnectionString` or via `miniflare.hyperdrives` in `cloudflareTest()` (e.g. read `process.env.DATABASE_URL` in `vitest.config.ts`). Don't rely on the `CLOUDFLARE_HYPERDRIVE_…` env var for tests.
- Local semantics: "When using `localConnectionString`, Hyperdrive's connection pooling and query caching do not take effect. Your Worker connects directly to the database without going through Hyperdrive." Source: [Hyperdrive local development](https://developers.cloudflare.com/hyperdrive/configuration/local-development/).
- Test isolation caveat (inference): the plugin's per-test isolated storage covers KV/R2/D1/DO/cache; an external Postgres is not rolled back between tests. Plan for truncation/transaction discipline in the test suite.

### 1.6 Queues in Vitest

Supported, two modes (official fixture [fixtures/vitest-plugin-examples/queues](https://github.com/cloudflare/workers-sdk/tree/main/fixtures/vitest-plugin-examples/queues)):

Unit (call the handler directly; verbatim from `queue-consumer-unit.test.ts`):

```ts
import {
  createExecutionContext,
  createMessageBatch,
  getQueueResult,
  type MessageBatchMessage,
} from "cloudflare:test"
import { env } from "cloudflare:workers"
import worker from "../src/index"

const batch = createMessageBatch("queue", messages)
const ctx = createExecutionContext()
await worker.queue(batch, env, ctx)
// `getQueueResult()` implicitly calls `waitOnExecutionContext()`
const result = await getQueueResult(batch, ctx)
expect(result.outcome).toBe("ok")
expect(result.ackAll).toBe(false)
expect(result.explicitAcks).toStrictEqual([messages[0].id, messages[1].id])
```

Signatures: `createMessageBatch<Body = unknown>(queueName: string, messages: MessageBatchMessage<Body>[]): MessageBatch<Body>`; `getQueueResult(batch: MessageBatch, ctx: ExecutionContext): Promise<QueueResult>` ([cloudflare-test.d.ts](https://github.com/cloudflare/workers-sdk/blob/main/packages/vitest-plugin/types/cloudflare-test.d.ts)).

Integration (`exports.default.queue("queue", messages)`) requires the **experimental** `service_binding_extra_handlers` compat flag, which "cannot be enabled in production" (fixture `vitest.config.ts` comment). The fixture config (verbatim):

```ts
cloudflareTest({
  miniflare: {
    // Required to use `exports.default.queue()`. This is an experimental
    // compatibility flag, and cannot be enabled in production.
    compatibilityFlags: ["service_binding_extra_handlers"],
    // Use a shorter `max_batch_timeout` in tests
    queueConsumers: { queue: { maxBatchTimeout: 0.05 /* 50ms */ } },
  },
  wrangler: { configPath: "./wrangler.jsonc" },
})
```

workerd defines the flag as `$experimental` ("Allows service bindings to call additional event handler methods on the target Worker. Initially only includes support for calling the queue() handler.") — [compatibility-date.capnp](https://github.com/cloudflare/workerd/blob/main/src/workerd/io/compatibility-date.capnp). It is not listed on the public compatibility-flags page. Producer→consumer end-to-end also works: the fixture `queue-producer-integration-self.test.ts` POSTs via `exports.default.fetch`, then `vi.waitUntil`s on the consumer's side effect.

Local `wrangler dev` limitation: "Consumer concurrency is not supported while running locally" and Queues are not supported in `wrangler dev --remote` ([Queues local development](https://developers.cloudflare.com/queues/configuration/local-development/)).

### 1.7 Workflows in Vitest

Supported via `introspectWorkflow(workflow)` / `introspectWorkflowInstance(workflow, instanceId)` from `cloudflare:test`, with `modify`/`modifyAll` exposing `disableSleeps`, `disableRetryDelays`, `mockStepResult`, `mockStepError`, `forceStepTimeout`, `mockEvent`, `forceEventTimeout`, and `waitForStepResult`, `waitForStatus`, `getOutput`, `getError`, `dispose` (supports `await using`). Source: [Test APIs](https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/), fixture [fixtures/vitest-plugin-examples/workflows](https://github.com/cloudflare/workers-sdk/tree/main/fixtures/vitest-plugin-examples/workflows). Fixture `wrangler.jsonc` (verbatim):

```jsonc
{
  "name": "workflows",
  "main": "src/index.ts",
  "workflows": [
    {
      "binding": "MODERATOR",
      "class_name": "ModeratorWorkflow",
      "name": "moderator-workflow",
    },
  ],
}
```

Unit example (verbatim excerpt from `unit.test.ts`):

```ts
import { introspectWorkflowInstance } from "cloudflare:test"
import { env } from "cloudflare:workers"

const instanceId = crypto.randomUUID()
await using instance = await introspectWorkflowInstance(
  env.MODERATOR,
  instanceId
)
await instance.modify(async (m) => {
  await m.disableSleeps()
  await m.mockStepResult({ name: STEP_NAME }, mockResult)
})
await env.MODERATOR.create({ id: instanceId })
expect(await instance.waitForStepResult({ name: STEP_NAME })).toEqual(
  mockResult
)
await expect(instance.waitForStatus("complete")).resolves.not.toThrow()
```

### 1.8 Node-compat / compatibility_date caveats

- All three official fixtures omit `compatibility_date` "so that vitest will infer the latest one". For a deployable Worker we must set it explicitly.
- `nodejs_compat`: "For compatibility dates of `2026-08-04` or later, Workers enables both `nodejs_compat` and `nodejs_compat_v2` by default." Latest listed compatibility date on the flags page is **2026-09-08**; the Wrangler config sample uses `2026-09-26`. Sources: [Compatibility flags](https://developers.cloudflare.com/workers/configuration/compatibility-flags/), [Node.js compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/), [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/).
- Recommendation: `compatibility_date: "2026-09-08"` (or later) and still list `compatibility_flags: ["nodejs_compat"]` explicitly for clarity — harmless and matches the Hyperdrive Postgres docs.
- When using `nodejs_compat`, tsconfig `types` should include `"node"` and `@types/node` must be installed ([TypeScript](https://developers.cloudflare.com/workers/languages/typescript/)).
- Known issues page (no Hyperdrive/Queues/Workflows entries): no native V8 coverage (use Istanbul); fake timers don't affect KV/R2/cache simulators; dynamic `import()` fails inside `export default {}` handlers; WebSocket + DO needs `--max-workers=1 --no-isolate`; always `await` storage ops and fully consume `fetch()` bodies; use `deps.optimizer` for ESM resolution problems. Source: [Known issues](https://developers.cloudflare.com/workers/testing/vitest-integration/known-issues/).
- Global setup runs in Node, not workerd (fixture `global-setup.ts` comment) — good place to run migrations against the test Postgres.

---

## 2. `wrangler` 4.x

Latest: `wrangler@4.141.0` (2026-09-25), engines `node >=22.0.0`, peer `@cloudflare/workers-types ^5.20260925.1`. Source: `npm view wrangler`.

### 2.1 `wrangler.jsonc` shape (from [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/), [Workflows API](https://developers.cloudflare.com/workflows/build/workers-api/), [Hyperdrive local dev](https://developers.cloudflare.com/hyperdrive/configuration/local-development/))

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "api",
  "main": "./src/index.ts",
  "compatibility_date": "2026-09-08",
  "compatibility_flags": ["nodejs_compat"],
  "vars": { "API_HOST": "example.com" },
  "hyperdrive": [
    {
      "binding": "HYPERDRIVE",
      "id": "<hyperdrive-config-id>",
      "localConnectionString": "postgres://user:password@localhost:5432/databasename",
    },
  ],
  "queues": {
    "producers": [
      {
        "binding": "<BINDING_NAME>",
        "queue": "<QUEUE_NAME>",
        "delivery_delay": 60,
      },
    ],
    "consumers": [
      {
        "queue": "my-queue",
        "max_batch_size": 10,
        "max_batch_timeout": 30,
        "max_retries": 10,
        "dead_letter_queue": "my-queue-dlq",
        "max_concurrency": 5,
        "retry_delay": 120,
      },
    ],
  },
  "workflows": [
    {
      "name": "my-workflow",
      "binding": "MY_WORKFLOW",
      "class_name": "MyWorkflow",
    },
    // optional "script_name": "<WORKER_NAME>" when the class lives in another Worker
  ],
}
```

Field notes (docs): `main` and `compatibility_date` required; `vars`, `hyperdrive`, `queues`, `workflows` are non-inheritable (must be re-declared per `env.*`). `hyperdrive[].binding` and `.id` required; `queues.producers[].binding`/`.queue` required, `delivery_delay` optional; `workflows[].binding`/`.name`/`.class_name` required, `script_name` optional. The `$schema` line is my addition (standard Wrangler pattern, not quoted from the page).

### 2.2 `wrangler dev` and Hyperdrive locally

- Local dev needs a connection string: either `localConnectionString` in config or the env var `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_<BINDING_NAME>` (docs example: `export CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="postgres://user:password@localhost:5432/databasename"` then `npx wrangler dev`). Env var wins over the config value; the older `WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_*` prefix is deprecated. If neither is set in local mode, Wrangler throws: "When developing locally, you should use a local Postgres connection string to emulate Hyperdrive functionality…". Sources: [Hyperdrive local development](https://developers.cloudflare.com/hyperdrive/configuration/local-development/), [System environment variables](https://developers.cloudflare.com/workers/wrangler/system-environment-variables/), [wrangler/src/dev.ts](https://github.com/cloudflare/workers-sdk/blob/main/packages/wrangler/src/dev.ts).
- Pooling/caching are bypassed locally (see 1.5).
- Relevant `wrangler dev` flags (from `wrangler@4.141.0 dev --help`): `-c, --config`, `-e, --env` ("Environment to use for operations, and for selecting .env and .dev.vars files"), `--env-file` (repeatable), `-l, --local`, `-r, --remote`, `--persist-to` (defaults to `.wrangler/state`), `--types` ("Generate types from your Worker configuration").

### 2.3 Secrets for dev (`.dev.vars`)

- Put secrets in `.dev.vars` (or `.env`) next to the Wrangler config, dotenv syntax; "Choose to use either `.dev.vars` or `.env` but not both."
- Per-environment: `.dev.vars.<environment-name>`; "When `.dev.vars.<environment-name>` exists then only this will be loaded; the `.dev.vars` file will not be loaded."
- Production: `npx wrangler secret put <KEY>` ("creates a new version of the Worker and deploys it immediately"); `wrangler versions secret put` for gradual deployments; bulk via `--secrets-file` on `wrangler deploy` / `wrangler versions upload` (up to 100 per version).
- Controls: `CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV` (default true) and `CLOUDFLARE_INCLUDE_PROCESS_ENV`.
- Source: [Secrets](https://developers.cloudflare.com/workers/configuration/secrets/), [workers-utils factory.ts](https://github.com/cloudflare/workers-sdk/blob/main/packages/workers-utils/src/environment-variables/factory.ts).
- Hono note: access via `c.env.SECRET_KEY`, not `process.env` ([Hono Workers guide](https://hono.dev/docs/getting-started/cloudflare-workers)).

---

## 3. Hono on Workers

Latest `hono@4.13.9` (2026-09-24), engines `node >=16.9.0`. Source: `npm view hono`.

### 3.1 Minimal app with typed bindings (verbatim, [Hono Workers guide](https://hono.dev/docs/getting-started/cloudflare-workers))

```ts
import { Hono } from "hono"

type Bindings = {
  MY_BUCKET: R2Bucket
  USERNAME: string
  PASSWORD: string
}

const app = new Hono<{ Bindings: Bindings }>()
app.get("/", (c) => c.text("Hello Cloudflare Workers!"))
export default app
```

Binding types can be generated with `wrangler types --env-interface CloudflareBindings` and then used as `new Hono<{ Bindings: CloudflareBindings }>()` (Hono docs).

### 3.2 Exporting `fetch` + `queue` + a Workflow class from one module

Hono's documented module-worker shape (verbatim):

```ts
export default {
  fetch: app.fetch,
  scheduled: async (batch, env) => {},
  queue: async (batch, env) => {},
}
```

`app.fetch` signature: `fetch(request: Request, env: Env, ctx: ExecutionContext)` ([Hono App API](https://hono.dev/docs/api/hono)).

Combining with Cloudflare's patterns (Workflows class is a named export; `satisfies ExportedHandler` recommended by the Queues fixture):

```ts
// apps/api/src/index.ts — composed from Hono + Cloudflare docs; not a verbatim snippet
import { Hono } from "hono"
import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers"

const app = new Hono<{ Bindings: Env }>()

export class MyWorkflow extends WorkflowEntrypoint<Env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    /* steps */
  }
}

export default {
  fetch: app.fetch,
  async queue(batch, env, ctx) {
    for (const message of batch.messages) {
      /* ... */ message.ack()
    }
  },
} satisfies ExportedHandler<Env, QueueMessage>
```

Fixture comment on `satisfies`: "Using `satisfies` provides type checking/completions for `ExportedHandler` whilst still allowing us to call `worker.fetch()` and `worker.queue()` in tests without asserting they're defined." ([queues/src/index.ts](https://github.com/cloudflare/workers-sdk/blob/main/fixtures/vitest-plugin-examples/queues/src/index.ts)). Workflow class export alongside `export default { fetch }` is exactly what the Workflows fixture does ([workflows/src/index.ts](https://github.com/cloudflare/workers-sdk/blob/main/fixtures/vitest-plugin-examples/workflows/src/index.ts)).

### 3.3 `app.request()` vs `exports.default.fetch()` (ex-`SELF.fetch()`)

- `app.request(path | Request, init?, env?)` — Hono's in-process test helper; third arg is the bindings object, e.g. `await app.request('/posts', {}, MOCK_ENV)` ([Hono testing guide](https://hono.dev/docs/guides/testing)). Inside the Workers pool you can pass the real `env` from `cloudflare:workers`, which gives real Hyperdrive/Queue/Workflow bindings but bypasses the module-worker export (no `ctx.waitUntil` draining unless you build a context with `createExecutionContext` and call `app.fetch(req, env, ctx)` directly).
- `exports.default.fetch()` — goes through the Worker's actual default export (routes, `ctx`, `waitUntil` all real), which is the docs' recommended integration path; Hono itself says Cloudflare recommends "using Vitest with @cloudflare/vitest-pool-workers" for Workers testing (Hono docs still name the old package).
- Recommendation: route tests via `exports.default.fetch()`; use `app.request()` only for pure handler/middleware tests without bindings.

---

## 4. Workflows and Queues runtime APIs

### 4.1 Workflows ([Workers API](https://developers.cloudflare.com/workflows/build/workers-api/))

```ts
export class MyWorkflow extends WorkflowEntrypoint<Env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    // Steps here
  }
}
```

- `run(event: WorkflowEvent<T>, step: WorkflowStep): Promise<T>`.
- `step.do(name, callback)` and `step.do(name, config?: WorkflowStepConfig, callback)`; `WorkflowStepConfig` = `{ retries: { limit: number; delay: string | number | WorkflowDelayFunction; backoff?: "constant" | "linear" | "exponential" }; timeout?: string | number }`. Callback return must be `RpcSerializable`.
- `step.sleep(name, duration)`, `step.waitForEvent<T>(name, { type, timeout })`, `throw new NonRetryableError(message, name?)` to stop retries.
- Trigger: `await env.MY_WORKFLOW.create({ id, params: { hello: "world" } })`; batch: `env.MY_WORKFLOW.createBatch([{ id, params }, …])`; `env.MY_WORKFLOW.get(id)` then `instance.status()` → `{ status, error?, output? }`, `instance.terminate()`.

### 4.2 Queues consumer/producer ([JavaScript APIs](https://developers.cloudflare.com/queues/configuration/javascript-apis/))

- Consumer: `async queue(batch: MessageBatch, env: Env, ctx: ExecutionContext): Promise<void>`.
- `Message`: `id: string`, `timestamp: Date`, `body: unknown` (structured-clone-able, <128 KB), `attempts: number` (starts at 1); `ack(): void`, `retry(options?: { delaySeconds?: number }): void`.
- `MessageBatch`: `queue: string`, `messages: readonly Message[]`, `ackAll()`, `retryAll(options?)`.
- Producer: `send(body, options?: QueueSendOptions)`, `sendBatch(messages: MessageSendRequest[], options?)`; `MessageSendRequest = { body; contentType?: "text" | "bytes" | "json" | "v8"; delaySeconds?: number /* 0–86400 */ }`.
- Typing: `satisfies ExportedHandler<Env, MessageType>`.

### 4.3 Postgres driver via Hyperdrive ([Connect to Postgres](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/))

- Recommended driver: node-postgres `pg@>=8.16.3` (or `postgres@>3.4.5`); needs `nodejs_compat` and `compatibility_date >= 2024-09-23` (auto-on for dates ≥ 2026-08-04).
- `const client = new Client({ connectionString: env.HYPERDRIVE.connectionString })`. Create per request; the page shown did not include an explicit `ctx.waitUntil(client.end())` — flagged as unverified on this fetch (it has been in earlier versions of the page; verify at implementation time).
- Hyperdrive binding also exposes `.connect()` (raw TCP socket) — used by the Vitest fixture.

---

## 5. Deploying and types

### 5.1 Deploy

- `wrangler deploy` — "Deploy your Worker to Cloudflare." Flags: `--dry-run` ("Compile a project without actually deploying to live servers"), `--config`, `--env`. Auth: interactive `wrangler login`, or for CI `CLOUDFLARE_API_TOKEN` ("can be used for authentication for situations like CI/CD") + `CLOUDFLARE_ACCOUNT_ID`. Sources: [Workers commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/), [System environment variables](https://developers.cloudflare.com/workers/wrangler/system-environment-variables/).
- Real Hyperdrive `id`, Queue, and Workflow resources must exist in the account before deploy (Hyperdrive config is created in the dashboard/`wrangler hyperdrive create`; not detailed here).

### 5.2 `wrangler types` (from `wrangler@4.141.0 types --help`, matches [TypeScript docs](https://developers.cloudflare.com/workers/languages/typescript/))

```
wrangler types [path]                 # default: worker-configuration.d.ts
  --env-interface  <name>             # default "Env"
  --include-runtime  [boolean]        # default true — runtime (global) types for your compatibility settings
  --include-env      [boolean]        # default true
  --strict-vars      [boolean]        # default true — literal/union types for vars
  --check                             # verify committed file is up to date (CI)
  -c, --config / -e, --env / --env-file
```

Docs: run after any config change; recommended tsconfig `"types": ["./worker-configuration.d.ts"]` (add `"node"` + `@types/node` with `nodejs_compat`). `@cloudflare/workers-types` (latest `5.20260926.1`) is still published ("no plans to stop") and "the recommended way to type libraries and shared packages", but for the Worker itself use `wrangler types`. `wrangler dev --types` and `wrangler types --check` exist for keeping it fresh.

### 5.3 Conflict with DOM lib types in a monorepo with Next.js

- Mechanism: with `--include-runtime` (default true) the generated file redeclares global `Request`, `Response`, `Body`, `fetch`, etc. for workerd. If the same TypeScript program also includes `lib: ["dom"]` (Next.js), the two global declarations collide/merge — the widely reported symptom is `Body#json()` becoming `Promise<unknown>` (Workers) vs `Promise<any>` (DOM), breaking `await req.json()` narrowing in Next Route Handlers. Primary evidence for the mechanism: the `--include-runtime` flag definition ("Whether to generate runtime types based on compatibility settings") in the Wrangler CLI/docs; the symptom description comes from a **secondary** source ([dev.to, Sept 2026](https://dev.to/hirodeath/when-wrangler-generated-types-collide-with-nextjs-dom-types-242d)) and a Cloudflare Discord thread ("workers-types and wrangler types cannot coexist in monorepo without breaking ENV type", [answeroverflow](https://www.answeroverflow.com/m/1427991274341929061), which I could not fetch — rate limited). Treat as credible but unverified against Cloudflare docs.
- Mitigation that follows from primary sources:
  1. Keep the generated `worker-configuration.d.ts` **inside `apps/api`** with its own `tsconfig.json` (`"types": ["./worker-configuration.d.ts", "node"]`, no `dom` lib). Next.js `apps/web` must not `include` that file and must not use a shared root tsconfig that pulls it in.
  2. If a shared package needs the `Env` shape only, generate `wrangler types ./env.d.ts --include-runtime=false` for that consumer and type bindings with `@cloudflare/workers-types` imports (`import type { Hyperdrive, Queue, Workflow } from "@cloudflare/workers-types"`) rather than globals. (The dev.to article reports that `--include-runtime=false` alone then leaves binding names like `D1Database` unresolved, which is why the explicit type imports are needed.)
  3. Don't put `@cloudflare/workers-types` in a root-level `types` array; it also declares the same globals.
- This is consistent with the docs' own tsconfig guidance (`types` scoped per package, `moduleResolution: bundler` for the test tsconfig).

---

## Open items / uncertainties (explicit)

1. Vitest 5 support timing for `@cloudflare/vitest-plugin` — PR open, unmerged. Until then `apps/api` pins `vitest@^4.1.0` separately from the root's `^5.0.2`.
2. Whether `isolatedStorage` / `singleWorker` still exist as plugin options — not on the current Configuration page.
3. `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_*` is not honored by the Vitest plugin — conclusion from code search, not from docs.
4. `service_binding_extra_handlers` is experimental and undocumented on the public flags page; only needed for `exports.default.queue()` integration tests, not for the unit-style `createMessageBatch` path.
5. `ctx.waitUntil(client.end())` for `pg` — not present in the fetched page content; verify before shipping the DB helper.
6. DOM-lib conflict details are from secondary sources; the mitigation is derived from primary CLI/docs semantics.
7. Hono's docs still reference `@cloudflare/vitest-pool-workers`; Cloudflare's current package is `@cloudflare/vitest-plugin`.
