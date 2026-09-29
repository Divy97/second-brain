# ADR-0003: Instagram captures the caption, not the audio

Date: 2026-09-30
Status: Accepted
Amends: [ADR-0002](0002-youtube-metadata-and-transcripts.md)

## Context

ADR-0002 pinned every transcript call to `mode=native` so a video never silently bills at 2 credits per minute. That decision was reasoned about YouTube, where native captions usually exist and the cheap path usually works.

Instagram is not the same case. Supadata's own product page states it twice: "Instagram doesn't provide native captions, so Supadata always transcribes the audio using AI speech recognition (2 credits per minute of video)", and in its capability table, "Native captions — Not available on Instagram". Their pricing table lists the exact combination: `Instagram video` + `native` → "No transcript available response (206)" → 1 credit.

So on Instagram `mode=native` is not merely unlikely to succeed. It cannot succeed. Reusing `fetchTranscript` unchanged would spend one credit per capture to receive a guaranteed 206, for every Instagram link ever saved.

The alternative source of text is `/v1/metadata`, which costs the same 1 credit and returns the caption in `description`, plus author, hashtags and timestamp.

(One row of Supadata's own pricing table, "Instagram video with existing transcript | `auto` | returns existing transcript", contradicts the product page. Recorded in `docs/research/16-instagram-ingestion.md`; treated as an unpredictable bonus, never a design assumption.)

## Decision

1. **The Instagram path calls `/v1/metadata` and never `/v1/transcript`.** The caption is the captured content.
2. **Spoken audio in a reel is not transcribed.** Doing so needs `mode=generate` at 2 credits/minute, which is the exact billing behaviour ADR-0002 rejected. The rejection was not YouTube-specific, so it stands here.
3. **A post and a reel of the same shortcode are one item.** Dedupe is on `platform:mediaId`, not on the URL, so `/p/`, `/reel/`, `/reels/`, `/tv/`, `instagr.am` and `/{username}/p/` forms all collapse.

## Consequences

- An Instagram reel whose meaning lives entirely in its audio, with a thin caption, is close to unsearchable. This is the real cost of the decision and it is larger than the equivalent YouTube gap, where most videos carry captions.
- The honest remedy is the same one ADR-0002 named: an explicit per-item "transcribe this anyway" action that states the per-minute cost before spending it. That would serve uncaptioned YouTube videos and Instagram reels with one feature. It is not built.
- Without a transcript key, an Instagram capture is genuinely just the link and the user's note. `/v1/metadata` uses the same key, and Instagram's oEmbed needs an app token behind App Review plus Business Verification and returns embed HTML rather than caption text, so there is no free metadata path to fall back on.
- A private or deleted post is indistinguishable from the other: both return `404`. The item stays `partial` and the user is not told which.
- The URL parser is an unsanctioned heuristic, as the YouTube one is, though better evidenced: Meta documents `/p/` and `/reel/`; `/tv/`, `instagr.am` and `/{username}/p/` come only from the oEmbed registry, and `/reels/` from no primary source at all. It fails closed, and an unrecognised `instagram.com` link falls through to the article path rather than being guessed at.
