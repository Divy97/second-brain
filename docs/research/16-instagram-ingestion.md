# Instagram ingestion: Supadata behaviour, URL grammar, oEmbed viability

Checked 2026-09-30 against Supadata's own documentation (`docs.supadata.ai`, including its OpenAPI spec at `/api-reference/v1-openapi.json`) and Supadata's own product page, Meta's Instagram Platform and Graph API reference, and the oEmbed spec's registry at `oembed.com`. Answers whether ADR-0002's `mode=native` decision leaves Instagram with any transcript path, and what the floor is for an Instagram save with no transcript key. Related: `14-byok-key-verification.md`, `15-youtube-ingestion.md`.

## 1. Supadata and Instagram

### Accepted Instagram URL forms

- `/v1/metadata` — "Supported URL Formats … **Instagram:** `https://www.instagram.com/reel/C1234567890` · `https://www.instagram.com/p/C1234567890` · `https://www.instagram.com/tv/C1234567890`". [Metadata](https://docs.supadata.ai/get-metadata.md)
- `/v1/transcript` — one example only: "Instagram video URL, e.g. `https://instagram.com/reel/1234567890/`". The `url` parameter is described as "Must be either YouTube, TikTok, Instagram, X (Twitter), Facebook or a public file URL." [Transcript](https://docs.supadata.ai/get-transcript.md)
- OpenAPI `MetadataQuery`: "URL to any supported internet media. Supports YouTube videos, TikTok videos, **Instagram reels/posts**, Twitter/X posts, Facebook videos, and more", example `https://www.instagram.com/reel/ABC123`. [v1-openapi.json](https://docs.supadata.ai/api-reference/v1-openapi.json)
- **Stories, `/reels/` (plural) and profile links are not listed anywhere in Supadata's docs**, for either endpoint. There is a `youtube/supported-url-formats` page but no Instagram equivalent. [Docs index](https://docs.supadata.ai/llms.txt) Treat anything beyond `/reel/`, `/p/`, `/tv/` as unsupported until observed.
- Consequence: our parser should accept `/reel/`, `/p/`, `/tv/` and fail closed on everything else. `/reels/` is a real Instagram redirect in the wild but is **not** sanctioned by Supadata or by Meta (see §2) — normalise it to `/reel/` ourselves rather than forwarding it.

### What `/v1/metadata` returns for an Instagram item

- The response is one unified schema for all five platforms; there is **no Instagram-specific example anywhere in the docs or the OpenAPI spec** — every sample on the page is YouTube or TikTok. [Metadata](https://docs.supadata.ai/get-metadata.md), [v1-openapi.json](https://docs.supadata.ai/api-reference/v1-openapi.json)
- Full field list, from the `Metadata` schema in the OpenAPI spec:
  - `platform` — enum, one of `youtube | tiktok | instagram | twitter | facebook`. **Required.**
  - `type` — enum `video | image | carousel | post`; "Acts as a discriminator that determines the structure of the `media` field". **Required.**
  - `id` — "Unique media identifier from the platform". **Required.**
  - `url` — "Canonical URL to the media".
  - `title` — `string | null`, "Media title".
  - `description` — `string | null`, "**Media description or caption**".
  - `author` — `{username, displayName, avatarUrl, verified}`; only `displayName` is required.
  - `stats` — `{views, likes, comments, shares}`, each `number | null`; `likes`, `comments`, `shares` are required keys. `shares` is documented as "null if unavailable or not applicable for the platform (**e.g., YouTube, Instagram**)".
  - `media` — a `oneOf` discriminated by `type`: video → `{type, duration (seconds), thumbnailUrl}`; image → `{type, url}`; carousel → `{type, items[]}` where each item is a video or image object; post → `{type}` only.
  - `tags` — `string[]`, "Tags, hashtags, or keywords".
  - `createdAt` — ISO 8601 string.
  - `additionalData` — free-form object, "Platform-specific additional data". The docs name only YouTube channel info, TikTok music info and X retweet/quote info as examples; **nothing is documented for Instagram**, and "Platform-specific fields in `additionalData` may vary and are subject to change". [v1-openapi.json](https://docs.supadata.ai/api-reference/v1-openapi.json), [Metadata](https://docs.supadata.ai/get-metadata.md)
- **Correction to `14-byok-key-verification.md`.** That note asserts "for an Instagram reel, `title` is `null` and the caption lands in `description`". Only half of that is documented:
  - Caption → `description` is **supported**: the field's own description is "Media description or caption", and Supadata's Python sample prints `tiktok_metadata.description` under the label `Caption:`. [v1-openapi.json](https://docs.supadata.ai/api-reference/v1-openapi.json)
  - `title` being `null` for Instagram is **not stated anywhere**. The docs say only the generic "`title` and `description`: May be `null` for some platforms or content types". [Metadata](https://docs.supadata.ai/get-metadata.md) Doc 14's claim is a plausible inference, not a documented fact. Code must treat `title` as `string | null` and fall back to `description`, which it should do regardless.
- Two further Instagram-relevant facts doc 14 does not record: `shares` is explicitly documented as null for Instagram, and "Responses may be served from a cache for up to ~10 minutes, so engagement stats can lag slightly behind the platform." [Metadata](https://docs.supadata.ai/get-metadata.md)

### `mode=native` on Instagram — the decisive point

Supadata's docs answer this directly, in two places, and the answer is bad for us.

- The pricing examples table on the transcript page has a row for exactly this case:

  | Case            | Mode     | What happens                               | Credits consumed |
  | --------------- | -------- | ------------------------------------------ | ---------------- |
  | Instagram video | `native` | **No transcript available response (206)** | 1                |

  [Transcript](https://docs.supadata.ai/get-transcript.md)

- Supadata's own Instagram product page states the underlying reason, twice and unambiguously: "**Instagram doesn't provide native captions, so Supadata always transcribes the audio using AI speech recognition (2 credits per minute of video)** — same endpoint, same response format as every other platform." And, in its capability table: "Native captions — **Not available on Instagram** — transcripts are AI-generated (2 credits/min)." [Instagram Transcript API](https://supadata.ai/instagram-transcript-api)
- So `mode=native` is not merely unhelpful on Instagram; it is guaranteed to fail. There is no native caption track for the `native` branch to fetch, whether or not the reel has spoken audio. An Instagram reel with clear speech returns `206 transcript-unavailable` under `mode=native`, at a cost of 1 credit.
- **ADR-0002 therefore leaves Instagram with no transcript at all.** Reusing `fetchTranscript(url)` unchanged on an Instagram URL buys one credit and a guaranteed 206.
- One contradiction worth recording: the same pricing table also lists "Instagram video with existing transcript | `auto` | Supadata returns existing transcript | 1". That row cannot be reconciled with "Instagram doesn't provide native captions". Both are Supadata's own words. Assume the product page is the operative one (it is specific, recent and stated three times) and treat any native Instagram transcript as an unpredictable bonus, never a design assumption.
- `206` is a soft result, not an exception: `error: "transcript-unavailable"`, `message: "Transcript Unavailable"`, `details: "No transcript is available for this video"`, and the documented remedy is "Use the `/transcript` endpoint with `mode=generate` or `mode=auto` option to generate captions for the video". [Transcript Unavailable](https://docs.supadata.ai/errors/transcript-unavailable.md), [Error codes](https://docs.supadata.ai/errors/list.md)
- Cost of deviating: `mode=generate` on Instagram is **2 credits per minute of video**. On the free plan's 100 credits/month that is ~50 minutes of Instagram video per month, shared with everything else. [Transcript](https://docs.supadata.ai/get-transcript.md), [Pricing](https://supadata.ai/pricing)
- Latency of deviating: "Requests that involve AI generation (eg. `mode=generate`) can take up to ~100 seconds if they do not return an asynchronous job ID earlier", and "A request for a platform URL (YouTube, TikTok, Instagram, X, Facebook) may also start synchronously and switch to an asynchronous job while in flight — clients should always be prepared to handle a 202 + job ID response for `mode=generate`, regardless of video length." [Transcript](https://docs.supadata.ai/get-transcript.md) A Worker that only handles 200/206 will break on this path.

### Credit costs — identical to YouTube

- Metadata: "All metadata requests cost **1 credit**, regardless of platform or media type." [Metadata](https://docs.supadata.ai/get-metadata.md)
- Transcript: "1 native transcript = 1 credit", "1 generated transcript minute = 2 credits". The schedule is stated platform-independently; there is no Instagram surcharge. [Transcript](https://docs.supadata.ai/get-transcript.md)
- "1 credit is charged when request to get a transcript returns status 206 (Transcript Unavailable)." [Transcript](https://docs.supadata.ai/get-transcript.md)
- So the _rates_ are the same as YouTube. The _effective_ cost is not: YouTube usually resolves at 1 credit on the native branch, Instagram never can, so every Instagram transcript is a generate-branch charge.

### Public-content requirement and private/deleted posts

- "**Only publicly accessible videos can be transcribed.** Videos that require authentication or have restricted access will return errors: Login-required videos · Membership/subscriber-only videos · Private videos · Age-restricted videos · Heavily geoblocked videos." [Transcript](https://docs.supadata.ai/get-transcript.md)
- Documented outcomes: "`404 Not Found` — Video does not exist or is private" and "`403 Forbidden` — Video requires authentication or is restricted". Bodies follow the standard `{error, message, details, documentationUrl}` shape; `404` is `error: "not-found"`, `details: "The requested item could not be found"`. [Transcript](https://docs.supadata.ai/get-transcript.md), [Not Found](https://docs.supadata.ai/errors/not-found.md), [Error codes](https://docs.supadata.ai/errors/list.md)
- Supadata's Instagram page restates it: "Public Instagram Reels and video posts… **Private or follower-only content isn't accessible.**" [Instagram Transcript API](https://supadata.ai/instagram-transcript-api)
- Live streams are excluded on every platform: "Only complete media can be transcribed. Live streams, broadcasts, and similar ongoing content are not supported." [Transcript](https://docs.supadata.ai/get-transcript.md)
- **The public-content rule is documented only on the transcript page.** `/v1/metadata` declares `404` and `403` in its OpenAPI responses but carries no equivalent prose. Assume the same rule applies and branch on the status codes; do not assume metadata succeeds where transcript would 404. [v1-openapi.json](https://docs.supadata.ai/api-reference/v1-openapi.json)
- No primary source distinguishes _deleted_ from _private_ — both land on `404 not-found`. We cannot tell the user which.

## 2. Instagram URL grammar

### What Meta documents

- Meta's Instagram Platform oEmbed page is the one place Meta enumerates post URL forms, and it lists exactly three:
  - "Single image and carousel posts: `https://www.instagram.com/p/{media-shortcode}/`"
  - "Videos/Reels: `https://www.instagram.com/reel/{media-shortcode}/`"
  - "Profiles: `https://www.instagram.com/{username}`"

  [Instagram oEmbed](https://developers.facebook.com/docs/instagram-platform/oembed/)

- The same page states "**Stories are not supported**" and "Posts on private, inactive, and age-restricted Instagram accounts are not supported." [Instagram oEmbed](https://developers.facebook.com/docs/instagram-platform/oembed/)
- `{media-shortcode}` is named as a path token but its alphabet, length and stability are **not specified anywhere**. There is no documented regex.
- `/tv/` (IGTV) does **not** appear on the current version of that page. It does appear in the oEmbed registry entry below, and IGTV media were folded into the Graph API in v10.0. [IGTV media and metrics](https://developers.facebook.com/blog/post/2021/03/15/igtv-media-mmetrics-instagram-graph-api/) Treat `/tv/` as legacy-but-live: Supadata accepts it, Meta no longer documents it.
- `/reels/` (plural) appears in **no** primary source — not Meta's, not Supadata's, not the oEmbed registry.

### The oEmbed registry — the only enumerated grammar

`oembed.com/providers.json` is the oEmbed spec's own machine-readable registry ("Providers are available programatically as a json file: `https://oembed.com/providers.json`"), maintained by provider pull request rather than centrally, and the spec "strongly encourage[s]" discovery over the registry. [oEmbed spec](https://oembed.com/) Its Instagram entry lists these schemes against `https://graph.facebook.com/v16.0/instagram_oembed`:

- `{http,https}://{,www.}instagram.com/p/*` and `{http,https}://{,www.}instagr.am/p/*`
- `{http,https}://{,www.}instagram.com/*/p/*` — i.e. the `/{username}/p/{shortcode}/` variant
- `{http,https}://{,www.}instagram.com/tv/*` and the `instagr.am` mirrors
- `{http,https}://{,www.}instagram.com/reel/*` and the `instagr.am` mirrors

[providers.json](https://oembed.com/providers.json)

No `/reels/`, no `/stories/`. Note `instagr.am` and the `/{username}/p/{shortcode}/` form, neither of which Supadata documents.

### Verdict on our parser

**Our Instagram parser is in the same position as the YouTube one: an unsanctioned heuristic, but a slightly better-evidenced one.** `/p/` and `/reel/` are named in a first-party Meta document, which is more than `watch?v=` ever got. Everything else — `/tv/`, `/reels/`, `instagr.am`, `/{username}/p/`, query-string tracking params such as `igsh`, and the shortcode alphabet itself — is either registry-only or wholly undocumented. Same rule as YouTube: unit-test the parser, normalise aggressively, and fail closed rather than guess.

## 3. Instagram oEmbed without a token — not available

- Since 2020 there is no unauthenticated Instagram oEmbed. Meta: "We are also deprecating the existing Legacy API oEmbed endpoints for Facebook and Instagram on 10AM PDT on October 23, 2020, which will be replaced with new Graph API endpoints", which require "client or app access tokens". "If developers don't make this change and continue to attempt to call the existing oEmbed API, their requests will fail and developers will receive an error message instead." [Required migration to token-based access](https://developers.facebook.com/blog/post/2020/10/14/required-migration-token-based-access-user-picture-oEmbed-endpoints/)
- The current endpoint is `GET /v26.0/instagram_oembed` with required parameter `url` ("The post's URL") and optional `maxwidth` (320–658), `hidecaption`, `omitscript`. The reference's SDK examples carry a required `{access-token}` placeholder. [Graph API: Instagram oEmbed](https://developers.facebook.com/docs/graph-api/reference/instagram-oembed/)
- Access is gated behind a reviewed feature, not just a token. The oEmbed Read feature lets an app "get embed HTML and basic metadata for public Facebook and Instagram pages, posts, and videos", and the page states "**Requires App Review**" — "This permission or feature requires successful completion of the App Review process before your app can access live data" — with Business Verification also required. [oEmbed Read](https://developers.facebook.com/docs/features-reference/oembed-read/)
- **And it would not give us the caption as data anyway.** The documented response fields are `html`, `provider_name`, `provider_url`, `type`, `version`, `width`. There is no `title`, no `author_name`, no `thumbnail_url` — even though the oEmbed 1.0 spec defines `title` and `author_name` as optional response parameters. [Graph API: Instagram oEmbed](https://developers.facebook.com/docs/graph-api/reference/instagram-oembed/), [oEmbed spec](https://oembed.com/) The existence of a `hidecaption` parameter implies the caption is rendered inside the `html` blockquote, but Meta documents no field carrying it as text, so extracting it would mean parsing an embed blob we are not promised the shape of.
- Net: precise answer to "is there an official Instagram oEmbed endpoint usable without an access token?" — **no.** A token is required, the token requires the `oembed_read` feature, that feature requires App Review and Business Verification, and the payoff is embed HTML rather than a caption field.

## 4. Recommendation

**"Partial: link + note" is genuinely the floor for an Instagram link with no transcript key.** Every documented route to anything more requires a credential we do not have:

- Supadata `/v1/metadata` is the only cheap, structured source of caption, author, thumbnail, duration and stats — and it authenticates with the **same** Supadata key as `fetchTranscript`. No key, no metadata. [Metadata](https://docs.supadata.ai/get-metadata.md)
- Instagram oEmbed needs an app access token plus a reviewed `oembed_read` feature plus Business Verification, and returns embed HTML rather than caption text. [oEmbed Read](https://developers.facebook.com/docs/features-reference/oembed-read/)
- There is no operator-level Instagram metadata API configured, and no primary source documents any unauthenticated Instagram metadata endpoint at all.
- Scraping `instagram.com` Open Graph tags from a Worker is not backed by any primary source and is not recommended here; it is exactly the kind of workaround the engineering standard rules out.

Three concrete changes follow:

1. **Do not send an Instagram URL to `/v1/transcript` with `mode=native`.** It is a documented guaranteed `206` and a wasted credit. The Instagram path should call `/v1/metadata` only.
2. **The Instagram ladder is two rungs, not four:** (1) Supadata `/v1/metadata` on the user's key → caption, author, thumbnail, duration, stats, at 1 credit; (2) no key, or `403`/`404` → partial item, link + note. There is no transcript rung under ADR-0002.
3. **If a transcript on Instagram is wanted, it needs a new decision, not a code change.** `mode=generate` is the only mechanism, at 2 credits/minute, with a mandatory `202` + job-polling path and up to ~100 s latency. That is a per-platform override of ADR-0002 and a visible spend on a 100-credit free plan — take it to a spec and an ADR amendment rather than smuggling it in.

The upside worth stating plainly: a saved Instagram reel with a Supadata key set is not bare. Caption text, author handle and display name, thumbnail URL, duration, hashtags and `createdAt` all arrive for 1 credit, which is enough to summarise and index. The transcript is what we lose, not the item.

## Verification limits

**No live Supadata call was made in this check, and no valid Supadata key was available.** Every `/v1/metadata` and `/v1/transcript` behaviour above is taken from Supadata's documentation, its OpenAPI spec and its own product page — not from an observed response. In particular the Instagram `200` metadata body has never been seen by anyone in this repo's research; there is no Instagram sample anywhere in Supadata's docs, so the field-by-field mapping for an Instagram reel (which of `title`, `views`, `tags`, `additionalData` are actually populated) is **unconfirmed**. Doc 14's `title: null` claim is flagged above as an inference and should be resolved by one real call before any code depends on it.

The `mode=native` → `206` conclusion rests on two independent Supadata statements (the pricing examples table and the Instagram product page) that are consistent with each other, and on one row of the same table that **contradicts** them ("Instagram video with existing transcript"). That contradiction is unresolved. It does not change the recommendation — designing for "no native transcript" is correct under either reading — but the 206 has not been reproduced live.

Meta's docs were read through a fetch-and-summarise tool; `developers.facebook.com` blocks direct retrieval, so the Instagram Platform oEmbed page could not be captured as raw text. Two fetches of that page returned no `access_token` prose at all, while a search index and the Graph API reference both show token-based access; the authentication conclusion therefore rests on the 2020 migration blog post, the `oembed_read` feature page and the `{access-token}` placeholder in the Graph API reference, rather than on a single clean sentence from the oEmbed page itself. The `/tv/` discrepancy — present in search snippets and in the oEmbed registry, absent from the current page — was not resolved; it may reflect an older revision.

`oembed.com/providers.json` is authoritative for the oEmbed protocol but **provider-submitted** and explicitly deprioritised by the spec in favour of discovery. Its Instagram scheme list is evidence of intended grammar, not a Meta guarantee.

Nothing primary was found on: Instagram shortcode format or length; `/reels/` (plural) as a sanctioned path; Instagram Stories or profile URLs at either vendor; Supadata's `additionalData` contents for Instagram; whether `/v1/metadata` enforces the same public-content rule as `/v1/transcript`; or any way to distinguish a deleted post from a private one. All are called out above as gaps rather than assumed.
