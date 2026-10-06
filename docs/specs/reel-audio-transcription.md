# Transcribing the audio of an Instagram reel

ADR: [ADR-0009](../adr/0009-instagram-reels-transcribe-their-audio.md)
Research: [23-reel-audio-transcription.md](../research/23-reel-audio-transcription.md)

## Problem Statement

An Instagram **Capture** takes the caption and never the audio (ADR-0003). For a reel the caption is marketing copy — a hook, a call to action and hashtags — so the thing the **User** actually saved the reel for is never captured. Ask has nothing to answer from and correctly says "I don't have anything saved about that." A real example:

```
https://www.instagram.com/reel/DeFRiX9ysWr/
careerwithrashi
Crack your next interview with this 30 second setup🎯💯 Comment "app" for link🔗
#interview #jobs #hiring #foryou #explore
```

The reports that surfaced this were about Hindi reels, but that caption is English. The retrieval stack is already multilingual; the spoken content was simply never captured.

## Solution

An Instagram capture whose media is a **video** also fetches a transcript of its audio from Supadata, on the operator key, within a daily allowance of its own. The caption is still captured; the transcript joins it in the item's text, so the reel becomes searchable by what was said in it. A photo post spends nothing extra. YouTube is untouched.

## Language

**Reel audio**:
The paid lookup that turns an Instagram video's speech into text, so a reel is searchable by what was said in it and not only by its caption. Spent only on media Instagram reports as a video, and capped per **User** per day apart from the other paid lookups.
_Avoid_: Reel transcript (Instagram has no caption track to fetch)

## User Stories

1. As a **User**, I want an Instagram reel's spoken words captured, so that I can ask about what the creator actually said.
2. As a **User**, I want the caption, author and hashtags kept alongside the transcript, so that nothing I had before is lost.
3. As a **User**, I want to ask in the reel's own language and find it, so that a Hindi reel is as searchable as an English one.
4. As a **User**, I want a photo post to cost nothing extra, so that my allowance is spent only where there is speech to hear.
5. As a **User**, I want a reel whose audio was not transcribed marked `partial`, so that I can tell the difference between a complete capture and a caption.
6. As a **User** past the **reel audio** allowance, I want the reel saved anyway with its caption, so that I never lose a link.
7. As a **User** past the allowance, I want the item to say today's limit is used and Reprocess works tomorrow, so that I know how to complete it.
8. As a **User**, I want Reprocess to fetch the audio once my allowance is available, so that reels saved before this existed can be completed.
9. As a **User**, I want my **reel audio** allowance counted apart from my transcript and reader allowances, so that one reel does not spend two transcript lookups and halve how many reels a day I can capture, and so that saving reels never starves article captures.
10. As a **User**, I want a silent or speechless reel still saved with its caption, so that a reel with no speech is not a failure.
11. As a **User**, I want a YouTube video to behave exactly as it does today, so that nothing I rely on changes.
12. As an operator, I want only `video` media to spend the audio allowance, so that cost follows a documented field rather than a guess about the caption.
    12a. As an operator, I want only reel-kind links to spend it, so that an hour-long `/tv/` item cannot cost sixty times what a reel costs.
    12b. As an operator, I want a duration past three minutes, or no stated duration at all, to be refused, so that per-minute billing is bounded even though the allowance counts calls.
    12c. As an operator, I want a refusal to leave the item `partial` rather than `full`, so that reels I declined to transcribe are visible and Reprocess can complete them if the bound is later relaxed.
13. As an operator, I want the audio call to use `mode=auto`, so that the cheaper native branch is taken if Supadata's undocumented one ever fires.
14. As an operator, I want the allowance counted in calls rather than credits, so that the async path's unreliable billing header cannot corrupt it.
15. As an operator, I want a Supadata outage or a refused key to leave the item `partial` rather than failed, so that captures never break on a third-party fault.
16. As an operator, I want the audio allowance in the same config block as the others, so that I can change it with one edit.

## Behaviour

### When the audio is fetched

| Media `type` from `/v1/metadata`                   | Audio lookup | Why                                                            |
| -------------------------------------------------- | ------------ | -------------------------------------------------------------- |
| `video`                                            | yes          | A reel; there is speech to capture.                            |
| `image`, `carousel`, `post`                        | no           | No audio track to transcribe.                                  |
| metadata unavailable (404/403, private or deleted) | no           | Nothing says it is a video, and the item is already `partial`. |

The caption is never the trigger. A thin-caption heuristic was prototyped and rejected; see ADR-0009.

### Capture quality

| Media       | Caption | Audio transcript       | Quality                            |
| ----------- | ------- | ---------------------- | ---------------------------------- |
| video       | any     | present                | `full`                             |
| video       | any     | absent, allowance used | `partial`, reason `allowance_used` |
| video       | any     | absent, other reason   | `partial`                          |
| not a video | present | n/a                    | `full`                             |
| not a video | absent  | n/a                    | `partial`                          |

A video with a caption but no transcript is `partial`. That is a deliberate change: caption-only used to count as complete, and this spec exists because it is not.

### Order and cost

Metadata first, then audio only if the metadata says `video`. One Instagram video therefore costs 1 metadata credit plus 2 generated-transcript credits, about $0.017 at Pro rates. A photo post costs 1, as it does today.

### Allowance

A new paid service, `reel_audio`, alongside `transcript` and `reader`. Default 2 per **User** per UTC day, matching the transcript allowance.

The separation is what keeps capacity intact rather than what raises it. An Instagram video spends one `transcript` lookup for its metadata and one `reel_audio` lookup for its audio; without the second bucket the same reel would spend two `transcript` lookups and a **User** would capture one reel a day instead of two. It follows that the metadata lookup, not the audio one, is the binding limit on reels, and that exhausting reel audio cannot touch the reader allowance an article capture needs.

A call refused for being over the allowance is not counted, per ADR-0006.

## Out of Scope

- YouTube audio generation. ADR-0002's rejection stands; ADR-0009 §7.
- Translating a transcript into English. Supadata prices it at 30 credits/minute and offers it for YouTube only.
- A per-item "transcribe this anyway" button. Video reels now transcribe by default, so there is nothing for a User to opt into; the allowance is the control.
- Fetching reel media ourselves. No sanctioned source exists; ADR-0009 §Context.
