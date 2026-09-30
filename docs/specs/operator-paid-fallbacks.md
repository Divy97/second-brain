# Operator-paid transcript and reader fallbacks

Issue: #71

## Problem Statement

A **User** who opens settings is asked for three API keys: OpenRouter, a Supadata transcript key and a Jina reader key. Only the OpenRouter key pays for the User's own model use. The other two are product plumbing that the product should provide, and asking for them makes setup harder and leaves video and blocked-page links `partial` for anyone who skips them.

## Solution

Settings asks for the OpenRouter key and nothing else. The product pays for transcript and reader lookups with its own keys, so YouTube, Instagram and blocked pages are captured in full out of the box. Each **User** has a daily allowance of these paid lookups. When it is used up, the capture still saves, stays `partial`, and says plainly why and when to try again. See ADR-0006.

## User Stories

1. As a **User**, I want settings to ask only for my OpenRouter key, so that setup is one step.
2. As a **User**, I want to save a YouTube link and get its transcript without adding any key, so that video capture just works.
3. As a **User**, I want an Instagram link captured with its caption without adding any key, so that social saves just work.
4. As a **User**, I want a page that blocks ordinary fetching to still be read, so that I do not lose articles to bot walls.
5. As a **User**, I want a daily allowance of 2 transcript lookups and 2 reader lookups, so that the service stays affordable for everyone.
6. As a **User** past the allowance, I want my capture saved anyway, so that I never lose a link.
7. As a **User** past the allowance, I want the item to say it is saved but the transcript or article text was not captured because today's limit is used, so that I understand what is missing.
8. As a **User** past the allowance, I want that message to say I can Reprocess tomorrow, so that I know how to complete it.
9. As a **User**, I want a partial item to stay searchable by its link, title and my note, so that it is still useful.
10. As a **User**, I want Reprocess to fetch the transcript or article text once my allowance is available, so that partial items can be completed.
11. As a **User**, I want Reprocess to use my allowance like any other capture, so that the limit cannot be bypassed.
12. As a **User**, I want a refused lookup not to use up my allowance, so that hitting the limit does not cost me more.
    12a. As a **User**, I want a blocked article to use only my reader allowance and a video link only my transcript allowance, so that one kind of capture cannot starve the other.
13. As a **User**, I want my allowance to reset each day, so that I can capture more tomorrow.
14. As a **User**, I want lookups that need no paid service (plain articles, captioned pages) not to use my allowance, so that normal captures are never limited.
15. As a **User**, I want a YouTube link to keep its title and channel even when transcripts are unavailable, so that it is still findable.
16. As a **User** who saved a transcript key or reader key before, I want my settings to no longer show them, so that the page is not confusing.
17. As a **User** who saved those keys before, I want them deleted rather than left stored, so that my data is not kept needlessly.
18. As a **User**, I want an item that is partial for another reason (a private page, a missing source) to keep its current wording, so that I am not told a wrong cause.
19. As a **User** hitting an unknown error in a paid lookup, I want the item saved as partial, not failed, so that captures never break on a third-party fault.
20. As an operator, I want the transcript and reader services configured as Worker secrets, so that keys never appear in the repo.
21. As an operator, I want a missing operator secret to skip that fallback and save `partial`, so that local development and tests run without paid accounts.
22. As an operator, I want my worst-case spend bounded by Users times the daily allowance, so that sign-ups cannot run up an unbounded bill.
23. As an operator, I want the allowance number in one place, so that I can change it with one edit.
24. As an operator, I want the allowance read per User from one function, so that paid plans can later give different Users different limits without rewiring the pipeline.
25. As an operator, I want a rejected operator key or exhausted credits logged loudly, so that I notice an outage that every User would share.
26. As an operator, I want usage counted atomically, so that two captures at once cannot both squeeze under the limit.
27. As a developer, I want the UI and the stored-key code for transcript and reader removed, so that dead code does not linger.

## Implementation Decisions

- **Provider set:** Users store one key only, for OpenRouter. The transcript and reader providers are removed from the keys API, the settings screen, the key status type and the stored-key verification code. The key status response has only `openrouter`.
- **Operator secrets:** two new Worker secrets, one for the transcript service (Supadata) and one for the reader service (Jina). They follow the existing `YOUTUBE_API_KEY` pattern (ADR-0002): optional at runtime, absent means the fallback is skipped. Names are added to the local secrets example.
- **Key resolution:** the pipeline receives the operator secret instead of resolving a per-User key. The pipeline's extraction steps keep taking an optional key, so their contracts do not change.
- **Daily allowance:** a per-User, per-UTC-day count of paid lookups, kept separately for each service: one count for Supadata calls (transcript and metadata) and one for Jina calls. A new table holds `(user, day, service, count)`. Usage is recorded with a single atomic "increment only if under the limit" statement, so concurrent captures cannot exceed it. A refused call is not counted.
- **Allowance source:** one function returns the limit for a **User**. Today it returns, per service, one configured number for everyone: 2 per day for the transcript service and 2 per day for the reader service, in the shared config module (confirmed by the operator on 2026-09-30). It exists as a function so paid plans can later vary it; no plan model is built now.
- **Where the cap applies:** only immediately before a call that spends a paid lookup. Captures that finish without one (plain articles, captioned YouTube metadata from the operator Data API) never touch the allowance. Capture and Reprocess share the same path, so both respect it.
- **Partial reason:** items gain a nullable reason alongside `capture_quality`. The only value written now is `allowance_used`. Other partial causes keep null and their current copy.
- **Item API and view:** the item payload includes the reason. The item view shows, for `allowance_used`: "Saved, but the transcript or article text was not captured because today's limit is used. Reprocess tomorrow to complete it. It is still searchable by its link, title and note." The existing Reprocess action is unchanged.
- **Migration:** drops stored `transcript` and `reader` rows from the stored-keys table. Removing those two values from the provider enum is part of the same migration. The migration is destructive by design (ADR-0006); a backup runs before it is applied in production.
- **Docs:** settings copy and `docs/spec.md` §3 already reflect ADR-0006; the setup notes list the two new secrets.
- **Errors:** a paid lookup failing for any reason other than the cap (service down, credits exhausted, key rejected) saves the item `partial` with no reason, and logs an error naming the service.

## Testing Decisions

- A good test drives external behaviour only: HTTP in and out at the Worker, and rendered output in the web app.
- **Single highest seam: the Worker's HTTP surface** through the existing `request` helper and the extraction stubs (Supadata, Jina, YouTube Data API are already stubbed there). Tests cover: the keys API lists only OpenRouter and the removed provider routes answer 404; with operator secrets set, a YouTube link is captured with its transcript and a blocked page is read through the reader, with no User key; with no operator secret the item is `partial` without failing; once a User's allowance is used the next paid lookup is not made and the item is `partial` with reason `allowance_used`; a refused call does not increase the count; Reprocess the next UTC day (clock controlled) completes the item; a capture that needs no paid lookup never changes the count; two concurrent captures at the limit produce at most the allowed number of calls.
- **Web seam:** unit tests for the pure message logic of the partial reason, and a Playwright check that settings shows only the OpenRouter key and that an item with reason `allowance_used` shows the plain-language message with a Reprocess button (API responses mocked, as the auth e2e tests do).
- **Migration:** a database package test that stored transcript and reader keys are gone after the migration while OpenRouter keys survive.
- Prior art: `apps/api/test/optional-keys.test.ts`, `apps/api/test/keys.test.ts`, `apps/api/test/url-capture.test.ts`, `apps/api/test/video-capture.test.ts`, `apps/api/test/support/extraction-stub.ts`, `apps/web/e2e/auth-form.spec.ts`, `packages/db/src/index.test.ts`.

## Out of Scope

- Paid plans, pricing, plan tables and per-plan allowances. Only the single-function seam is built.
- A global daily budget across all Users (chosen against in ADR-0006's decision).
- Usage meters, dashboards or "N left today" counters in the UI.
- Changing what the pipeline extracts, or the AI-transcription rule in ADR-0002.
- Email or push notices when an allowance resets.
- Choosing new transcript or reader vendors.

## Further Notes

- Decision record: `docs/adr/0006-transcript-and-reader-run-on-operator-keys.md` (PR #70).
- The allowance is 2 per User per day for each service, set by the operator. Sizing (see `docs/research/18-supadata-jina-free-tiers.md`): the transcript service costs at most 60 credits per User per month, so Supadata Pro (3,000 credits) covers 50 always-maxing Users or about 200 at 25% usage. The reader service spends Jina tokens from a one-time free grant (10M, about 1,000 page fetches if a page is around 10,000 tokens, which is an unverified assumption); Jina's paid token price is unconfirmed and should be checked in its dashboard before growing past that.
- Before this ships, the operator must create Supadata and reader accounts and set the two Worker secrets; until then every video and blocked-page capture is `partial`, as it is for a User with no key today.
- Users who saved transcript or reader keys lose them on migration. Their captured items are unaffected.
