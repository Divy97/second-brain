# ADR-0001: Jina Reader is the reader API

Date: 2026-09-29
Status: Accepted

## Context

`docs/spec.md` §3 named the optional reader API as "Tavily / Firecrawl / Jina" and never chose one. The choice had to be settled before `PUT /keys/reader` could exist, because the route verifies a key against a specific provider, and before the article ladder (§4.1 step 4) could call one.

`docs/research/14-byok-key-verification.md` compared the three against primary sources:

- **Jina Reader** — `GET r.jina.ai/<url>` returns clean markdown. The key is optional: 20 requests/minute anonymous, 500/minute with a key. No account, balance or verification endpoint exists.
- **Firecrawl** — a key is required for everything. `GET /v2/team/credit-usage` is a free, clean verifier. Renders JS itself, so it could also serve article-ladder step 3.
- **Tavily** — a key is required. `GET /usage` is the best verifier of the three. Built for AI search rather than faithful article extraction.

## Decision

Use **Jina Reader**.

Its optional-key model matches how this product treats optional keys: the fallback degrades rather than breaks, and a user without a key is in a supported state, not a broken one. The other two require a key for any use at all, which would make "optional reader key" a fiction.

Verification is a real Reader call against a fixed, tiny page, because Jina publishes no verification endpoint. This costs the user a few output tokens per save. Accepted, because the alternative is an undocumented dashboard endpoint that could disappear without notice.

## Consequences

- A rejected reader key is detectable (`401`), but remaining quota is not. Users learn about exhausted quota when an extraction falls back to partial, not at save time. Firecrawl and Tavily would both have given a credit count.
- `packages/ai/src/jina.ts` owns both `verifyKey` and `read`, so the article ladder and the settings route share one client.
- A reader that is merely down leaves the item `partial` rather than failing the capture, since a partial capture still carries the title and the user's note. A key the reader _rejects_ is different: it is the user's to fix, so it fails the item with `invalid_key` and an error they can act on.
- Article-ladder step 3 (Browser Run, for JS-rendered pages) is still not built, so the ladder runs fetch, parsed HTML, reader. A thin-but-unwalled page has no rescue path yet.
- Revisit if bot-walled pages turn out to need JS rendering as well, since Firecrawl would then cover ladder steps 3 and 4 in one call and remove the need for a Cloudflare Browser Run binding.
