# Cloudflare Browser Rendering: free-tier limits, binding shape, local dev

Researched 2026-10-03, for issue #59 ("Browser Run step for JS-rendered articles"). Discussion input, not a decision — feeds a grilling session before `apps/api/src/lib/pipeline/article.ts` grows a rendering step.

Sources: primary only — `developers.cloudflare.com/browser-rendering/*` doc pages (fetched directly) and the official changelog. The product was renamed "Browser Rendering" → "Browser Run" on 2026-04-15 (already noted in `docs/research/01-url-extraction-and-cloudflare-ai-features.md`); both names resolve on Cloudflare's site and are used interchangeably below, matching whichever page used which name.

## Bottom line

**Browser Rendering/Run is available on the Workers Free plan** — this is not a blocking finding. But the free allowance is small and explicitly rate-limited (10 browser-minutes/day, 3 concurrent sessions, 429 on overage), and local dev always talks to Cloudflare's remote browser infrastructure, never a real browser on your machine for the actual binding calls (despite a 2025-07-22 changelog entry that's easy to misread — see §4). Repo context: this project's Workers plan is not yet confirmed anywhere in `docs/adr` or `docs/research` — `docs/research/01-url-extraction-and-cloudflare-ai-features.md` and `docs/adr/0001-jina-reader-as-the-reader-api.md` both treat it as an open question and route around it by defaulting to Jina Reader instead of Browser Rendering. This research doesn't resolve "which plan are we on" — that's still a decision the grilling session needs to make, informed by the limits below.

## 1. What Browser Rendering/Run is, binding name, API surface

Cloudflare Browser Rendering lets a Worker (or a plain REST caller) drive a real headless Chromium instance running on Cloudflare's network, for scraping, screenshots, PDF generation, and more. There are two distinct ways to use it:

- **Workers binding** (`@cloudflare/puppeteer`, a Cloudflare fork of Puppeteer-core): a Worker declares a `browser`-type binding and gets a full Puppeteer-compatible session (`puppeteer.launch(env.MYBROWSER)`, `browser.newPage()`, `page.goto()`, etc.). Cloudflare also documents a Playwright fork and raw Chrome DevTools Protocol (CDP) access — any CDP-compatible client (Puppeteer, Playwright, Stagehand) can connect from Workers, a local machine, or any other environment.
  Binding declaration (`wrangler.jsonc`):

  ```jsonc
  {
    "name": "browser-rendering",
    "compatibility_flags": ["nodejs_compat_v2"],
    "browser": { "binding": "MYBROWSER" },
  }
  ```

  or `wrangler.toml`:

  ```toml
  [browser]
  binding = "MYBROWSER"
  ```

  `nodejs_compat_v2` is required (default on for compatibility dates ≥ 2026-08-04). This repo's `apps/api/wrangler.jsonc` would need a `browser` block added — it has no such binding today.
  — https://developers.cloudflare.com/browser-rendering/platform/wrangler/

- **Quick Actions**: a higher-level, single-call API for common tasks, callable two ways:
  - As a **REST API** (no Worker required at all) — HTTP POST with a Cloudflare API Token scoped to "Browser Rendering - Edit", for one-off/external use.
  - As a **Workers binding method**, `env.BROWSER.quickAction()`, requiring `compatibility_date` ≥ 2026-03-24.
    Endpoints: `/content` (HTML), `/screenshot`, `/pdf`, `/markdown`, `/snapshot`, `/accessibilityTree`, `/scrape`, `/json` (AI-structured extraction), `/links`, and `/crawl` (REST-API-only, multi-page).
    — https://developers.cloudflare.com/browser-rendering/rest-api/

For issue #59's use case (render JS, then re-run Defuddle on the resulting HTML), the relevant surface is either the `/content` Quick Action (get rendered HTML, then hand it to Defuddle as today) or a full Puppeteer binding session doing `page.goto()` + `page.content()`. The binding gives more control (wait conditions, cookies, custom UA — same options already used by `/markdown`, per file 01); Quick Actions are simpler but still bill the same browser-hours.

## 2. Free-tier limits (exact numbers)

From https://developers.cloudflare.com/browser-rendering/platform/limits/ and https://developers.cloudflare.com/browser-rendering/platform/pricing/ (both current as fetched 2026-10-03):

| Limit                       | Workers Free                                                 | Workers Paid                                                                                 |
| --------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Browser time                | 10 minutes/day                                               | 10 hours/month included, then $0.09/additional browser-hour                                  |
| Concurrent browser sessions | 3 per account                                                | 10 browsers/month (averaged), then $2.00/additional browser/month; can request higher limits |
| New browser instances       | 1 every 20 seconds                                           | 3 per second                                                                                 |
| Quick Actions request rate  | 1 every 10 seconds                                           | 30 per second                                                                                |
| Browser session timeout     | 60 seconds (extendable to up to 10 minutes via `keep_alive`) | same                                                                                         |
| `/crawl` jobs               | 5/day                                                        | — (not called out as separately limited on paid)                                             |
| Max pages per `/crawl` job  | 100                                                          | —                                                                                            |

Quick Actions bill only for browser-hours; full Browser Sessions (Puppeteer/Playwright/CDP) bill for both browser-hours **and** concurrent-browser count. All browser-hour usage, regardless of entry point, counts against the same monthly/daily pool.
— https://developers.cloudflare.com/browser-rendering/platform/limits/
— https://developers.cloudflare.com/browser-rendering/platform/pricing/

## 3. Availability and interaction with other Workers limits

**Browser Rendering is available on the Workers Free plan — not Paid-only.** This directly updates the "Paid" assumption implicit in file 01's `markdowner` reference architecture note ("Requires Workers Paid + Browser Run" — that statement is about needing _generous_ limits in practice, not about hard plan-gating). Confirmed in the official FAQ: "Workers Free plan accounts are capped at 10 minutes of browser use a day" — phrasing that presupposes free-plan access exists, it's just capped.
— https://developers.cloudflare.com/browser-rendering/faq/

Cloudflare's own docs do not spell out a direct CPU-time-ms-per-invocation accounting rule for Browser Rendering sessions (i.e., they don't say "a Browser Rendering call consumes Worker CPU-ms 1:1"). What they do document:

- The **Durable Objects pattern** (`browser-rendering-with-do`) exists specifically to avoid repeatedly paying the browser-session cold-start cost: "Using Durable Objects to persist browser sessions improves performance by eliminating the time that it takes to spin up a new browser session," and "Since Durable Objects re-uses sessions, it reduces the number of concurrent sessions needed." This is an optional architecture, not a requirement — a Worker can call the `browser` binding directly without a Durable Object. Using a DO to hold a session open ties that DO's own Workers-for-Platforms/Durable-Objects billing (duration-based) to however long the browser session is kept alive.
  — https://developers.cloudflare.com/browser-rendering/workers-bindings/browser-rendering-with-do/
- Concurrency is governed by Browser Rendering's own "3 concurrent browsers" (free) / "10 concurrent, averaged monthly" (paid) ceiling, separate from and in addition to ordinary Workers concurrent-invocation limits. The FAQ confirms there's no fixed cap on requests _within_ a session — only compute/memory constraints — and recommends reusing an existing browser/tab rather than launching a new browser per task to stay under the concurrency ceiling.
  — https://developers.cloudflare.com/browser-rendering/faq/

No doc page found states that a Browser Rendering call is billed as part of the calling Worker's CPU-ms; it is billed and limited as its own product (browser-hours + concurrent-browser count), on top of whatever the surrounding Worker invocation itself costs. Treat "does it eat into our Worker's 10ms/50ms free-plan CPU budget" as unconfirmed by primary docs either way — worth a small empirical check (log `cpuMs` for a request that calls the binding) if the spec needs certainty here, since the request also still runs as a normal Worker invocation around the binding call.

## 4. Local development: does `wrangler dev` run a real local browser?

**No — Browser Rendering is only backed by Cloudflare's remote browser infrastructure, in both `wrangler dev` and `wrangler dev --remote`.** There is no "real browser running on your laptop" mode for the actual binding/API calls; what changed in the 2025-07-22 release is that plain `wrangler dev` (local mode) now proxies browser-binding calls out to Cloudflare's remote browser fleet automatically, so you no longer had to pass `--remote` for Browser Rendering specifically to work during local dev of a Worker that also does other local-mode things. Confirmed by the FAQ/limits pages' own wording: for Quick Actions used from local dev, you must pass `"remote": true` in the binding config, or run `wrangler dev --remote` — i.e., the binding never spins up a literal local Chromium; "remote" is still Cloudflare's browser farm, just reachable during a local dev session.
— https://developers.cloudflare.com/changelog/2025-07-22-br-local-dev/

Documented local-dev limitations:

- Requests larger than 1 MB are not supported in local development.
- The `.quickAction()` method was not yet supported in local dev at the time of that changelog (REST API Quick Actions and full Puppeteer/Playwright binding sessions were).
- A `X_BROWSER_HEADFUL=true` env var, set before `wrangler dev`/`vite dev`, runs the remote(?) Chrome in visible/headful mode for debugging — this is a dev-ergonomics flag, not a local-execution flag; it does not avoid the remote browser-hours/concurrency accounting.
- `wrangler` CLI also gained direct session-management subcommands (`create`, `close`, `list`, `view`) for inspecting live browser sessions from the terminal.
  — https://developers.cloudflare.com/browser-rendering/faq/
  — https://developers.cloudflare.com/changelog/2025-07-22-br-local-dev/

Practical implication for this repo: every local-dev invocation of a Browser Rendering step during development of issue #59 will consume the same shared free-tier daily 10-minute / 3-concurrent budget as production, since there's no sandboxed local browser. Local iteration on this feature will burn down the free allowance fast (60s timeout × a handful of manual test runs gets close to 10 minutes quickly), which is itself an argument for either moving to Workers Paid before building this, or being disciplined about not looping dev requests through the real binding while iterating on the Defuddle-on-rendered-HTML logic.

## 5. Rate limits, queueing, and failure behavior when limits are exceeded

No queueing is documented anywhere — Cloudflare's model is reject-with-429, not queue-and-retry-later:

- Exceeding the daily free browser-time budget: the FAQ gives the literal error shape — `Unable to create new browser: code: 429: message: Browser time limit exceeded for today.` This resets at the next UTC day; there's no documented way to buy more time on Free (upgrading plan is the only lever).
  — https://developers.cloudflare.com/browser-rendering/faq/
- Exceeding concurrent-session (3 free / 10 paid averaged) or new-instance-rate (1 every 20s free / 3 per second paid) limits: the limits page documents the same class of response — "429 Too many requests" — with no automatic queueing; the FAQ's advice is to reuse sessions (ideally via the Durable Objects pattern in §3) rather than retry-loop into the ceiling.
  — https://developers.cloudflare.com/browser-rendering/platform/limits/
- Session timeout (60s default, extendable to 10 minutes via `keep_alive`) is a separate failure mode from the rate limits above — a page that renders slowly will time out mid-session rather than get rate-limited, so the implementation needs its own short budget for `page.goto()`/`waitUntil` well under 60s to leave room for the Defuddle pass afterward.

Implication for the fallback ladder (markdown fetch → Defuddle → Browser Rendering → reader API → "partial"): a 429 from Browser Rendering (daily budget, concurrency, or new-instance rate) and a render timeout are both legitimate, expected-in-production outcomes on the Free plan, not edge cases — the pipeline needs to catch both and fall through to the reader API (or partial) immediately rather than retry, since there is no documented backoff-and-succeed path on Free; retrying into a 429 just wastes the request budget the ladder is trying to conserve.

## Sources

Cloudflare (official, fetched 2026-10-03)

- https://developers.cloudflare.com/browser-rendering/platform/limits/
- https://developers.cloudflare.com/browser-rendering/platform/pricing/
- https://developers.cloudflare.com/browser-rendering/platform/wrangler/
- https://developers.cloudflare.com/browser-rendering/rest-api/
- https://developers.cloudflare.com/browser-rendering/faq/
- https://developers.cloudflare.com/browser-rendering/workers-bindings/browser-rendering-with-do/
- https://developers.cloudflare.com/changelog/2025-07-22-br-local-dev/
- https://developers.cloudflare.com/changelog/2026-04-15-br-rename/ (product rename Browser Rendering → Browser Run; already cited in file 01)

Repo context read first

- `docs/research/01-url-extraction-and-cloudflare-ai-features.md`
- `docs/adr/0001-jina-reader-as-the-reader-api.md`
- `apps/api/src/lib/pipeline/article.ts`
- `apps/api/wrangler.jsonc`
