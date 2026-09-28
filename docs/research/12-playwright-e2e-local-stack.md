# Playwright e2e against the local stack: layout, OpenRouter stub seam, database, CI, auth

Researched 2026-09-29 against Playwright docs (source markdown on `microsoft/playwright@main`, rendered at playwright.dev; npm `latest` is `@playwright/test@1.63.0`), developers.cloudflare.com (raw `index.md` pages), the Next.js 16.3.3 docs bundled at `node_modules/.bun/next@16.3.3+bf16f8eded5e12ee/node_modules/next/dist/docs` (shortened to `next-docs/` below), Turborepo, Bun and GitHub docs, and this repo at `feat/design-foundation` (26eb1fc). Two wrangler behaviours were checked by experiment with the repo's wrangler 4.141.0 in a scratch worker. Discussion input, not decisions. Anything inferred rather than read is marked **[inference]**.

## Summary

- **Layout.** Use a new workspace, `apps/e2e`, with `@playwright/test`, `playwright.config.ts`, `tests/` and a small stub server. Run it through a root `e2e` script, the same way `db:migrate` runs, not through `turbo test`.
- **Stub seam.** `packages/ai` hardcodes `const BASE_URL = "https://openrouter.ai/api/v1"` (`packages/ai/src/index.ts:63`), and nothing can override it. Add an optional `baseUrl` to `OpenRouterOptions`. Add an `OPENROUTER_BASE_URL` Worker var whose value in `apps/api/wrangler.jsonc` is the real URL. For e2e only, override it with `wrangler dev --var OPENROUTER_BASE_URL:http://localhost:8790/api/v1`.
- **Stub server.** The existing stub's request handling cannot run as a server as-is, because it is wired into `vi.spyOn(globalThis, "fetch")`. Its handlers are pure, though. Move the `Request → Response` handler into a package, so the Vitest spy and a `Bun.serve` e2e server both reuse it.
- **Ports.** Run the e2e stack on its own ports (web 3100, api 8797, stub 8790), not :3000 and :8787. `reuseExistingServer` would otherwise silently reuse a developer's `bun run dev` stack, which uses the real OpenRouter and the dev database. Next 16 also refuses a second `next dev` in the same project.

---

## Q1. Playwright setup in this Bun + Turborepo monorepo

### Package, runtime and browser install

- The package is `@playwright/test`. The system requirement is "Node.js: latest 22.x, 24.x or 26.x" (https://playwright.dev/docs/intro#system-requirements). Bun is not listed.
- The CLI has a `#!/usr/bin/env node` shebang (`packages/playwright-test/cli.js` on `main`). Bun docs: "By default, Bun respects shebangs … Bun spins up a `node` process", unless `--bun` is passed (https://bun.com/docs/pm/bunx#shebangs). So `bunx playwright test` runs the runner on Node, the supported runtime. **Do not pass `--bun`.**
- The repo already relies on this pattern: `apps/api` runs `bun --env-file=../../.env run vitest run` (`apps/api/package.json`). That works because the env file reaches the Node child process, and the Vitest global setup then reads `DATABASE_ADMIN_URL` (`apps/api/test/global-setup.ts`, `packages/db/src/migrate.ts`).
- Chromium only, with OS deps: `playwright install --with-deps chromium` (https://playwright.dev/docs/browsers#install-system-dependencies).
- For headless-only runs (the default when no `channel` is set, which is typical on CI), `--only-shell` skips downloading the full Chromium build and installs only the headless shell (https://playwright.dev/docs/browsers#chromium-headless-shell). Local headed debugging (`--headed`, UI mode) needs the full build, so install plain `chromium` locally and `--only-shell` on CI **[inference]**.

### Where it lives: `apps/e2e`, not `apps/web`

| Constraint                                                                                                                                                                                                                                       | Consequence                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web-never-touches-db-or-ai`: web may not reach `packages/(db\|ai)` (`.dependency-cruiser.cjs`, `layering.web`).                                                                                                                                 | e2e setup must reset the database (`@workspace/db/migrate`) and run the stub (from `packages/ai`). Inside `apps/web`, both would break the web boundary.                                                                                     |
| `no-imports-from-apps`: nothing imports from `apps/` (`.dependency-cruiser.cjs`).                                                                                                                                                                | e2e cannot import `apps/api/test/support/openrouter-stub.ts`. The reusable part has to move into a package (Q2).                                                                                                                             |
| Layering rules are keyed by workspace basename (`const workspace = basename(process.cwd())`).                                                                                                                                                    | A workspace named `e2e` gets the generic rules only. That is correct: it drives the whole stack from outside.                                                                                                                                |
| `apps/web` Vitest includes `**/*.test.{ts,tsx}` (`apps/web/vitest.config.ts`).                                                                                                                                                                   | Playwright files inside web would need a `*.spec.ts` naming split to avoid Vitest collecting them. A separate workspace avoids this entirely.                                                                                                |
| Root `workspaces: ["apps/*", "packages/*"]` (`package.json`).                                                                                                                                                                                    | `apps/e2e` is picked up automatically.                                                                                                                                                                                                       |
| Turborepo Strict Mode (default) filters a task's env down to `env`/`globalEnv`/pass-through keys (https://turborepo.com/docs/crafting-your-repository/using-environment-variables#strict-mode). `turbo.json` passes through only `DATABASE_URL`. | Running e2e under `turbo` would strip `DATABASE_ADMIN_URL` unless it is declared. Either add `"e2e": { "cache": false, "passThroughEnv": [...] }` or, more simply, add a root `"e2e": "bun run --cwd apps/e2e e2e"`, mirroring `db:migrate`. |

`apps/e2e` should define `lint`, `typecheck` and `lint:boundaries` so `bun run check` covers it. It should **not** define `test`, so `turbo test` (the `check` job) never starts browsers.

Proposed tree:

```
apps/e2e/
  package.json            # @playwright/test, @workspace/ai, @workspace/db; scripts: e2e, lint, typecheck, lint:boundaries
  playwright.config.ts
  src/openrouter-stub-server.ts   # Bun.serve around the shared handler (Q2)
  src/reset-database.ts           # createFreshDatabase("second_brain_e2e")
  tests/fixtures.ts               # worker-scoped account fixture (Q5)
  tests/*.spec.ts
```

`e2e` script: `bun src/reset-database.ts && playwright test`. Run it from the root with `bun --env-file=../../.env run …`, the same pattern as `apps/api`.

### `webServer` array: three servers

From https://playwright.dev/docs/test-webserver and `TestConfig.webServer` (https://playwright.dev/docs/api/class-testconfig#test-config-web-server):

- An array launches several servers. **With an array, `use.baseURL` must be set explicitly.**
- `url` is ready when it returns "2xx, 3xx, 400, 401, 402, or 403". `timeout` defaults to 60000 ms. `cwd` defaults to the config's directory. `env` defaults to `process.env` plus `PLAYWRIGHT_TEST=1`.
- `reuseExistingServer: !process.env.CI` is the documented idiom. With `false`, Playwright "will throw if an existing process is listening".
- `gracefulShutdown: { signal: 'SIGTERM', timeout }` replaces the default process-group `SIGKILL`. `stdout` defaults to `"ignore"`, and `DEBUG=pw:webserver` shows it.
- GitHub Actions always sets `CI=true` (https://docs.github.com/en/actions/reference/workflows-and-actions/variables).

Readiness URLs in this repo:

- **API:** `GET /health` is mounted before auth. It returns 200, or 503 when the database is unreachable (`apps/api/src/index.ts:27`, `apps/api/src/lib/health.ts`). A 503 does not count as ready, so readiness also proves Postgres is reachable.
- **Web:** `/sign-in`.
- **Stub:** any path. The stub answers 401 without a key, and 401 counts as ready. A `/health` route is clearer.

Sketch (the ports are the recommendation below):

```ts
const ports = { web: 3100, api: 8797, stub: 8790 }
const e2eDatabaseUrl = databaseUrlNamed("second_brain_e2e") // DATABASE_ADMIN_URL with the path swapped, as createFreshDatabase does

webServer: [
  { name: "stub", command: "bun src/openrouter-stub-server.ts", url: `http://localhost:${ports.stub}/health`,
    reuseExistingServer: !process.env.CI },
  { name: "api", cwd: "../api",
    command: [
      `bunx wrangler dev --port ${ports.api} --persist-to .wrangler/e2e-state --show-interactive-dev-session=false`,
      `--var API_ORIGIN:http://localhost:${ports.api} --var WEB_ORIGIN:http://localhost:${ports.web}`,
      `--var AUTH_RATE_LIMIT:off --var OPENROUTER_BASE_URL:http://localhost:${ports.stub}/api/v1`,
      `--var BETTER_AUTH_SECRET:${testOnlySecret} --var KEY_ENCRYPTION_SECRET:${testOnlySecret}`,
    ].join(" "),
    env: { ...process.env, CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: e2eDatabaseUrl },
    url: `http://localhost:${ports.api}/health`, timeout: 120_000, reuseExistingServer: !process.env.CI },
  { name: "web", cwd: "../web",
    command: `bunx next build && bunx next start -p ${ports.web}`,
    env: { ...process.env, NEXT_PUBLIC_API_URL: `http://localhost:${ports.api}` },
    url: `http://localhost:${ports.web}/sign-in`, timeout: 180_000, reuseExistingServer: !process.env.CI },
],
use: { baseURL: `http://localhost:${ports.web}` },
```

The design choices in this sketch, each grounded:

- **Separate ports, not :3000/:8787.**
  - `next dev` "writes its PID, port, and URL to `.next/dev/lock`. A second `next dev` in the same project prints the running server's URL and the PID to kill" (`next-docs/01-app/02-guides/ai-agents.md`). "A lockfile mechanism prevents multiple `next dev` or `next build` instances on the same project" (`next-docs/01-app/02-guides/upgrading/version-16.md`, "Concurrent `dev` and `build`").
  - On the shared ports, `reuseExistingServer: true` would attach the tests to a developer's running `bun run dev`: real OpenRouter, the `second_brain` database and rate limiting on.
  - On dedicated ports, reuse can only ever pick up a previous e2e stack.
- **`next build` + `next start`, not `next dev`, for web.**
  - `next dev` and `next build` "now use separate output directories, enabling concurrent execution" (`version-16.md`), so an e2e build can run while `next dev` is running.
  - `NEXT_PUBLIC_*` values are "inlined … at build time" and "frozen" afterwards (`next-docs/01-app/02-guides/environment-variables.md`). `apiBaseUrl` reads `process.env.NEXT_PUBLIC_API_URL` (`apps/web/lib/api.ts:1`), so the build must see the e2e API URL. `process.env` is first in Next's env load order, ahead of `apps/web/.env` (same doc, "Environment Variable Load Order").
  - `next start -p` sets the port (`next-docs/01-app/03-api-reference/06-cli/next.md`).
  - A production build also removes on-demand compile latency from test timings **[inference]**.
  - Trade-off: it overwrites `apps/web/.next`. `NEXT_PUBLIC_API_URL` is in `globalEnv` (`turbo.json`), so the Turbo build cache keys on it and does not serve a stale build **[inference from Turbo's hashing of `globalEnv`]**.
- **wrangler flags** (https://developers.cloudflare.com/workers/wrangler/commands/workers/#dev):
  - `--port`: "Port to listen on".
  - `--var key:value`: "If defined in both places, this flag's values will be used" over config `vars`.
  - `--persist-to`: "directory to use for local persistence". It keeps e2e queue and Workflow state out of the dev `.wrangler/state` **[inference that isolation is desirable; Workflow instance ids are item ids, `apps/api/src/lib/items-queue.ts`]**.
  - `--show-interactive-dev-session`.
- **Database.** Hyperdrive's local connection comes from `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_<BINDING>`, which "takes precedence" over `localConnectionString` (https://developers.cloudflare.com/hyperdrive/configuration/local-development/). The binding is `HYPERDRIVE` (`apps/api/wrangler.jsonc`).
- **CI secrets.** `.dev.vars` is gitignored (`.gitignore`: `.dev.vars*`), so CI has no Worker secrets. Passing throwaway test-only values via `--var` covers both environments.
- **`--var` overrides `.dev.vars`.** Verified by experiment (wrangler 4.141.0): a worker with `.dev.vars` `FOO=devvars` and config `vars.BAR=config`, started with `--var FOO:flag --var BAR:flagbar`, returned `{"FOO":"flag","BAR":"flagbar"}`. A developer's own `.dev.vars` therefore does not leak into the e2e stack.
- **Rate limiting.** `AUTH_RATE_LIMIT:off` mirrors what the API Vitest suite does (`apps/api/vitest.config.ts`). Better Auth's limit is `window: 10, max: 100` when on (`apps/api/src/lib/auth.ts`). Parallel sign-ups from one IP would hit it **[inference]**.

### Projects: phone and desktop, reduced motion, colour scheme

- Projects are spread from `devices[...]` (https://playwright.dev/docs/test-projects). From the descriptor source (`packages/isomorphic/deviceDescriptorsSource.json` on `main`):
  - `Pixel 7`: 412×839, `isMobile`/`hasTouch`, **`defaultBrowserType: "chromium"`**.
  - `iPhone 15` and `iPhone 13`: `defaultBrowserType: "webkit"`.
  - `Desktop Chrome`: 1280×720, chromium.
- With only Chromium installed, **use `Pixel 7` for the phone project**. An iPhone descriptor would need WebKit **[inference from `defaultBrowserType`]**.
- `colorScheme`: "Emulates prefers-colors-scheme … Defaults to `'light'`". `reducedMotion`: "Emulates `'prefers-reduced-motion'` … Defaults to `'no-preference'`". `reducedMotion` has been a first-class `TestOptions` field since v1.50. Sources: https://playwright.dev/docs/api/class-testoptions#test-options-color-scheme and `docs/src/api/params.md` (`context-option-colorscheme`, `context-option-reducedMotion`).
- Scope:
  - **Per project:** in `use`.
  - **Per file or describe:** `test.use({ colorScheme: 'dark' })`.
  - **Mid-test:** `page.emulateMedia({ colorScheme: 'dark' })`.
  - All three are from https://playwright.dev/docs/emulation#color-scheme-and-media.
- Because Playwright defaults to `light` rather than the OS preference, set `colorScheme` explicitly wherever a test asserts theme-dependent UI **[inference]**.

```ts
projects: [
  { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  { name: "phone", use: { ...devices["Pixel 7"] } },
  { name: "phone-dark-reduced", use: { ...devices["Pixel 7"], colorScheme: "dark", reducedMotion: "reduce" }, grep: /@visual/ },
],
```

---

## Q2. Pointing the local worker's model calls at a deterministic stub

### How the base URL is decided today

- `packages/ai/src/index.ts:63` declares `const BASE_URL = "https://openrouter.ai/api/v1"`. `requestJson` calls `fetchImpl(\`${BASE_URL}${path}\`)` (`:114`).
- `OpenRouterOptions` is `{ apiKey; fetch? }`. There is **no env var, binding or option for the base URL**. The only existing seam is the injectable `fetch`.
- `createOpenRouter` is called in three places, each with only `{ apiKey }`:
  - `apps/api/src/lib/pipeline/process-item.ts:69`
  - `apps/api/src/lib/ask/ask-question.ts:42`
  - `apps/api/src/lib/user-keys/routes.ts:49` (key verification)
- `Env` has no OpenRouter var (`apps/api/worker-configuration.d.ts`, `apps/api/wrangler.jsonc`).
- The Vitest suite does not need a seam: it intercepts `globalThis.fetch` with `vi.spyOn` and matches `url.hostname === "openrouter.ai"` (`apps/api/test/support/openrouter-stub.ts`). That only works in-process, so it cannot reach a separately running `wrangler dev`.

### Minimal production-safe seam

1. **`packages/ai`.** Add `baseUrl?: string` to `OpenRouterOptions`. Default it to the current constant (`options.baseUrl ?? BASE_URL`). With the option absent, behaviour is unchanged, and the existing `packages/ai/src/index.test.ts` URL assertions (`:75`, `:142`) still hold.
2. **`apps/api/wrangler.jsonc`.** Add `"OPENROUTER_BASE_URL": "https://openrouter.ai/api/v1"` to `vars`.
   - `wrangler types` then generates `OPENROUTER_BASE_URL: string` on `Env`. The repo's `types` script already runs `wrangler types --strict-vars=false`, so no hand-written types are needed.
   - Production deploys the real URL from config.
   - Only the e2e command passes `--var OPENROUTER_BASE_URL:http://localhost:8790/api/v1`, and `--var` wins over config `vars` (Q1).
3. **`apps/api`.** Replace the three call sites with one helper, for example `openRouterFor(env, apiKey)` in `apps/api/src/lib/`, that passes `baseUrl: env.OPENROUTER_BASE_URL`. That is one decision point instead of three.
4. **Vitest suite.** It keeps working unchanged: config `vars` still point at `openrouter.ai`, which the spy intercepts.

Alternatives considered and rejected:

- **`.dev.vars.e2e` + `--env e2e`.** `--env` selects `[env.<name>]` in config, and bindings and vars are **non-inheritable**, so `hyperdrive`, `queues` and `workflows` would all have to be duplicated (https://developers.cloudflare.com/workers/wrangler/environments/#non-inheritable-keys-and-environments). It also creates a deployable `second-brain-api-e2e` Worker name (same page).
- **`.dev.vars`.** It is the developer's own local file, and "If you define a `.dev.vars` file, then values in `.env` files will not be included" (https://developers.cloudflare.com/workers/configuration/environment-variables/). It is the wrong place for a test-run switch.
- **An optional, unset var.** It is not in `Env` after `wrangler types`, so it would need hand typing and silently reads `undefined`.

Security note: the base URL receives users' decrypted OpenRouter keys as `Authorization: Bearer`. The seam must stay config-only, never request- or user-controlled. A wrong value in `wrangler.jsonc` would send keys elsewhere, so a unit test asserting the committed value is cheap insurance **[inference]**.

**Localhost fetch works from `wrangler dev`.** Verified by experiment: a worker under `wrangler dev` fetched `http://localhost:8795/ping` from a `Bun.serve` process and got its body back. The pipeline runs inside the local Workflow, and Workflow steps use the same `fetch` **[inference]**.

### Reusing `openrouter-stub.ts`

Not as-is. `stubOpenRouter()` wraps everything in `vi.spyOn(globalThis, "fetch")`, and its control surface is in-process (`rejectKeys`, `onChat`, `failChat`, `chatCalls`). Everything underneath is pure and portable:

- `stubEmbedding`: 1024-dimension hashed bag of words, matching `EMBEDDING_DIMENSIONS = 1024` (`packages/db/src/schema.ts:19`).
- `defaultEnrichment`, `defaultRewrite`, `defaultRerank`, `defaultAnswer`, the `parse*Input` helpers, and the route switch.

Recommended refactor:

- Extract a pure `handleOpenRouterRequest(request: Request, options): Promise<Response>` (routes, key check, handlers map) into a package entry, for example `@workspace/ai/testing` (`packages/ai/package.json` `exports` gains `"./testing"`, file at `packages/ai/src/testing.ts`).
  - The `packages-are-deep-modules` rule allows root-level `src/` files exposed through `exports` (`.dependency-cruiser.cjs`).
  - A dedicated `packages/openrouter-stub` is the alternative if test code should not ship in the `ai` package.
- The Vitest `stubOpenRouter()` becomes a thin `vi.spyOn` wrapper around it.
- `apps/e2e/src/openrouter-stub-server.ts` becomes `Bun.serve({ port: 8790, fetch: handleOpenRouterRequest })`.

For e2e, per-test control must not be global, because Playwright workers share one stub process. Encode behaviour in the key the test types instead, for example keys prefixed `sk-or-e2e-invalid` → 401 on `/key`, so the "OpenRouter rejected this key" path (`apps/api/src/lib/user-keys/routes.ts`) is testable without a shared mutable endpoint **[inference]**.

### What each step sends and expects (read from code)

All chat calls go to `POST /chat/completions` with `response_format.json_schema.name` naming the step. The stub dispatches on that name. `packages/ai` then requires:

- `choices[0].message.content`: a JSON string that passes the step's Zod schema.
- `finish_reason` other than `"length"`.
- `model` present.
- `usage` optional.

Source: `chatResponseSchema` and the `chat()` checks in `packages/ai/src/index.ts`.

| Step       | Endpoint / schema name                                        | Input (last user message, JSON)                                     | Stub's deterministic output                                                                                                                                                           |
| ---------- | ------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key check  | `GET /key`                                                    | Bearer key                                                          | `{ data: { limit_remaining: null, … } }`; 401 for a missing or rejected key.                                                                                                          |
| Enrichment | chat, `enrichment` (`apps/api/src/lib/pipeline/enrich.ts:69`) | `{ note, neighbourTags }`                                           | title = first 6 words; summary; `cleanText` = note; `kind` `quote` if the note contains `"`, else `thought`; tags = words longer than 5 chars (max 5); capitalised words as entities. |
| Embedding  | `POST /embeddings`                                            | `{ model, input[], encoding_format }`                               | `data[{ index, embedding }]`, where `embedding` = `stubEmbedding(text)`. `packages/ai` checks the count and `process-item.ts` checks 1024 dimensions.                                 |
| Rewrite    | chat, `rewrite` (`apps/api/src/lib/ask/rewrite.ts:89`)        | `{ question, now, timezone, history }`                              | `variants: [question]`, capitalised words as keywords, null filters, `followUp: false`.                                                                                               |
| Rerank     | chat, `rerank` (`apps/api/src/lib/ask/rerank.ts:50`)          | `{ question, variants, keywords, followUp, history, candidates[] }` | score = shared words of 4+ chars ÷ 3, capped at 1, or 1 on a keyword hit. It must clear `rerankFloor: 0.3` (`apps/api/src/lib/config.ts`).                                            |
| Answer     | chat, `answer` (`apps/api/src/lib/ask/answer.ts:104`)         | `{ question, sources[], history }`                                  | All source texts joined, all cited, `confidence: 0.9` (above `answerConfidenceFloor: 0.4`).                                                                                           |

Consequence for test data: a question retrieves a note only if they share at least one word of 4+ characters, and three shared words give a full rerank score. A proper-noun keyword guarantees a match. Tests should phrase notes and questions with that in mind.

---

## Q3. Database isolation

### Today

- `apps/api/test/global-setup.ts` calls `createFreshDatabase("second_brain_api_test")`, and each package suite uses its own name.
- `createFreshDatabase` (`packages/db/src/migrate.ts`):
  - validates the name against `^[a-z_][a-z0-9_]*$`;
  - runs `DROP DATABASE IF EXISTS … WITH (FORCE)` then `CREATE DATABASE` through `DATABASE_ADMIN_URL`;
  - applies the Drizzle migrations;
  - returns the URL with the path swapped.
- The Workers pool receives the URL via `miniflare.hyperdrives.HYPERDRIVE` (`apps/api/vitest.config.ts`).
- CI provides `DATABASE_ADMIN_URL` against the `pgvector/pgvector:0.8.6-pg17` service (`.github/workflows/ci.yml`).

### Recommended for e2e

- **Dedicated database `second_brain_e2e`.** Reset and migrate it with the same `createFreshDatabase` in `apps/e2e/src/reset-database.ts`. Run the reset in the `e2e` script **before** `playwright test`, not in `globalSetup`.
  - Playwright documents that global setup runs "before all the tests" (https://playwright.dev/docs/test-global-setup-teardown). It does not document the order relative to `webServer` startup.
  - A pre-step is unambiguous, and `WITH (FORCE)` would kill connections held by a reused API server anyway.
- **Point the API at it** through `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` in the api `webServer.env` (Q1).
- **Unique users per test run.** Use emails such as `e2e-${testInfo.parallelIndex}-${Date.now()}@example.test`. Every row is per-user, so unique accounts isolate tests, and tests can run in parallel without truncation between them.
- **Reused servers.** A reused local API server keeps pointing at `second_brain_e2e`, and the reset recreates it under the same name. Postgres clients reconnect per request (`packages/db` creates a client per request/step; see `docs/research/10-postgres-client-lifecycle-workers.md`), so no restart is needed **[inference]**.

---

## Q4. CI job

Playwright's GitHub Actions template (https://playwright.dev/docs/ci-intro#setting-up-github-actions and https://playwright.dev/docs/ci#github-actions):

- installs deps;
- runs `npx playwright install --with-deps`;
- runs the tests;
- uploads `playwright-report/` with `actions/upload-artifact` under `if: ${{ !cancelled() }}` and `retention-days: 30`.

Further guidance:

- **Workers.** Set `workers: 1` on CI "to prioritize stability and reproducibility" (https://playwright.dev/docs/ci#workers).
- **Global timeout.** "Always set a global timeout in CI", so a hang still produces a report, instead of relying on the job's `timeout-minutes` (same page and ci-intro).
- **Config defaults.** The standard config uses `forbidOnly: !!process.env.CI`, `retries: process.env.CI ? 2 : 0` and `trace: 'on-first-retry'` (https://playwright.dev/docs/test-configuration).
- **Browser caching:** "not recommended, since the amount of time it takes to restore the cache is comparable to the time it takes to download the binaries. Especially under Linux, operating system dependencies … are not cacheable". If you cache anyway, key the Playwright browser cache folder on the Playwright version (https://playwright.dev/docs/ci#caching-browsers). On Linux that folder is `~/.cache/ms-playwright` (https://playwright.dev/docs/browsers#managing-browser-binaries).
- **Report folder.** The HTML report goes to `playwright-report` in the working directory (https://playwright.dev/docs/test-reporters#html-reporter), which here is `apps/e2e/playwright-report`.
- **Upload condition.** `failure()` "Returns `true` when any previous step of a job fails" (https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#failure). The request is "upload on failure", so use `if: failure()`. Playwright's own template uses `!cancelled()`, which also keeps reports from green runs.

A separate job in `.github/workflows/ci.yml`, parallel to `check`:

```yaml
e2e:
  runs-on: ubuntu-latest
  timeout-minutes: 30
  services:
    postgres: # identical to the check job's service block
  env:
    DATABASE_ADMIN_URL: postgres://postgres:${{ github.run_id }}@localhost:5432/postgres
  steps:
    - uses: actions/checkout@v4
    - uses: oven-sh/setup-bun@v2
      with: { bun-version: 1.3.5 }
    - uses: actions/setup-node@v6 # Playwright's runner needs Node 22/24/26
      with: { node-version: 24 }
    - run: bun install --frozen-lockfile
    - run: bunx playwright install --with-deps --only-shell chromium
      working-directory: apps/e2e
    - run: bun run e2e
    - uses: actions/upload-artifact@v4
      if: failure()
      with:
        name: playwright-report
        path: apps/e2e/playwright-report/
        retention-days: 30
```

Notes:

- The `check` job's `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` points at `second_brain`. The e2e config sets its own value in `webServer.env`, which wins because it is spread after `process.env` in the sketch.
- The `.env` file does not exist on CI, and that is fine. Verified with Bun 1.3.5: `X=fromjob bun --env-file=./nope.env run e.ts` printed `fromjob` and exited 0, so a missing env file is ignored and job `env:` values pass through. The existing `check` job already depends on this, because `apps/api`'s `test` script uses `--env-file=../../.env`.
- The job needs the scrypt headroom that `apps/api/vitest.config.ts` notes ("CI runners need the headroom"). Keep the test timeout at 30 s or higher and raise `expect.timeout` above its 5 s default (https://playwright.dev/docs/test-timeouts) for "note becomes ready" assertions. Processing goes through a queue (`max_batch_timeout: 1`, `apps/api/wrangler.jsonc`) and then a multi-step Workflow.

---

## Q5. Auth in tests

### How the app authenticates

- Better Auth email/password runs on the API at `/api/auth/*` (`apps/api/src/index.ts`, `apps/api/src/lib/auth.ts`). It trusts only `WEB_ORIGIN`.
- CORS answers only `WEB_ORIGIN`, with `credentials: true`.
- The web client calls `createAuthClient({ baseURL: apiBaseUrl })` (`apps/web/lib/auth-client.ts`), and `apiRequest` sends `credentials: "include"` (`apps/web/lib/api.ts`).
- Gating is client-side. `AppShell` reads `authClient.useSession()` and redirects to `/sign-in?next=…` (`apps/web/components/app-shell.tsx`).
- The session cookie is set by the API origin. It still works from the web origin because "Cookies do not provide isolation by port" (RFC 6265 §8.5, https://www.rfc-editor.org/rfc/rfc6265#section-8.5), so `localhost:3100` and `localhost:8797` share it. Playwright's `storageState` captures the context's cookies regardless of which origin set them **[inference]**.

### Playwright's options

From https://playwright.dev/docs/auth:

- **"Basic: shared account"** (setup project + `storageState`) is recommended only "for tests **without server-side state**".
- **"Moderate: one account per parallel worker"** is "the **recommended** approach for tests that **modify server-side state**". It uses a worker-scoped fixture that authenticates once per `parallelIndex`, saves `storageState` under `project.outputDir`, and overrides the `storageState` fixture.
- Store auth files in a gitignored `playwright/.auth` or under `outputDir` ("automatically cleaned up before every test run"). The docs warn they contain sensitive cookies.
- "Authenticate with API request": when the app "supports authenticating via API that is easier/faster than interacting with the app UI", post with `request` and save the state.
- Opt out per file with `test.use({ storageState: { cookies: [], origins: [] } })`.
- `page.request` / `context.request` "share cookie storage with its browser context" (https://playwright.dev/docs/api-testing).

### Recommendation

Every test in this app writes per-user data (notes, keys, threads). Use the **one-account-per-worker** fixture:

1. **Sign-up / sign-in / sign-out specs** drive the real UI (`/sign-up`, `/sign-in`; labels "Email" and "Password", `apps/web/components/auth-form.tsx`) with `storageState` cleared. This is where the UI flow is actually tested.
2. **Worker fixture.** Create the account through the API rather than the UI: `POST http://localhost:8797/api/auth/sign-up/email` with an `origin: http://localhost:3100` header, as the API tests do (`apps/api/test/support/http.ts:18`, `:44`). Better Auth checks trusted origins **[inference from the tests always setting it]**.
   - Use the browser context's `request`, so the `Set-Cookie` lands in the context. Then save `storageState` into `outputDir/.auth/<parallelIndex>.json`.
   - This skips repeating the UI flow the auth specs already cover, and avoids a second scrypt hash per test (`apps/api/vitest.config.ts` notes scrypt cost).
   - The fixture can also `PUT /keys/openrouter` with a stub key (`apps/api/src/lib/user-keys/routes.ts`), so capture and ask tests start with a key. The key-settings spec itself starts without one.
3. **Blank-slate tests** (empty feed, missing-key banner) create a fresh account inside the test instead of using the worker account, since the worker account accumulates data across its tests.

---

## Risks and open points

1. **A production code change is required.** The stub seam touches `packages/ai/src/index.ts`, `apps/api/wrangler.jsonc`, the regenerated `apps/api/worker-configuration.d.ts`, and the three `createOpenRouter` call sites. It is small, but it is not test-only.
2. **Stub extraction.** Because of `no-imports-from-apps`, the stub's pure handlers must move into a package before e2e can reuse them. The Vitest wrapper changes in the same PR.
3. **Ports differ from dev.** Choosing 3100/8797 means `API_ORIGIN`, `WEB_ORIGIN` and `NEXT_PUBLIC_API_URL` must all be overridden for e2e. Any hardcoded `localhost:8787` or `:3000` outside those (for example `apps/api/test/support/http.ts`, which is test-only) must not leak into app code.
4. **`next build` in the e2e web server** makes cold start slow (hence the 180 s timeout). It rewrites `apps/web/.next` locally, and it cannot run while another `next build` holds the lock.
5. **Pipeline latency** (queue → Workflow with retries of `10 seconds` exponential, `apps/api/src/lib/config.ts`) means a stub failure surfaces as a slow test, not a fast one. Assert on UI status with generous `expect` timeouts.
6. **Only Chromium.** There is no WebKit/Safari coverage. The phone project is Android Chromium (`Pixel 7`).
