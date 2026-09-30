# ADR-0006: Transcript and reader services run on operator keys, behind a per-user daily cap

Date: 2026-09-30
Status: Accepted
Amends: [ADR-0001](0001-jina-reader-as-the-reader-api.md), [ADR-0003](0003-instagram-captures-the-caption-not-the-audio.md); narrows `docs/spec.md` §3 ("BYOK for everything that costs money")

## Context

Asking every User for a transcript key (Supadata) and a reader key (Jina) pushed product plumbing onto the User. Settings asked for three keys when only the OpenRouter key carries the User's own model spend. ADR-0002 already funds YouTube metadata from an operator secret, so operator-paid fallbacks have precedent. The risk is cost: with open sign-up, every YouTube or Instagram link a User saves would spend operator credits.

## Decision

1. Only the OpenRouter key stays per-User. Settings asks for nothing else.
2. The transcript and reader fallbacks use operator Worker secrets, like `YOUTUBE_API_KEY`. Unset, a fallback is skipped and the item is saved `partial`, as it is today without a User key.
3. Each User has a daily allowance of paid fallback calls. Past it, the capture still saves and stays `partial`; it never fails. The limit is a number set in the spec, not in this record.
4. A `partial` item caused by the allowance says so in plain words: it is saved and searchable by its link, title and note, but the transcript or article text was not captured because today's allowance is used, and Reprocess works tomorrow. Reprocess counts against the allowance like any capture; a call refused for being over the allowance is not counted.
5. The allowance is read from one place per User, so paid plans can later give different Users different limits. No plan model is built now.
6. Keys Users already saved for these two services are deleted, since nothing reads them.

## Consequences

- Operator spend is bounded by Users times the daily allowance, not by anyone's behaviour.
- A User hitting the allowance sees partial captures; the settings page needs no key UI for that, but the UI should say why an item is partial.
- Exhausted operator credits or a rejected operator key degrade every User at once. That is an outage to alert on, not something a User can fix (same as ADR-0002's operator key).
- ADR-0003's Instagram behaviour is unchanged except that "a User without a transcript key" becomes "a User past the allowance, or an unset operator key".
