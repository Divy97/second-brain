# Reel audio transcription: Supadata `mode=generate`, media URLs, and the remote-URL ASR market

Checked 2026-10-06 against Supadata's documentation (`docs.supadata.ai`, including the raw OpenAPI spec at `/api-reference/v1-openapi.json`, version 1.3.0) and Supadata's own pricing and product pages; OpenRouter's Speech-to-Text guide, its `/audio/transcriptions` OpenAPI schema and its live public models API; Deepgram's pricing and developer docs; AssemblyAI's pricing and docs; ElevenLabs' Scribe API reference and API pricing page; Groq's speech-to-text console docs; OpenAI's API pricing page; Cloudflare's Workers AI pricing, limits and model input schemas; and Meta's Instagram Platform reference, Developer Policies and Instagram Terms of Use. Answers whether an explicit per-item "transcribe this anyway" action on an Instagram reel can be funded more cheaply than Supadata's own ASR, and what it costs on the operator key under ADR-0006. Related: `16-instagram-ingestion.md`, `02-video-ingestion-youtube-instagram-compute.md`, `18-supadata-jina-free-tiers.md`; amends the numbers in doc 02, which were checked 2026-09-27.

**The headline, stated up front because it collapses most of the question.** Supadata's `/v1/metadata` returns no media URL for a video — the `video` branch of the `media` discriminator carries `type`, `duration` and `thumbnailUrl` and nothing else. [v1-openapi.json](https://docs.supadata.ai/api-reference/v1-openapi.json) Every cheaper ASR provider in §3 needs either a URL we can hand it or bytes we have to hold. We have neither. So §3's price list is a plan for a future where we have a media URL, not a plan we can execute today; §1 is the only path that works now.

## 1. Supadata `/v1/transcript` with `mode=generate` on Instagram

### It works on Instagram, and it is the documented remedy

- `mode` is `native | auto | generate`, default `auto`: "`native` (only fetch existing transcript), `generate` (always generate transcript using AI), or `auto` (try native, fallback to generate if unavailable)". [v1-openapi.json](https://docs.supadata.ai/api-reference/v1-openapi.json), [Transcript](https://docs.supadata.ai/get-transcript.md)
- Instagram is a listed `url` platform on the same endpoint: "Instagram video URL, e.g. `https://instagram.com/reel/1234567890/`". [Transcript](https://docs.supadata.ai/get-transcript.md)
- Supadata's Instagram product page says generation is the _only_ mode that can work there: "Instagram doesn't provide native captions, so Supadata always transcribes the audio using AI speech recognition (2 credits per minute of video)". [Instagram Transcript API](https://supadata.ai/instagram-transcript-api) This is the same statement ADR-0003 rests on, re-read today and unchanged.
- The documented remedy for the `206` ADR-0003 avoids is exactly this: "Use the `/transcript` endpoint with `mode=generate` or `mode=auto` option to generate captions for the video". [Transcript Unavailable](https://docs.supadata.ai/errors/transcript-unavailable.md)

### Credit cost, and what "per minute" does not say

- The rate is unchanged from doc 16 and doc 18: "1 native transcript = 1 credit", "1 generated transcript minute = 2 credits". [Transcript](https://docs.supadata.ai/get-transcript.md) The pricing page agrees: "1 generated transcript minute = 2 credits". [Pricing](https://supadata.ai/pricing) The Instagram product page agrees: "2 credits/min". [Instagram Transcript API](https://supadata.ai/instagram-transcript-api) Three independent Supadata surfaces, one number.
- **Rounding and minimum charge are not documented.** The examples table's TikTok row is the only hint: "TikTok video | `generate` | Supadata generates transcript with AI | 2 per min of video (usually 2)". [Transcript](https://docs.supadata.ai/get-transcript.md) "Usually 2" for a format whose clips are mostly well under a minute reads as rounding up to a whole minute with a 1-minute floor, but Supadata never says so. Treat 2 credits as the floor for any reel and **do not** assume a 20-second reel costs less than a 60-second one. Unverified.
- Other known charges on this path: "1 credit is charged when request to get a transcript returns status 206 (Transcript Unavailable)"; "No credits are charged for checking transcription job status"; and silence is still billed — "An HTTP 200 response with an empty `content` array (`[]`) means the transcription was successful but no speech was detected in the audio/video. Such requests are still charged according to the media duration." [Transcript](https://docs.supadata.ai/get-transcript.md) A silent reel costs the same as a talking one. The "transcribe this anyway" action must say so before it spends.
- There is also a timeout trap worth designing against: "if your app times out before receiving a response, the request will still count towards your credit usage." [Transcript](https://docs.supadata.ai/get-transcript.md)
- **The contradiction doc 16 recorded is still in the docs, unresolved.** The same table still carries "Instagram video with existing transcript | `auto` | Supadata returns existing transcript | 1", which cannot be reconciled with "Instagram doesn't provide native captions". [Transcript](https://docs.supadata.ai/get-transcript.md), [Instagram Transcript API](https://supadata.ai/instagram-transcript-api) Both are Supadata's own words. For a deliberate "transcribe anyway" action this is actually an argument for `mode=auto` over `mode=generate`: if the unexplained native branch ever fires, `auto` pays 1 credit instead of 2 and `generate` ("always generate transcript using AI") pays 2 regardless. [v1-openapi.json](https://docs.supadata.ai/api-reference/v1-openapi.json) The risk of `auto` is nil here, because the User has already consented to the generate price.

### Async: 202 + jobId, and when it fires

- "For large videos that require processing time, the API returns HTTP 202 with a job ID. Use the `/transcript/{jobId}` endpoint to poll for results." The 202 body is `{"jobId": string}`. [Transcript](https://docs.supadata.ai/get-transcript.md)
- Threshold: "Videos longer than 20 minutes will automatically trigger an asynchronous job". But the 202 is not confined to that case: "A request for a platform URL (YouTube, TikTok, Instagram, X, Facebook) may also start synchronously and switch to an asynchronous job while in flight — clients should always be prepared to handle a 202 + job ID response for `mode=generate`, regardless of video length. This in-flight handoff does not apply to file URLs." [Transcript](https://docs.supadata.ai/get-transcript.md) A 30-second reel can still come back 202.
- Job statuses are `queued | active | completed | failed`; on `completed` the body carries `content`, `lang`, `availableLangs`, on `failed` an `error`. [Transcript](https://docs.supadata.ai/get-transcript.md)
- Polling: "We recommend polling every 1 second" and "Job results are available for **1 hour** after completion. After that, the endpoint will return a `404 Not Found` error." [Transcript](https://docs.supadata.ai/get-transcript.md) Our client polls every 2 s for 30 attempts (`packages/ai/src/supadata.ts`), i.e. a 60-second ceiling — fine for a reel, but the documented interval is 1 s and the documented sync ceiling is "up to ~100 seconds". [Transcript](https://docs.supadata.ai/get-transcript.md)
- Billing on the async path is deferred and the headers lie in a documented way: "For asynchronous jobs (HTTP 202), the `x-billable-requests` header on the 202 response is a precharge estimate. The final amount is reconciled once the job completes and is visible in the dashboard; the job status endpoint always reports `0`." [Transcript](https://docs.supadata.ai/get-transcript.md) So we cannot read the true cost of a reel transcript out of the response. The allowance in ADR-0006 must be counted in calls, not in credits.

### `lang`, translation, and what languages the ASR covers

- `lang` is "Preferred language code of the transcript (ISO 639-1)". [v1-openapi.json](https://docs.supadata.ai/api-reference/v1-openapi.json)
- **It is inert on the path we care about:** "When `mode = generate`, the `lang` parameter is ignored and the transcript is generated in the language of the video." [Transcript](https://docs.supadata.ai/get-transcript.md) The video-transcript page repeats it for file URLs: "The language is auto-detected; the `lang` parameter is ignored for file URLs." [Video Transcript API](https://supadata.ai/video-transcript-api) We cannot pin a Hindi reel to `hi`, and we cannot ask for an English rendering.
- Translation is a separate, far more expensive product and is YouTube-only in the spec's paths (`/v1/youtube/transcript/translate`), priced at "1 transcript translation minute = 30 credits". [Pricing](https://supadata.ai/pricing), [v1-openapi.json](https://docs.supadata.ai/api-reference/v1-openapi.json) At 15× the generation rate it is out of scope.
- **Hindi ASR support is Unverified.** The only language list Supadata publishes is headed "Supported languages for YouTube transcripts" and describes the `lang` parameter for _existing_ YouTube caption tracks; `hi | Hindi` is a row in it. [Languages](https://docs.supadata.ai/youtube/supported-language-codes.md) That page is about native caption selection, not about which languages the AI model can hear, and `lang` is ignored under `generate` anyway — so it does not answer the question. The only claim that does is marketing copy on two product pages, "100+ languages, auto-detected", with no list, no model named and no WER. [Instagram Transcript API](https://supadata.ai/instagram-transcript-api), [Video Transcript API](https://supadata.ai/video-transcript-api) Supadata never names the ASR model it uses. What they do publish about accuracy is a hedge: "AI speech recognition is quite accurate for clear audio with standard accents, but it may struggle with heavy accents, background noise, or technical jargon." [Instagram Transcript API](https://supadata.ai/instagram-transcript-api) I tried the docs index, the language-codes page, both product pages and the OpenAPI spec; none enumerates ASR languages or names Hindi.

### Plan and top-up pricing, re-verified today

| Plan       | Price          | Credits/month | Rate limit | Auto-recharge  |
| ---------- | -------------- | ------------- | ---------- | -------------- |
| Free       | $0             | 100           | 10/s       | —              |
| Basic      | $5/mo ($60/yr) | 300           | 10/s       | $10 per 1,000  |
| Pro        | $17/mo         | 3,000         | 10/s       | $10 per 1,000  |
| Mega       | $47/mo         | 30,000        | 100/s      | $20 per 20,000 |
| Giga       | $297/mo        | 300,000       | 100/s      | $20 per 20,000 |
| Supa       | $897/mo        | 1,000,000     | 100/s      | $20 per 20,000 |
| Enterprise | custom         | custom        | custom     | custom         |

[Pricing](https://supadata.ai/pricing)

Two deltas against our own records, both small and both in our favour:

- Doc 02 (checked 2026-09-27) lists "$47 = 30k" and "Top-ups $10/1k" generally. The top-up block size is now tiered: $10/1,000 on Basic and Pro, **$20/20,000** on Mega and above — i.e. $0.001 per credit at Mega, not $0.01. [Pricing](https://supadata.ai/pricing)
- Doc 18 records the Free plan at "1 request/second". The pricing page read today groups Free with Basic and Pro at 10/s. [Pricing](https://supadata.ai/pricing) Low confidence either way; it is a pricing-table cell, not prose, and it does not affect any decision here.
- Credits still do not roll over, per doc 18's reading of the same page. [Pricing](https://supadata.ai/pricing)

Derived credit price, which §4 uses: Pro $17 ÷ 3,000 = **$0.00567/credit**; Mega $47 ÷ 30,000 = **$0.00157/credit**; Basic/Pro top-up = **$0.01/credit**; Mega+ top-up = **$0.001/credit**.

## 2. Does `/v1/metadata` hand us a fetchable reel media URL? No.

This is the decisive finding and it is unambiguous in the spec.

The `Metadata` schema's `media` field is a `oneOf` "discriminated by type field (video, image, carousel, or post)". The four branches are: [v1-openapi.json](https://docs.supadata.ai/api-reference/v1-openapi.json)

| `type`     | Fields                                                                                                                            | Carries a media URL?     |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `video`    | `type` (const `"video"`), `duration` (number, "Video duration in seconds"), `thumbnailUrl` ("Largest/best quality thumbnail URL") | **No**                   |
| `image`    | `type` (const `"image"`), `url` ("Direct URL to the image") — `url` is **required**                                               | Yes, for stills only     |
| `carousel` | `type`, `items[]`, each item itself a video object (`duration`, `thumbnailUrl`) or an image object (`url`)                        | Only for the image items |
| `post`     | `type` only                                                                                                                       | No                       |

[v1-openapi.json](https://docs.supadata.ai/api-reference/v1-openapi.json)

So for an Instagram reel — `type: "video"` — the only URLs in the entire response are `url` ("Canonical URL to the media", i.e. the instagram.com page we already have), `author.avatarUrl`, and `media.thumbnailUrl`. There is **no** `videoUrl`, no `audioUrl`, no `downloadUrl`, no signed CDN link. The only required field on the `video` branch is `type` itself, so even `duration` and `thumbnailUrl` are not guaranteed. The spec has no field whose expiry or signing could be discussed, because the field does not exist.

Three consequences:

1. **The "skip Supadata's ASR, feed audio to a cheaper provider" plan has no audio source.** Supadata's own `/v1/transcript` would happily take one — `url` accepts "a direct media file URL", and "If url is a file URL, mode is always `generate`", with MP4/WEBM/MP3/FLAC/MPEG/MPGA/M4A/OGG/WAV accepted up to "750 MB" and "12 hours" [Transcript](https://docs.supadata.ai/get-transcript.md), [v1-openapi.json](https://docs.supadata.ai/api-reference/v1-openapi.json) — but Supadata will not tell us what that URL is for a reel. Resolving the reel to a media URL ourselves is the scraping problem doc 02 catalogued and ADR-0003 declined.
2. **`media.duration` is the one useful number here** — it is the only documented way to show the User the cost before spending, since the price is per minute. It is optional on the branch, so the UI needs a path for "duration unknown".
3. Doc 16's caveat still stands and is worth repeating: there is no Instagram sample response anywhere in Supadata's docs or spec, so which of these optional fields actually populates for a reel has never been observed in this repo. [Metadata](https://docs.supadata.ai/get-metadata.md)

**Whether Instagram CDN URLs are fetchable server-side without auth: Unverified, and deliberately not tested.** No primary source documents the behaviour of `cdninstagram.com` / `scontent.*` URLs, because Meta documents no public reel-media endpoint at all. The nearest first-party statement is about the Graph API's own field: `media_url` is "The URL for the media. **Warning:** The `media_url` field is omitted from responses if the media contains copyrighted material or has been flagged for a copyright violation" — and the Graph API is own-media-only, Business/Creator accounts. [IG Media reference](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-media) That reference says nothing about expiry, signing, or caching. I looked for a documented statement on CDN URL lifetime in the Instagram Platform reference, the Developer Policies and the Platform Terms and found none. No live fetch of a CDN URL was attempted.

## 3. ASR providers that accept a remote URL

Read this as a price list for a capability we do not yet have an input for (see §2). Hindi is called out per row because it is the motivating case.

### Deepgram — Nova-3

- **URL input: yes.** The pre-recorded API takes a JSON body with a `url` field: `--data '{"url":"https://dpgr.am/spacewalk.wav"}'`. [Pre-recorded audio](https://developers.deepgram.com/docs/pre-recorded-audio)
- **Price:** Nova-3 monolingual pre-recorded "$0.0043/min" pay-as-you-go, "$0.0036/min" on Growth; Nova-3 multilingual "$0.0052/min" PAYG, "$0.0043/min" Growth. [Pricing](https://deepgram.com/pricing)
- **Hindi: yes, via the multilingual variant.** `nova-3` / `nova-3-general` is documented as "Multilingual (English, Spanish, French, German, Hindi, Russian, Portuguese, Japanese, Italian, and Dutch)" and lists `hi` individually. [Models and languages](https://developers.deepgram.com/docs/models-languages-overview) So the Hindi price is the **multilingual** $0.0052/min, not $0.0043. No per-language WER is published.
- **Limits:** "Maximum 2 GB"; "Requests exceeding 10 minutes (Nova/Base/Enhanced) or 20 minutes (Whisper) return a `504: Gateway Timeout` error." [Pre-recorded audio](https://developers.deepgram.com/docs/pre-recorded-audio) A reel is far inside both.
- **Async:** a `callback=URL` query parameter returns a `request_id` immediately and delivers the result by webhook. [Callback](https://developers.deepgram.com/docs/callback) Whether the callback path lifts the 10-minute sync ceiling is not stated on that page — Unverified, and irrelevant for 60-second reels.
- **Language detection:** `detect_language` exists as a Deepgram option (it appears in Cloudflare's mirrored Nova-3 input schema as "Identifies the dominant language spoken in submitted audio"). [Workers AI nova-3 schema](https://developers.cloudflare.com/workers-ai/models/nova-3/schema-input.json)
- **Free:** "$200 free credit" with no credit card. [Pricing](https://deepgram.com/pricing)

### AssemblyAI — Universal

- **URL input: yes**, and it is the primary form: `"audio_url": "https://assembly.ai/wildfires.mp3"`. [Pre-recorded audio](https://www.assemblyai.com/docs/speech-to-text/pre-recorded-audio)
- **Price:** Universal-3.5 Pro "$0.21/hr" (= $0.0035/min); Universal-2 "$0.15/hr" (= $0.0025/min). [Pricing](https://www.assemblyai.com/pricing)
- **Slam-1 is gone.** The pricing page marks SLAM-1 "Deprecated — do not use", and the legacy `best` / `nano` identifiers "are no longer valid". [Pricing](https://www.assemblyai.com/pricing) Any design naming Slam-1 is already stale.
- **Hindi: yes**, listed as `{ name: "Hindi", code: "hi" }` under both Universal-3.5 Pro and Universal-2. For Universal-2, Hindi sits in the published "Good accuracy" band, **WER 10–25%**. No per-language WER is published for Universal-3.5 Pro. [Supported languages](https://www.assemblyai.com/docs/speech-to-text/pre-recorded-audio/supported-languages)
- **Limits:** up to 5 GB per request by URL (2.2 GB for uploads); duration "160 ms to 10 hours". [Pre-recorded audio](https://www.assemblyai.com/docs/speech-to-text/pre-recorded-audio)
- **Async:** always. Submit, then poll `/v2/transcript/{id}` until `completed` or `error`; webhooks available. [Pre-recorded audio](https://www.assemblyai.com/docs/speech-to-text/pre-recorded-audio)
- **Language detection:** `language_detection: true`. [Pre-recorded audio](https://www.assemblyai.com/docs/speech-to-text/pre-recorded-audio)
- **Free:** "$50 in free credits, no credit card required". [Pricing](https://www.assemblyai.com/pricing)

### ElevenLabs — Scribe

- **URL input: yes, but the parameter is marked deprecated.** `cloud_storage_url` is "The HTTPS URL of the file to transcribe… Any valid HTTPS URL is accepted, including URLs from cloud storage providers (AWS S3, Google Cloud Storage, Cloudflare R2, etc.), CDNs, or any other HTTPS source", HTTPS-only, up to 2 GB. A sibling `source_url` parameter also appears in the body schema. **The reference flags `cloud_storage_url` as deprecated without naming its replacement**, and does not document `source_url`'s semantics — so which of the two is the supported remote-URL field today is ambiguous in ElevenLabs' own reference. [Speech-to-Text convert](https://elevenlabs.io/docs/api-reference/speech-to-text/convert)
- **Price:** Scribe v2 and Scribe v2 Medical "$0.22" per hour (= $0.003667/min); Scribe v2 Realtime "$0.39" per hour. [API pricing](https://elevenlabs.io/pricing/api)
- **Hindi: yes, and it is the only provider here that publishes a Hindi accuracy band.** Scribe v2 covers "90+ languages" and Hindi is listed under "High Accuracy (>5% to ≤10% WER)", against bands of Excellent (≤5%), High (>5–10%), Good (>10–20%) and Moderate (>25–50%). [Speech-to-Text](https://elevenlabs.io/docs/capabilities/speech-to-text) That is the best published Hindi number in this section — materially better than AssemblyAI Universal-2's 10–25% band.
- **Limits:** direct upload "less than 5.0GB", remote URL "less than 2GB"; duration "up to 10 hours". [Speech-to-Text convert](https://elevenlabs.io/docs/api-reference/speech-to-text/convert), [Speech-to-Text](https://elevenlabs.io/docs/capabilities/speech-to-text)
- **Async:** a `webhook` parameter — "If set the request will return early without the transcription, which will be delivered later via webhook." [Speech-to-Text convert](https://elevenlabs.io/docs/api-reference/speech-to-text/convert)
- **Language detection:** `language_code` "Defaults to null, in this case the language is predicted automatically." [Speech-to-Text convert](https://elevenlabs.io/docs/api-reference/speech-to-text/convert)
- **Free:** the API pricing page references a free/pay-as-you-go tier but does not state included Scribe minutes. Unverified.

### Groq — whisper-large-v3-turbo

- **URL input: yes.** "Max Attachment File Size: 25 MB. If you need to process larger files, use the `url` parameter to specify a url to the file instead." The docs describe the parameter but ship **no code example using it**, and state no URL-specific size cap, redirect policy or public-reachability requirement. [Speech to text](https://console.groq.com/docs/speech-to-text)
- **Price:** `whisper-large-v3` "$0.111" per hour (= $0.00185/min); `whisper-large-v3-turbo` "$0.04" per hour (= $0.000667/min). [Speech to text](https://console.groq.com/docs/speech-to-text)
- **Minimum charge:** "Minimum Billed Length: 10 seconds. If you submit a request less than this, you will still be billed for 10 seconds." [Speech to text](https://console.groq.com/docs/speech-to-text) Irrelevant for a 60-second reel; relevant for the 7-second ones.
- **Hindi: yes.** Both models are documented as multilingual with Hindi included; published WER figures are aggregate, not per-language — `whisper-large-v3` 10.3%, `whisper-large-v3-turbo` 12%. [Speech to text](https://console.groq.com/docs/speech-to-text) No Hindi-specific number.
- **Limits:** 25 MB free tier / 100 MB dev tier for attachments. "Only the first track will be transcribed for files with multiple audio tracks." [Speech to text](https://console.groq.com/docs/speech-to-text)
- **Language detection:** auto-detected, or pinned with `language` in ISO-639-1. [Speech to text](https://console.groq.com/docs/speech-to-text)

### OpenAI — gpt-4o-transcribe / whisper

- **URL input: no.** OpenAI's transcription endpoint is a multipart file upload; no `url` field is documented. (Not restated from a pricing page — this is the absence of any URL parameter in the transcription API, which is why OpenAI is listed here only for price comparison.)
- **Price:** `gpt-4o-transcribe` "Estimated cost $0.006 / minute"; `gpt-4o-mini-transcribe` "Estimated cost $0.003 / minute"; "Whisper" listed under Transcription at "Estimated cost $0.006 / minute". [API pricing](https://developers.openai.com/api/docs/pricing) The page lists the model as "Whisper", not `whisper-1`.
- **Hindi:** no per-language support table or WER is published on the pricing page. Unverified from OpenAI primary sources; Whisper's multilingual Hindi capability is attested second-hand through Groq and OpenRouter, not by an OpenAI doc I could cite.

### Cloudflare Workers AI

- **URL input: no — and this is the blocker, not the price.** `@cf/deepgram/nova-3`'s input schema has exactly one required property, `audio`, an object of `{ body, contentType }`; there is no `url` property anywhere in the schema. [nova-3 schema-input.json](https://developers.cloudflare.com/workers-ai/models/nova-3/schema-input.json) `@cf/openai/whisper-large-v3-turbo` takes `audio` as either "Base64 encoded value of the audio data" or `{ body, contentType }` — again no URL. [whisper-large-v3-turbo schema-input.json](https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/schema-input.json) Either way the Worker must hold the whole audio body in its 128 MB.
- **Price in neurons and dollars:** the neuron rate is "$0.011 per 1,000 Neurons" with "10,000 Neurons per day at no charge". [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)

  | Model                               | Neurons                  | $ per audio minute             |
  | ----------------------------------- | ------------------------ | ------------------------------ |
  | `@cf/openai/whisper`                | 41.14 per audio minute   | $0.0005                        |
  | `@cf/openai/whisper-large-v3-turbo` | 46.63 per audio minute   | $0.0005                        |
  | `@cf/deepgram/nova-3`               | not published in neurons | $0.0052 per audio minute input |

  [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)

  The free daily grant works out to 10,000 ÷ 46.63 ≈ **214 audio minutes per day** on whisper-large-v3-turbo — about 214 one-minute reels a day across the whole operator account, free. That is the single largest free tier in this document. (Arithmetic mine, from the two published numbers.)

- **Is there a binding usable from this Worker?** Not today — `apps/api/wrangler.jsonc` declares `HYPERDRIVE`, `ITEM_FILES`, `BACKUPS`, `ITEMS_QUEUE` and `PROCESS_ITEM_WORKFLOW`, and no `ai` binding. Adding one is a config change, not an architectural one.
- **Rate limit:** "Automatic Speech Recognition - 720 requests per minute". [Workers AI limits](https://developers.cloudflare.com/workers-ai/platform/limits/) Max audio file size and duration for the whisper models are **not** stated on the limits page. Unverified; I checked the limits page and both model input schemas.
- **Hindi:** Cloudflare publishes no per-language support matrix for its whisper models. `@cf/deepgram/nova-3` inherits Deepgram's Nova-3 multilingual coverage, which does include Hindi. [Models and languages](https://developers.deepgram.com/docs/models-languages-overview)

### OpenRouter — the one that could bill the User's own key

This matters most under ADR-0006, so it gets the most detail. The short version: **OpenRouter has a real, dedicated STT product, it does take a remote URL, and it is cheap** — but there is a documented contradiction about URL support that has to be resolved before anything is built on it.

- **There is a dedicated endpoint**, not just chat-model audio input: `POST /api/v1/audio/transcriptions`, tagged "Speech-to-text endpoints". [Create transcription](https://openrouter.ai/docs/api/api-reference/stt/create-transcription.md), [Speech-to-Text](https://openrouter.ai/docs/guides/overview/multimodal/stt.md)
- **Input formats — and the contradiction.** The endpoint's own OpenAPI description reads: "Accepts base64-encoded audio input as JSON, an OpenAI-style multipart/form-data file upload, **or a URL the provider downloads directly**". The `STTInputAudio` schema is an `anyOf` over `STTInlineInputAudio` and `STTUrlInputAudio`, the latter being "Audio input fetched by the provider from a URL" with a required `url`: "Publicly reachable http(s) URL of the audio file. The provider downloads it directly, so the inline upload size limit does not apply. **Only supported by some providers.**" [Create transcription](https://openrouter.ai/docs/api/api-reference/stt/create-transcription.md) The STT guide agrees: files can be sent "as `input_audio.url` for models that accept a URL — the provider downloads it directly, so the 25 MB inline cap does not apply." [Speech-to-Text](https://openrouter.ai/docs/guides/overview/multimodal/stt.md)

  **But OpenRouter's multimodal _audio input_ page says the opposite** — "Audio files must be base64-encoded — direct URLs are not supported for audio content". [Audio inputs](https://openrouter.ai/docs/features/multimodal/audio) These are not actually in conflict once you notice they describe two different products (chat-completions audio input vs. the STT endpoint), and the STT guide names the distinction itself under "Differences from Audio Input". But the pages read as contradictory, and the per-model `llms.txt` sheets for `deepgram/nova-3`, `openai/whisper-large-v3-turbo`, `qwen/qwen3-asr-flash` and `google/gemini-3.5-transcribe` **all document `input_audio` as base64-only and show no `url` example at all**. [deepgram/nova-3 llms.txt](https://openrouter.ai/deepgram/nova-3/llms.txt) Which providers are in the "some providers" that accept a URL is documented nowhere I could find — the endpoints API (`/api/v1/models/{id}/endpoints`) returns an empty `supported_parameters` array for every STT endpoint. **Unverified; needs one live call to settle.**

- **Request shape:** `model` (required), `input_audio` (required; `{data, format}` or `{url, format}`), plus optional `language` ("ISO-639-1 language code… Auto-detected if omitted"), `temperature`, `response_format` (`json` | `verbose_json`), `timestamp_granularities`, `diarize`, `keyterms`, and `provider` for ZDR/data-collection routing and per-provider passthrough. [Create transcription](https://openrouter.ai/docs/api/api-reference/stt/create-transcription.md), [Speech-to-Text](https://openrouter.ai/docs/guides/overview/multimodal/stt.md)
- **Size limits:** multipart capped at 25 MB; base64 JSON past 25 MB accepted only "on OpenAI and Groq models, which offload the large body through a Durable Object"; URL input exempt from both. One more line matters for a Worker: "Recordings longer than about a minute of processing time should be split anyway, since upstream providers time out after 60 seconds per request." [Speech-to-Text](https://openrouter.ai/docs/guides/overview/multimodal/stt.md)
- **Formats:** `wav`, `mp3`, `flac`, `m4a`, `ogg`, `webm`, `aac`, varying by provider. [Speech-to-Text](https://openrouter.ai/docs/guides/overview/multimodal/stt.md)
- **Response carries the cost**, which is unusually good for an allowance design: `usage.seconds` ("Duration of the input audio in seconds") and `usage.cost` ("Total cost of the request in USD"), plus `text`, and with `verbose_json` a detected `language`, `duration`, `segments` and `words`. [Speech-to-Text](https://openrouter.ai/docs/guides/overview/multimodal/stt.md)
- **Pricing model:** "Duration-based (e.g., OpenAI Whisper): Priced per second of audio input" or "Token-based (e.g., newer OpenAI models): Priced per input/output token". [Speech-to-Text](https://openrouter.ai/docs/guides/overview/multimodal/stt.md) The models API exposes the rate in the `pricing.prompt` field, and for duration-priced models **the unit is dollars per second**. Two independent cross-checks confirm this: `deepgram/nova-3` lists `0.0000716666666667`, which is exactly $0.0043/min, Deepgram's own published Nova-3 monolingual PAYG rate; and the Groq endpoint of `openai/whisper-large-v3` lists `0.0000308333333333`, which is exactly $0.111/hr, Groq's own published rate. [Models API](https://openrouter.ai/api/v1/models?output_modalities=transcription), [Deepgram pricing](https://deepgram.com/pricing), [Groq speech to text](https://console.groq.com/docs/speech-to-text) The inference that the unit is per-second is mine, not OpenRouter's — the models API does not label it.
- **Catalogue, read live today** — 24 models with `output_modalities=transcription`. Selected rows, with $/min derived as `prompt × 60`: [Models API](https://openrouter.ai/api/v1/models?output_modalities=transcription)

  | Model                                                 | `pricing.prompt` ($/s) | $ per audio minute |
  | ----------------------------------------------------- | ---------------------- | ------------------ |
  | `openai/whisper-large-v3-turbo`                       | 0.00000333             | $0.0002            |
  | `nvidia/nemotron-3.5-asr-streaming-multilingual-0.6b` | 0.00000333             | $0.0002            |
  | `qwen/qwen3-asr-0.6b`                                 | 0.00000333             | $0.0002            |
  | `openai/whisper-large-v3` (DeepInfra)                 | 0.0000075              | $0.00045           |
  | `qwen/qwen3-asr-1.7b`                                 | 0.0000075              | $0.00045           |
  | `mistralai/voxtral-mini-3b-2507`                      | 0.0000166667           | $0.001             |
  | `nvidia/parakeet-tdt-0.6b-v3`                         | 0.000025               | $0.0015            |
  | `x-ai/grok-stt-1.0`                                   | 0.0000277778           | $0.00167           |
  | `openai/whisper-large-v3` (Groq)                      | 0.0000308333           | $0.00185           |
  | `qwen/qwen3-asr-flash-2026-02-10`                     | 0.000035               | $0.0021            |
  | `mistralai/voxtral-mini-transcribe`                   | 0.00005                | $0.003             |
  | `openai/gpt-transcribe`                               | 0.000075               | $0.0045            |
  | `deepgram/nova-3`                                     | 0.0000716667           | $0.0043            |
  | `openai/whisper-1`                                    | 0.0001                 | $0.006             |
  | `assemblyai/universal-3-5-pro`                        | 0.000125               | $0.0075            |
  | `google/chirp-3`                                      | 0.000266667            | $0.016             |

  Also present and **not** convertible this way: `google/gemini-3.5-transcribe` (prompt 0.000002, completion 0.000012) and `openai/gpt-4o-transcribe` / `gpt-4o-mini-transcribe`, which are token-priced; and `microsoft/mai-transcribe-1.5` at `0.36` and `mai-transcribe-2` at `0.1`, which are clearly token rates rather than per-second (0.36 $/s would be $1,296/hour). **The models API does not say which unit applies to which model.** Any code must read `usage.cost` from the response rather than predict it.

- **Note `assemblyai/universal-3-5-pro` at $0.0075/min via OpenRouter against AssemblyAI's own $0.21/hr = $0.0035/min direct** — roughly 2× markup on that route. [Models API](https://openrouter.ai/api/v1/models?output_modalities=transcription), [AssemblyAI pricing](https://www.assemblyai.com/pricing) `deepgram/nova-3` by contrast is at parity with Deepgram's own list price. Markup is per-model, not uniform.
- **Hindi:** OpenRouter publishes no per-model language matrix — "Supported Languages: Not listed" is the state of the guide. [Speech-to-Text](https://openrouter.ai/docs/guides/overview/multimodal/stt.md) Hindi coverage therefore inherits from the underlying model: Deepgram Nova-3 multilingual includes Hindi [Models and languages](https://developers.deepgram.com/docs/models-languages-overview); Whisper large-v3 is described on its OpenRouter model card as supporting "transcription across 99+ languages" [Models API](https://openrouter.ai/api/v1/models?output_modalities=transcription). `nvidia/parakeet-tdt-0.6b-v3` is the cheap row most likely to _not_ cover Hindi — Unverified either way, I found no first-party language list for it.
- **BYOK exists too:** "STT supports BYOK… requests are routed directly to the provider using your key, and OpenRouter charges only its platform fee rather than the per-usage model cost." [Speech-to-Text](https://openrouter.ai/docs/guides/overview/multimodal/stt.md) Not useful to us — we are trying to _avoid_ asking Users for more keys, per ADR-0006.

**Why this row matters more than its price.** Every other provider in §3 needs a new operator secret and spends operator money, which is exactly the cost ADR-0006 bounds with a daily allowance. OpenRouter is the one provider the User already has a key for, already used for enrichment, embeddings and chat. A reel transcript routed through `/api/v1/audio/transcriptions` on the User's own key is outside the operator allowance entirely — no new secret, no new per-user cap, no new outage surface. At `openai/whisper-large-v3-turbo` that is **$0.0002 per 60-second reel**, about 57× cheaper than Supadata's Pro-plan equivalent, paid by the person who asked for it. That is the right shape for an explicit, opt-in "transcribe this anyway" action. It is blocked only by §2.

## 4. Cost per 60-second reel and per 1,000 reels

Everything normalised to one 60-second reel. Where a provider bills per hour, $/min = price ÷ 60; where per second, $/min = price × 60. Those divisions are mine; the quoted rate in the source column is the primary number.

| Option                                            | Who pays       | Rate (as published)              | $ / 60 s reel | $ / 1,000 reels            | Takes a URL?             | Free tier                            | Source                                                                                           |
| ------------------------------------------------- | -------------- | -------------------------------- | ------------- | -------------------------- | ------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| **Supadata `generate`, Free plan**                | operator       | 2 credits/min, 100 credits/mo    | $0            | $0 (capped at 50 reels/mo) | n/a — takes the reel URL | 100 credits/mo                       | [Transcript](https://docs.supadata.ai/get-transcript.md), [Pricing](https://supadata.ai/pricing) |
| **Supadata `generate`, Pro**                      | operator       | 2 credits × ($17/3,000)          | **$0.0113**   | **$11.33**                 | n/a                      | —                                    | [Pricing](https://supadata.ai/pricing)                                                           |
| **Supadata `generate`, Mega**                     | operator       | 2 credits × ($47/30,000)         | $0.0031       | $3.13                      | n/a                      | —                                    | [Pricing](https://supadata.ai/pricing)                                                           |
| **Supadata `generate`, Basic/Pro top-up**         | operator       | 2 credits × ($10/1,000)          | $0.0200       | $20.00                     | n/a                      | —                                    | [Pricing](https://supadata.ai/pricing)                                                           |
| OpenRouter `openai/whisper-large-v3-turbo`        | **User's key** | $0.00000333/s                    | **$0.0002**   | **$0.20**                  | yes (some providers)     | —                                    | [Models API](https://openrouter.ai/api/v1/models?output_modalities=transcription)                |
| OpenRouter `openai/whisper-large-v3` (DeepInfra)  | User's key     | $0.0000075/s                     | $0.00045      | $0.45                      | yes (some providers)     | —                                    | [Models API](https://openrouter.ai/api/v1/models?output_modalities=transcription)                |
| OpenRouter `deepgram/nova-3`                      | User's key     | $0.0000716667/s                  | $0.0043       | $4.30                      | yes (some providers)     | —                                    | [Models API](https://openrouter.ai/api/v1/models?output_modalities=transcription)                |
| Cloudflare `@cf/openai/whisper-large-v3-turbo`    | operator       | $0.0005/audio min, 46.63 neurons | $0.0005       | $0.50                      | **no**                   | **10,000 neurons/day ≈ 214 min/day** | [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)             |
| Cloudflare `@cf/deepgram/nova-3`                  | operator       | $0.0052/audio min                | $0.0052       | $5.20                      | **no**                   | same daily neuron grant              | [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)             |
| Groq `whisper-large-v3-turbo`                     | operator       | $0.04/hr                         | $0.00067      | $0.67                      | yes                      | —                                    | [Speech to text](https://console.groq.com/docs/speech-to-text)                                   |
| Groq `whisper-large-v3`                           | operator       | $0.111/hr                        | $0.00185      | $1.85                      | yes                      | —                                    | [Speech to text](https://console.groq.com/docs/speech-to-text)                                   |
| AssemblyAI Universal-2                            | operator       | $0.15/hr                         | $0.0025       | $2.50                      | yes (`audio_url`)        | **$50 credit**                       | [Pricing](https://www.assemblyai.com/pricing)                                                    |
| AssemblyAI Universal-3.5 Pro                      | operator       | $0.21/hr                         | $0.0035       | $3.50                      | yes (`audio_url`)        | **$50 credit**                       | [Pricing](https://www.assemblyai.com/pricing)                                                    |
| ElevenLabs Scribe v2                              | operator       | $0.22/hr                         | $0.0037       | $3.67                      | yes (deprecated param)   | unstated                             | [API pricing](https://elevenlabs.io/pricing/api)                                                 |
| Deepgram Nova-3 monolingual                       | operator       | $0.0043/min                      | $0.0043       | $4.30                      | yes                      | **$200 credit**                      | [Pricing](https://deepgram.com/pricing)                                                          |
| **Deepgram Nova-3 multilingual (the Hindi rate)** | operator       | $0.0052/min                      | $0.0052       | $5.20                      | yes                      | **$200 credit**                      | [Pricing](https://deepgram.com/pricing)                                                          |
| OpenAI `gpt-4o-mini-transcribe`                   | operator       | $0.003/min                       | $0.0030       | $3.00                      | **no**                   | —                                    | [API pricing](https://developers.openai.com/api/docs/pricing)                                    |
| OpenAI `gpt-4o-transcribe` / Whisper              | operator       | $0.006/min                       | $0.0060       | $6.00                      | **no**                   | —                                    | [API pricing](https://developers.openai.com/api/docs/pricing)                                    |

Three things this table says that the raw numbers hide:

1. **Supadata is the most expensive option on the list by a wide margin, and it is also the only one that works.** At Pro rates it is 2.2× Deepgram's Hindi price, 17× Groq's, 22× Cloudflare's and **57× OpenRouter's cheapest**. We pay that premium for exactly one thing: Supadata resolves an `instagram.com/reel/...` URL to audio. Nobody else in the table will touch a reel URL.
2. **The free tiers are not marginal.** Cloudflare's 10,000 neurons/day is ~214 reel-minutes _per day_ at $0 — more than Supadata's entire free month (50 reel-minutes) every single day. Deepgram's $200 credit is ~38,000 Hindi reel-minutes. Both are unreachable without a media URL.
3. **Only one row moves the spend off the operator.** Under ADR-0006 every "operator" row needs a new secret, a new per-user daily allowance counter and a new all-users outage mode. The OpenRouter rows need none of that.

## 5. Instagram's own terms

Recorded, not argued.

- **Instagram's Terms of Use prohibit automated collection without express permission.** The clause: "This includes creating accounts or accessing or collecting information in an automated way (including by engaging in Automated Data Collection as defined in the Automated Data Collection Terms) without our express permission", sitting under the prohibition on attempting "to create accounts or access or collect information in unauthorized ways". [Instagram Terms of Use](https://help.instagram.com/581066165581870/) It applies "regardless of whether such automated access or collection is undertaken while logged in". Instagram operates account restrictions specifically for this. [Data scraping restrictions](https://help.instagram.com/740480200552298/)
- **Meta's Platform Terms contain no clause naming scraping, caching or media storage.** The nearest is §2.a, which limits the licence to "use, access, and integrate with Platform" only "to the extent permitted in these Terms and all other applicable terms and policies", and §1.c, which defers: "You must also comply with the applicable requirements in our Developer Policies". [Platform Terms](https://developers.facebook.com/terms/)
- **The Developer Policies likewise contain no explicit anti-scraping or caching clause.** The Instagram-specific one that does exist is §6.1: "Comply with any requirements or restrictions imposed on usage of Instagram user photos and videos ("User Content") by their respective owners." [Developer Policies](https://developers.facebook.com/devpolicy/)
- **The only first-party statement about a reel media URL is the Graph API's**, and it is own-media-only: `media_url` is "The URL for the media. **Warning:** The `media_url` field is omitted from responses if the media contains copyrighted material or has been flagged for a copyright violation." [IG Media reference](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-media) No expiry, signing or caching behaviour is documented.
- Net: fetching reel media server-side from a CDN URL obtained by any means other than a Meta API is **not covered by any documented Meta permission**, and the generic Terms-of-Use clause above is the one that speaks to it. Obtaining the same media through a vendor that holds its own arrangement (Supadata) moves that question onto the vendor, which is where ADR-0003 already left it.

## 6. Recommendation

**Build the "transcribe this anyway" action on Supadata `/v1/transcript` with `mode=auto`, on the operator key, inside the ADR-0006 allowance.** It is the most expensive per-reel option in §4 and it is still the right call, because §2 removes every alternative: no media URL, no cheaper provider. Concretely:

1. **`mode=auto`, not `mode=generate`.** Identical behaviour on every reel that has no native track, and it costs 1 credit instead of 2 on the unexplained "Instagram video with existing transcript" case Supadata's own table still claims exists. [Transcript](https://docs.supadata.ai/get-transcript.md) No downside once the User has consented to the generate price.
2. **Quote the cost from `media.duration`, obtained from the `/v1/metadata` call the capture already made.** It is the only documented duration source, it is optional, and the UI needs a "duration unknown" path. [v1-openapi.json](https://docs.supadata.ai/api-reference/v1-openapi.json)
3. **Count the action against the transcript allowance as one call, not as credits.** The async path's `x-billable-requests` is "a precharge estimate… the job status endpoint always reports `0`", so true credit cost is not readable at runtime. [Transcript](https://docs.supadata.ai/get-transcript.md)
4. **Handle 202 unconditionally.** Supadata states a reel of any length may hand off to a job mid-flight. [Transcript](https://docs.supadata.ai/get-transcript.md) Our client already does; the documented poll interval is 1 s against our 2 s, and jobs expire after 1 hour, which bounds any retry design.
5. **Warn that silence still bills.** An empty `content` array is a success, charged by duration. [Transcript](https://docs.supadata.ai/get-transcript.md) A reel with music and no speech costs the same as one with a Hindi monologue.
6. **Do not scrape a media URL to reach the cheap providers.** It is the workaround the engineering standard rules out, §5 shows it is outside Meta's documented permissions, and §2 shows Supadata will not hand us one.

**The one thing worth revisiting later.** If a reel's audio ever lands in our own R2 bucket by a sanctioned route, the economics invert completely: OpenRouter `/api/v1/audio/transcriptions` with `input_audio.url` pointed at an R2 object, on the **User's own OpenRouter key**, is $0.0002 per reel — 57× cheaper than Supadata, outside the operator allowance, needing no new secret and no new outage mode. [Speech-to-Text](https://openrouter.ai/docs/guides/overview/multimodal/stt.md), [Models API](https://openrouter.ai/api/v1/models?output_modalities=transcription) That is a materially better design than the one we can build today, and the only thing standing between us and it is a lawful audio source. Worth writing down as the target, not as a plan.

## Verification limits

**No live API call was made to any provider in this document, and no credential was used.** Everything is from published documentation, OpenAPI specifications and pricing pages. The one exception is OpenRouter's _public, unauthenticated_ models endpoint (`/api/v1/models?output_modalities=transcription`), which was read directly because it is the only place the STT catalogue and its rates are published at all; it needs no key.

Specific gaps, each named where it appears above:

- **Supadata's rounding and minimum charge for `mode=generate` are undocumented.** "2 per min of video (usually 2)" is the only evidence and it is a parenthetical in an examples table.
- **Supadata's ASR language coverage is unverified and Hindi is not named anywhere.** The only language list they publish is explicitly for YouTube native captions, and `lang` is ignored under `generate`. "100+ languages, auto-detected" is marketing copy with no list, no model named and no WER. This is the largest open risk in the document: the whole motivating case is Hindi reels, and the vendor we are recommending publishes nothing about Hindi.
- **The Supadata pricing-table contradiction from doc 16 is still live** — "Instagram video with existing transcript | `auto` | returns existing transcript | 1" versus "Instagram doesn't provide native captions". Unresolved, as before; here it argues _for_ `auto`.
- **OpenRouter's docs read as contradictory on URL input** (STT endpoint schema and guide say yes; the multimodal audio page says no; every per-model `llms.txt` shows base64 only). They describe two different products and the STT guide says so, but which providers actually honour `input_audio.url` is documented nowhere and the endpoints API returns empty `supported_parameters`. One live call settles it.
- **The per-second unit for OpenRouter's `pricing.prompt` is my inference**, not OpenRouter's statement, cross-checked against two providers' own published rates. Some models in the same list are plainly token-priced at the same field. Read `usage.cost` from the response; do not predict it.
- **ElevenLabs' remote-URL parameter is marked deprecated with no named replacement**, and a second undocumented `source_url` sits beside it in the same schema.
- **Deepgram's callback semantics for URL input and its interaction with the 10-minute sync ceiling are not stated** on the callback page.
- **Cloudflare publishes no max audio size or duration for its whisper models**, and no neuron figure for `@cf/deepgram/nova-3`. The limits page and both model input schemas were checked.
- **OpenAI publishes no per-language support table or WER** on its pricing page; Whisper's Hindi capability here is attested only through Groq and OpenRouter model cards.
- **Instagram CDN URL behaviour — signing, expiry, server-side fetchability — is undocumented by Meta and was not tested.**
- `help.instagram.com` and `developers.facebook.com` resist direct retrieval, the same obstacle doc 16 recorded. The Instagram Terms of Use clause in §5 was obtained through a domain-restricted search index over `help.instagram.com` rather than a clean fetch of the page, and the Platform Terms and Developer Policies were read through a summarising fetch tool. Quoted clauses are as returned by those tools, not byte-checked against the raw pages.
