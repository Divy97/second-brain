# ADR-0009: Browser Run is a best-effort ladder step with no custom allowance

Date: 2026-10-03
Status: Accepted
Related: [ADR-0006](0006-transcript-and-reader-run-on-operator-keys.md) (the pattern this deliberately does not repeat)

## Context

ADR-0006 put a per-user daily allowance in front of the reader and transcript fallbacks, because those run on operator-paid keys: unmetered use would spend the operator's money. Issue #59 adds a third fallback, Cloudflare Browser Rendering (`/content` Quick Action), to re-render JS-heavy pages before re-parsing. Research (`docs/research/22-browser-rendering-free-tier.md`) found Browser Rendering is free on the Workers plan this project runs on, capped by Cloudflare itself at 10 browser-minutes/day, 3 concurrent sessions, and 1 new session per 20 seconds — enforced server-side with a flat 429, no queueing.

The question is whether to wrap this step in the same per-user allowance machinery as ADR-0006, or rely on Cloudflare's own cap.

## Decision

1. Browser Run gets no per-user allowance table, no spend-tracking, no `partialReason` of its own. It is called opportunistically when the HTML-parse step comes back thin; a 429, a timeout, or any other failure is treated exactly like the existing reader-service failure path: log it, return nothing, let the ladder continue to the reader API.
2. The call goes through the `/content` Quick Action (matching `docs/spec.md` §4.1's own wording), not a full Puppeteer session, since Quick Actions need no Durable Object to hold a session open and this step only needs one page's rendered HTML, not a multi-step browser interaction.
3. Local development calls the real binding exactly like production (Cloudflare's own docs confirm there is no local-simulation mode); this is accepted as a shared, small cost, not something the app works around.

## Consequences

- ADR-0006's allowance exists to protect operator _money_; Browser Run costs the operator nothing on this plan, so the same machinery would protect a quota instead, at the cost of a second accounting system for a cap Cloudflare already enforces. Building that is deferred until real usage shows it's needed.
- A burst of thin pages on a bad day can exhaust the shared 10-minute budget; every user sees the ladder fall through to the reader API (or `partial`) for the rest of that UTC day. This degrades the same way an unset operator key already does today — gracefully, never as a capture failure.
- If this project moves to a paid plan or usage grows enough that the shared free cap becomes a recurring problem, revisit this decision against ADR-0006's pattern rather than bolting on an ad hoc limit.
