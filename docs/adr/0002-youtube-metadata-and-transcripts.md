# ADR-0002: YouTube metadata on an operator key, transcripts pinned to native

Date: 2026-09-30
Status: Accepted

## Context

`spec.md` §4.2 defined a four-rung YouTube ladder: Data API metadata, opportunistic `youtubei.js` captions, the user's transcript key, then partial. Two of those rungs did not survive contact with primary sources (`docs/research/15-youtube-ingestion.md`).

**The Innertube rung is not buildable.** YouTube now requires a BotGuard attestation on `/get_transcript`; `youtubei.js` does not implement it (maintainers LuanRT and absidue, issue #1102, still open at v18.1.0). Generating the attestation needs a browser-grade JS environment, and Cloudflare Workers forbid `eval` and `new Function` — the library's own evaluator shim throws there. The project FAQ states server IPs get blocked with "no known solution", and LuanRT adds that PO tokens do not bypass IP blocks. A Worker is a datacenter IP.

**The transcript API's default mode is a cost trap.** Supadata's `mode` defaults to `auto`: native captions at 1 credit, silently falling back to AI generation at **2 credits per minute**. The free plan is 100 credits/month. One 40-minute uncaptioned video would consume 80 of them in a single save, with no warning.

**Metadata could be operator-funded or user-funded.** The Data API needs a Google API key, which is an operator secret rather than BYOK. The alternative was the transcript provider's `/v1/metadata` at 1 credit, on the user's optional key.

## Decision

1. **Drop the Innertube rung.** The ladder is: operator Data API metadata → user's transcript key → partial.
2. **Pin the transcript call to `mode=native`.** Never `auto`. An uncaptioned video returns the soft `206 transcript-unavailable` at 1 credit and the item stays `partial`.
3. **Fund metadata from an operator `YOUTUBE_API_KEY`**, not from the user's transcript credits.
4. **Do not parse chapters.** They are not a field of the Data API; Google documents only that users may type timestamps into the description. The description is captured verbatim, so timestamps remain searchable text.

## Consequences

- Every YouTube capture is searchable by title and channel even for a user who has added no optional key at all. Without the operator key that user would have saved a bare URL.
- Metadata costs the user nothing, so their transcript credits buy roughly 100 videos a month rather than 50.
- An uncaptioned video is permanently `partial` under `mode=native`. If that proves too limiting, the honest fix is an explicit per-item "transcribe this anyway" action that states the per-minute cost, not a silent default.
- The operator key is a new deployment dependency. It is optional at runtime: unset, the ladder falls through to the transcript key and then to partial, so CI and local dev need no secret.
- A Data API quota exhaustion degrades captures to `partial` rather than failing them. An invalid operator key is an outage, not something a user can fix, so it surfaces as a retryable processing error.
- Video ids are extracted from link forms that **no primary Google source specifies**. The parser fails closed and is covered by unit tests; treat it as a heuristic that may need revision.
