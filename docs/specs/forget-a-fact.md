# Forget a fact manually

Issue: #60

## Problem Statement

The facts layer extracts atomic statements from a user's own words and keeps them valid until the pipeline itself supersedes them (ADD/UPDATE/DELETE/NOOP). A user has no way to retire a fact that is wrong, stale, or simply something they no longer want remembered — `docs/spec.md` §7 promises "forget this fact," but no route or UI exists for it. The user can see the item that produced a fact, but not the fact itself, and has no way to act on it.

## Solution

The item detail page shows the Facts extracted from that item, next to its existing Tags and Mentions. Each fact carries a Forget action. Forgetting a fact invalidates it the same way the pipeline does (`valid_to` set, never a physical delete), so it immediately stops surfacing in Ask, while its row and history remain for provenance.

## User Stories

1. As a user, I can see the Facts extracted from a note on that note's item page, so that I know what the Second Brain took from my own words.
2. As a user, I see no Facts section on an item that produced none, so that the page stays uncluttered.
3. As a user, I can Forget a fact from the item page, so that it stops being something the Second Brain remembers about me.
4. As a user, a fact I forget disappears from the item page immediately, so that I know the action took effect.
5. As a user, a fact I forget no longer appears in Ask's answers, so that forgetting actually works end to end.
6. As a user, forgetting a fact never deletes the item that produced it, so that my note itself is untouched.
7. As a user, I cannot forget another user's fact, so that my actions stay scoped to my own Second Brain.
8. As a user, forgetting a fact that was already forgotten (or never existed) tells me it's gone rather than silently succeeding, so that the extension/UI state stays honest.
9. As a user, a fact superseded by the pipeline's own UPDATE/DELETE reconciliation is already invisible wherever I'd look, so that Forget and automatic reconciliation feel like the same mechanism.
10. As a user, deleting the source item still hides its facts from Ask (existing behavior), so that Forget isn't the only way facts disappear.

## Implementation Decisions

**Language** (see `CONTEXT.md`): **Fact**, **Forget**. A Fact belongs to exactly one source item. Forgetting is the user-initiated counterpart to the pipeline's own invalidation — both set `valid_to`, neither physically deletes.

**Item detail.** `ItemDetail` gains a `facts` list: one entry per currently-valid fact (`valid_to is null`) sourced from that item, ordered oldest first. Fetched alongside the existing entities lookup, via a new query mirroring `listItemEntities` — a join with no new table, no new index. An item with no valid facts returns an empty list; the UI renders nothing for it, matching how Tags and Mentions already hide when empty.

**Forget action.** A new endpoint nested under the existing item routes, scoped by both the user and the source item: it sets `valid_to = now()` on exactly one fact where the fact's `userId` matches the caller, `sourceItemId` matches the item in the URL, and `validTo` is still null. Zero rows affected — whether the fact belongs to someone else, belongs to a different item, was already forgotten, or never existed — is a single not-found response. No distinction is drawn between those cases to the caller; the fact is simply gone either way.

**Retrieval.** Ask and all fact retrieval already filter on `valid_to is null`. Forgetting a fact requires no change there — it's covered by confirming the existing filter holds for this new invalidation path, not by adding a new one.

**UI.** The item page's existing Insights section (Summary, Tags, Mentions) gains a Facts block in the same place, each fact rendered with its text and a small Forget control. Follows `design-taste-frontend` and the single-theme rules already governing that page. Copy distinguishes an item's `kind` of `fact` from the Facts extracted from it (per the CONTEXT.md ambiguity note), e.g. "Facts extracted from this note."

**Schema.** No migration. `facts.valid_to` already exists and already means exactly this.

## Testing Decisions

A good test here drives the pipeline and the HTTP API only — never asserts on the query functions or storage layout directly. Prior art: `apps/api/test/pipeline.test.ts` (fact extraction and reconciliation) and `apps/api/test/items.test.ts` (item HTTP seam, ownership, 404s).

One seam: the API HTTP seam, using the existing request/sign-up test helpers.

Covers:

- Capturing a `fact`/`thought`/`meeting`/`quote` item through the pipeline, then `GET`-ing the item and seeing the extracted fact(s) listed.
- An item that produced no facts has an empty (or absent) facts list.
- Forgetting a fact via the new endpoint, then confirming it no longer appears on a subsequent `GET` of the item.
- Asking a question that previously matched only the forgotten fact and confirming it's no longer cited (reusing the `ask.test.ts` pattern of answering from extracted facts).
- Forgetting a fact that belongs to another user, a different item, or doesn't exist — all return not-found, and don't affect any other user's or item's facts.
- Forgetting a fact twice — the second call is also not-found, not a crash.
- Deleting the source item still hides its facts from Ask (regression check on existing behavior, not new code).

## Out of Scope

- Bulk-forgetting all facts from an item in one action.
- Un-forgetting (restoring) a forgotten fact.
- Editing a fact's text directly (forgetting and letting the pipeline re-extract on reprocess is the only path).
- A cross-item Facts view outside the item page.
- Any change to how the pipeline's own ADD/UPDATE/DELETE/NOOP reconciliation works.

## Further Notes

- This is additive to the existing facts layer (`docs/specs/facts-layer.md`) and does not change its schema or reconciliation logic.
- CONTEXT.md was updated in the planning session with **Fact** and **Forget** glossary entries, including the ambiguity note distinguishing an item's `fact` kind from the Facts it produces.
