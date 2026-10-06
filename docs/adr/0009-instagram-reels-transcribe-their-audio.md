# ADR-0009: Instagram reels transcribe their audio; posts and YouTube do not

Date: 2026-10-06
Status: Accepted
Amends: [ADR-0003](0003-instagram-captures-the-caption-not-the-audio.md); extends [ADR-0006](0006-transcript-and-reader-run-on-operator-keys.md)

## Context

ADR-0003 decided that an Instagram **Capture** takes the caption and never the audio, and named the cost of that decision in its own words: "An Instagram reel whose meaning lives entirely in its audio, with a thin caption, is close to unsearchable." That case turned out to be the common case, not the edge case. A real reel saved by a User produced this and nothing else:

```
https://www.instagram.com/reel/DeFRiX9ysWr/
careerwithrashi
Crack your next interview with this 30 second setup🎯💯 Comment "app" for link🔗
#interview #jobs #hiring #foryou #explore
```

A hook, a call to action and five hashtags. Not one word of what the creator said. Ask cannot answer from it, and correctly says so. Reel captions are marketing copy; that is their function.

The motivating reports were about Hindi reels, but the caption above is in English. Language is not the fault. `docs/research/23-reel-audio-transcription.md` confirms every language-sensitive component is already multilingual: `baai/bge-m3` embeddings, `to_tsvector('simple', …)`, a chunker that splits on `।`, and a reranker told that "notes may be in any language". The fault is that the spoken content was never captured in any language.

Three findings constrain the remedy, all in `docs/research/23-reel-audio-transcription.md`:

1. **We cannot fetch reel audio ourselves.** Supadata's `/v1/metadata` returns no media URL for a video: the `video` branch of the `media` discriminator carries `type`, `duration` and `thumbnailUrl` only. Every cheaper transcriber — Groq at $0.00067 per reel, Cloudflare Workers AI at $0.0005, OpenRouter's `whisper-large-v3-turbo` at $0.0002 on the User's own key — needs a URL or bytes we do not have.
2. **Obtaining that URL another way is not sanctioned.** Instagram's Terms of Use prohibit "accessing or collecting information in an automated way … without our express permission", "regardless of whether such automated access or collection is undertaken while logged in". A headless browser that scrapes a CDN URL is the thing that clause describes. Meta's own `media_url` field is own-media-only.
3. **Supadata is the only service that resolves an `instagram.com/reel/…` URL to a transcript, and it is the most expensive option on the table** — 2.2× Deepgram's Hindi rate, 17× Groq's, 57× OpenRouter's cheapest. We pay that premium for exactly one capability, and there is no second supplier.

A caption-thinness heuristic was prototyped as a way to spend less. It does not work. After stripping hashtags, emoji, mentions and call-to-action phrases, the reel above leaves nine substantive words — the same count as a caption that genuinely describes its video. Both are topic announcements; neither is content. No threshold separates them, and a rule tuned against one real caption and six invented ones is a guess wearing a test suite.

## Decision

1. **An Instagram capture whose media is a video also fetches a transcript of its audio.** The caption is still captured, and both go into the item's text.
2. **The media type decides, not the caption.** Supadata's metadata `type` discriminator is `video | image | carousel | post`; only `video` spends. A photo post has no audio and costs nothing beyond the metadata call it already made. This is the cost control the caption heuristic failed to be: it is a documented field, not an inference.
3. **Length is bounded twice, because the allowance cannot bound it.** The allowance counts calls while Supadata bills per minute, so only a link that arrived as `/reel/` or `/reels/` spends it — Instagram caps a reel at 3 minutes, where a `/tv/` item runs to an hour and would cost 120 credits in a single capture — and a stated `media.duration` past 180 seconds is refused. An unstated duration is allowed. This was first shipped failing closed, on the reasoning that an absent duration is an unbounded per-minute charge rather than a short one. **That refused every reel in production**: observed 2026-10-06, Supadata returns no `duration` for an Instagram reel at all, so the requirement could never be met and the stated-duration branch is dead until they populate the field. The path kind is the bound that actually holds, and unlike anything in Supadata's response it is ours. Supadata's undocumented `additionalData.hasAudio` read `false` for a reel of someone speaking, so that object is not trusted for gating either.
4. **The call is `mode=auto`, not `mode=generate`.** The contradiction ADR-0003 recorded is still unresolved in Supadata's docs — one table row still claims an Instagram video can have an existing transcript, which the product page denies. `auto` costs 1 credit instead of 2 if that branch ever fires and 2 otherwise; `generate` always costs 2. There is no downside, because by this point the spend is already sanctioned.
5. **The audio transcript is a separate paid service with its own daily allowance**, counted apart from `transcript` and `reader` under ADR-0006. It is the expensive call and it is the one whose limit will move when this becomes a paid plan; metadata accounting stays as it is.
6. **A video whose audio was not transcribed is `partial`, not `full`**, whatever the reason — allowance, outage, or a length bound we chose not to cross. Caption-only used to count as a complete capture. It no longer does for a video, because this record exists precisely because that text is not enough.
7. **YouTube is unchanged and stays on `mode=native`.** ADR-0002's reasoning is untouched: YouTube videos usually carry native captions, they run to hours rather than seconds, and generating transcripts for them at 2 credits per minute is the billing behaviour that ADR-0002 rejected and this record does not revisit.

## Consequences

- An Instagram video costs 3 credits where it used to cost 1: one for metadata, two for a minute of generated transcript. At Pro rates that is roughly $0.017 per reel, and a Pro plan's 3,000 credits covers about 1,000 of them a month. Operator spend stays bounded by Users × allowance, as ADR-0006 requires.
- **Supadata's Hindi quality is unverified and unverifiable from primary sources.** They publish no ASR language list, never name the model, ignore the `lang` parameter under generation, and hedge about "heavy accents". Hindi reels are the motivating case and this is the one option whose fitness for them cannot be established before buying it. One live call on a real Hindi reel settles it; until then this is a known, accepted risk, not an oversight.
- A silent reel is still billed by duration, and a request that times out client-side is still charged. The allowance counts calls rather than credits, because the async path reports `0` in its own billing header and reconciles only in Supadata's dashboard.
- **Supadata does not populate `media.duration` for Instagram**, confirmed against a live response on 2026-10-06. The residual exposure this leaves is a video longer than three minutes served at a `/reel/` URL: it would cost 2 credits a minute against a cap that counts calls. Instagram's current Reels product caps uploads at three minutes and legacy long-form sits at `/tv/`, which is excluded, so the common case is bounded in practice but not by anything we enforce. Worth revisiting with real spend data now that Worker logs are retained.
- Reels captured before this change stay caption-only until reprocessed. Reprocess spends from the allowance like any capture, exactly as ADR-0006 already specifies.
- The cheap paths stay open if a sanctioned media URL ever appears. `openRouter.transcribe` already runs on the User's key for voice notes, at roughly 1/57th of Supadata's price and outside the operator allowance entirely. That is the design to migrate to the day the audio source exists, and `docs/research/23-reel-audio-transcription.md` records what it would cost.
