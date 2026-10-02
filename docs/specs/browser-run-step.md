# Browser Run step for JS-rendered articles

Issue: #59

## Problem Statement

A user pastes the URL of an article whose content is rendered by client-side JavaScript. The ladder in `docs/spec.md` §4.1 fetches the raw HTML, which is thin or empty before the page's own script runs, so the capture falls straight to the reader API or lands `partial`: a title and note only, with the article's own words never captured. A user saving a JS-heavy blog, docs site, or single-page app today gets a capture that isn't really there.

## Solution

Between the existing HTML-parse step and the reader-API fallback, the ladder gets one more rung: when the parsed HTML comes back thin, the pipeline asks Cloudflare Browser Run to load the page in a real (headless) browser and hand back the rendered HTML, which is then parsed exactly like any other HTML response. A user never sees this step directly; they see a `full`-quality capture where they'd otherwise have gotten `partial`. When Browser Run isn't configured, or it fails, times out, or is rate-limited, the capture falls through to the reader API exactly as it does today — a capture never fails because of this step.

## User Stories

1. As a user, saving a JS-rendered article gets its real text captured, so that Ask can answer questions about it.
2. As a user, saving a JS-rendered article behind a login or paywall still falls through to the reader API when Browser Run can't help, so that I still get whatever that path can give me.
3. As a user, a capture never fails because Browser Run is unavailable, slow, or rate-limited, so that my capture always saves at least `partial`.
4. As a user, saving an article that already parses fine from plain HTML never triggers Browser Run, so that the ladder's existing fast path is unchanged.
5. As a user, saving a markdown-served page (the ladder's first rung) never triggers Browser Run, so that already-full captures stay cheap.
6. As an operator, Browser Run is only called when the `BROWSER` binding is configured, so that an environment without it (e.g. a plan that doesn't have it enabled) behaves exactly as it does today.
7. As an operator, a Browser Run failure (429, timeout, any error) is logged but never surfaces as a user-visible error, so that the shared daily budget running out degrades gracefully for every user at once, the same way an exhausted reader allowance already does.
8. As an operator, Browser Run is never retried within one capture, so that a rate-limited or momentarily-exhausted budget isn't made worse by retry traffic.

## Implementation Decisions

**Language** (see `CONTEXT.md` and `docs/spec.md` §4.1): this is a new rung in the existing article ladder (markdown fetch → HTML parse → **Browser Run** → reader API → `partial`), not a new capture type or item state.

**Ladder placement.** "Thin" is the HTML-parse step's extracted text being completely empty, or the response carrying one of the existing blocked-content signals (login/paywall wording, non-OK status). The empty-text signal is new: the existing code only checked for blocked wording, which never fires for a plain JS single-page app that renders an empty shell server-side (no blocked words, status 200, just no text) — exactly the case this issue is about. Browser Run is tried at this (corrected) decision point, before the reader call. If Browser Run returns rendered HTML, it is parsed with the same existing HTML-parse logic used for a normal fetch response and judged thin the same way; a non-thin result from that parse ends the ladder there as `full`. If Browser Run returns nothing (any failure) or its result is still thin, the ladder continues to the reader API exactly as today.

**Interface.** A new optional dependency, parallel to the existing `fetchPage` and reader `readerService` on the article-extraction request: a `renderPage` function taking the source URL and returning the rendered HTML string, or `null` if rendering wasn't attempted or didn't succeed. Nothing above this function's boundary needs to know why it returned `null` — not-configured, 429, timeout, and a genuine render error are all the same outcome to the ladder.

**Real implementation.** Built where the reader's `operatorService` is already constructed for a capture (alongside the existing per-capture dependency wiring), as a small function that calls Cloudflare's Browser Run `/content` Quick Action (not a full Puppeteer/CDP session — no Durable Object, no held-open session; one page's rendered HTML is all this step needs) against the `BROWSER` Workers binding. Any failure (binding absent, HTTP error, timeout) is caught there and surfaced as `null`; it never throws past this boundary, matching how `readWithReader` already swallows reader failures today.

**No custom allowance.** Per [ADR-0009](../adr/0009-browser-run-has-no-custom-allowance.md), Browser Run gets no per-user daily cap, no spend-tracking, no `partialReason` of its own, unlike the reader and transcript fallbacks (ADR-0006). Cloudflare's own free-tier cap (10 browser-minutes/day, 3 concurrent sessions, 1 new session per 20 seconds) is enforced server-side with a flat 429; the pipeline treats any such failure as "couldn't render" and moves on. This is a genuine behavior difference from the reader/transcript path and is intentional: those allowances protect operator money, this step costs the operator nothing to attempt.

**Binding.** A new `browser`-type Workers binding (Cloudflare's own convention name is `MYBROWSER`; this binding is named `BROWSER` to match this repo's existing all-caps binding style) added to `apps/api/wrangler.jsonc`. Requires `nodejs_compat_v2` (already implied by this repo's compatibility date) and a `compatibility_date` that supports the Quick Actions binding method.

**Local development.** There is no local simulation for Browser Run; `wrangler dev` always proxies to Cloudflare's real browser fleet, sharing the same daily budget as production. This is accepted, not worked around (per ADR-0009) — day-to-day development and tests use the injected `renderPage` stub, and the real binding is only exercised deliberately.

## Testing Decisions

A good test here drives the pipeline through the HTTP seam only, the same way `apps/api/test/url-capture.test.ts` already tests the rest of the article ladder: no real network, no MSW, an injected fake function standing in for the external call.

One seam, reused: the existing `fetchPage` injection pattern extended with a sibling `renderPage` function, passed the same way `articleFetch({...})` already stands in for `fetchPage` in `url-capture.test.ts`. A test gives `renderPage` a simple function returning rendered HTML for a known URL (or `null`, or throwing, to exercise failure paths) and asserts on the resulting item exactly as existing article tests do (`captureQuality`, `rawText` contents).

Covers:

- A thin parse (an empty-shell SPA with no real text, or blocked-content wording) followed by a successful `renderPage` result: the item ends up `full` quality, with text from the rendered HTML.
- A thin parse where `renderPage` returns `null` (simulating "not configured" or "Cloudflare refused"): the ladder falls through to the reader API exactly as it does today without this step (reuse of the existing reader-fallback test's shape).
- A thin parse where `renderPage` throws: treated the same as returning `null` — the capture still saves, never fails outright.
- A full-quality first-pass parse (existing happy path): `renderPage` is never called (assert the fake wasn't invoked).
- A markdown-content-type response (the ladder's first rung): `renderPage` is never called.

## Out of Scope

- A per-user or per-operator allowance/cap for Browser Run (see ADR-0009).
- A full Puppeteer/CDP session, multi-page crawling, screenshots, or PDF generation — only the `/content` Quick Action for this one capture's URL.
- Retrying a rate-limited or timed-out Browser Run call within the same capture.
- Any change to the YouTube, Instagram, PDF, or extension capture paths — this only touches the plain-URL article ladder.
- A UI indicator distinguishing "captured via Browser Run" from "captured via plain HTML parse" — both are simply `full` quality, same as today.

## Further Notes

- `docs/spec.md` §4.1 names "Defuddle" as the HTML-extraction library; the implementation already diverges from that (it uses Cloudflare's `HTMLRewriter` directly, no Defuddle dependency exists in the repo). This spec reuses whatever HTML-parse function already exists today for the first HTML rung — it is not reintroducing Defuddle, and fixing that pre-existing spec/code naming mismatch is out of scope here.
- Research backing the free-tier numbers and binding shape: `docs/research/22-browser-rendering-free-tier.md`.
- This project runs on the Workers Free plan (confirmed in the planning session for this issue); ADR-0009's reasoning is specific to that plan's economics (free but capped) and should be revisited if the plan changes.
- The `BROWSER` binding is declared `"remote": true` in `wrangler.jsonc` so `wrangler dev`'s Quick Actions work locally (per `docs/research/22`). The Workers test pool reads the same config, so it needs `remoteBindings: false` in `vitest.config.ts` to avoid requiring live Cloudflare credentials just to boot the test runner — CI has none. Tests never reach the real binding regardless (the injected `renderPage` seam intercepts first), so this only affects pool start-up, not test behavior.
