# YouTube ingestion: Data API v3, youtubei.js on Workers, Supadata costs

Checked 2026-09-29 against Google's YouTube Data API v3 reference, the `LuanRT/YouTube.js` repository at `main` (v18.1.0, pushed 2026-09-24) and its maintainers' issue comments, Supadata's own docs, and live unauthenticated/bogus-key calls to `googleapis.com`. Covers the spec's four-step YouTube ladder. Related: `13-multimodal-capture-apis.md`, `14-byok-key-verification.md`.

## 1. YouTube Data API v3 — `videos.list`

### Request

- `GET https://www.googleapis.com/youtube/v3/videos`. The key is a plain query parameter, `key=`. Google's own example: `https://www.googleapis.com/youtube/v3/videos?id=7lCDEYXw3mM&key=YOUR_API_KEY&part=snippet,contentDetails,statistics,status`. [Videos.list](https://developers.google.com/youtube/v3/docs/videos/list), [Getting started](https://developers.google.com/youtube/v3/getting-started)
- Required: `part` (comma-separated) plus exactly one filter — `id`, `chart`, or `myRating`. `myRating` needs OAuth, so an API key restricts us to `id` and `chart`. `id` accepts a comma-separated list, so N videos cost one call. [Videos.list](https://developers.google.com/youtube/v3/docs/videos/list)
- `part` allowed values: `brandPartner`, `contentDetails`, `fileDetails`, `id`, `liveStreamingDetails`, `localizations`, `paidProductPlacementDetails`, `player`, `processingDetails`, `recordingDetails`, `snippet`, `statistics`, `status`, `suggestions`, `topicDetails`. [Videos.list](https://developers.google.com/youtube/v3/docs/videos/list)
- For our fields, `part=snippet,contentDetails` is sufficient: title, channel name, channel id and description all live in `snippet`; duration lives in `contentDetails`. Add `status` only if we want `privacyStatus`/`uploadStatus`. [Video resource](https://developers.google.com/youtube/v3/docs/videos)

### Response shape

- `{"kind":"youtube#videoListResponse","etag":…,"nextPageToken":…,"prevPageToken":…,"pageInfo":{"totalResults":integer,"resultsPerPage":integer},"items":[<video resource>]}`. [Videos.list](https://developers.google.com/youtube/v3/docs/videos/list)
- Field map: `snippet.title`, `snippet.channelTitle`, `snippet.channelId`, `snippet.description`, `contentDetails.duration`. [Video resource](https://developers.google.com/youtube/v3/docs/videos)
- Duration is an ISO 8601 duration string, not seconds. Docs: "a value of `PT15M33S` indicates that the video is 15 minutes and 33 seconds long. If the video is at least one hour long, the duration is in the format `PT#H#M#S`". We must parse it ourselves. [Video resource](https://developers.google.com/youtube/v3/docs/videos)
- Region availability, when we need it, is `contentDetails.regionRestriction.allowed[]` / `.blocked[]` — "a list of region codes that identify countries where the video is blocked". [Video resource](https://developers.google.com/youtube/v3/docs/videos)

### Chapters

- **Chapters are not a field of this API.** The word "chapter" appears exactly once in the entire video-resource reference, and only to say: "You can create video chapters by including formatted timestamps (for example, `00:00`) in the description text." There is no `chapters` property in `snippet`, `contentDetails` or anywhere else in the resource. [Video resource](https://developers.google.com/youtube/v3/docs/videos)
- Consequence: chapters must be parsed out of `snippet.description` ourselves, by timestamp scanning. Nothing in the docs specifies a format beyond "formatted timestamps"; the `00:00` first-chapter rule and the minimum-three-chapters rule are **not** stated in any primary Google developer doc found here. Treat chapter extraction as a heuristic, not a contract.

### Missing, private, region-blocked videos

- `videos.list` documents exactly three method-level errors: `badRequest (400) videoChartNotFound`, `forbidden (403) forbidden` ("the request is not properly authorized to access video file or processing information" — i.e. `fileDetails`/`processingDetails` without OAuth), and `notFound (404) videoNotFound` ("The video that you are trying to retrieve cannot be found. Check the value of the request's `id` parameter to ensure that it is correct."). [Videos.list](https://developers.google.com/youtube/v3/docs/videos/list)
- **The docs never state what `items` contains when an id in the list is unknown, deleted or private.** There is no sentence anywhere in the `videos.list` reference about empty arrays or partial results. Widely-reported behaviour is `200` with `items: []` and `pageInfo.totalResults: 0`, but that could not be confirmed from any primary source and was not observed live (no key available). Code must therefore handle **both**: `items.length === 0` and a `404 videoNotFound`, and treat both as "video not retrievable" → partial item.
- Region-blocking is not an error at all. A region-blocked video still returns a normal resource; the block is only visible as `contentDetails.regionRestriction.blocked`. Metadata for a region-blocked video is retrievable. [Video resource](https://developers.google.com/youtube/v3/docs/videos)

### Invalid key vs exhausted quota — live-observed and cleanly distinguishable

- Invalid key → **HTTP 400**, observed live on 2026-09-29 with a bogus `key=`:
  ```json
  {"error":{"code":400,"message":"API key not valid. Please pass a valid API key.",
   "errors":[{"message":"API key not valid. Please pass a valid API key.","domain":"global","reason":"badRequest"}],
   "status":"INVALID_ARGUMENT",
   "details":[{"@type":"type.googleapis.com/google.rpc.ErrorInfo","reason":"API_KEY_INVALID",
               "domain":"googleapis.com","metadata":{"service":"youtube.googleapis.com"}}, …]}}
  ```
  Branch on `error.details[].reason === "API_KEY_INVALID"`, not on `errors[0].reason`, which is only the generic `badRequest`. The documented reason names `keyInvalid` and `keyExpired` are listed under 400 in the global-error table but were **not** what the live API returned. [Core errors](https://developers.google.com/youtube/v3/docs/core_errors)
- Missing key entirely → **HTTP 403**, `status: "PERMISSION_DENIED"`, `errors[0].reason: "forbidden"`, message "Method doesn't allow unregistered callers (callers without established identity)…" (observed live). Different status and shape from the invalid-key case.
- Quota exhausted → **HTTP 403** with `errors[0].reason: "quotaExceeded"` — "The requested operation requires more resources than the quota allows." Related 403 reasons that must not be confused with it: `dailyLimitExceeded`, `rateLimitExceeded`, `userRateLimitExceeded`. `rateLimitExceeded` can also arrive as 429. [Core errors](https://developers.google.com/youtube/v3/docs/core_errors), [Errors](https://developers.google.com/youtube/v3/docs/errors)
- Net rule for code: `400` + `details[].reason === "API_KEY_INVALID"` → operator key is broken, alert. `403` + `errors[0].reason === "quotaExceeded"` → quota gone, degrade to partial item and back off until midnight PT. `403` + `reason === "forbidden"` → misconfigured request, not a quota problem.

### Quota

- `videos.list` costs **1 unit**. [Quota costs](https://developers.google.com/youtube/v3/determine_quota_cost)
- Default allocation: "Projects that enable the YouTube Data API have a default quota allocation of 100 `search.list` calls, 100 `videos.insert` calls, and 10,000 units per day combined for all other endpoints." `videos.list` draws on the 10,000-unit pool, so ~10,000 metadata fetches/day. [Getting started](https://developers.google.com/youtube/v3/getting-started)
- "All API requests, including invalid requests, incur at least a one-point quota cost." Retrying a malformed request burns quota. [Getting started](https://developers.google.com/youtube/v3/getting-started)

### Video-id extraction from URLs

- **Google documents nothing about this.** No Data API page, support page or IFrame API page enumerates the URL→id mapping. The only forms confirmed from primary sources:
  - `https://www.youtube.com/embed/VIDEO_ID` — the documented embed `src` format. [Player parameters](https://developers.google.com/youtube/player_parameters)
  - `https://www.googleapis.com/youtube/v3/videos?id=7lCDEYXw3mM&…` — confirms the id is an opaque 11-char-style token, from Google's own example. [Getting started](https://developers.google.com/youtube/v3/getting-started)
  - `youtube.com`, `m.youtube.com` and `youtu.be` are named together as YouTube link domains, but with no path grammar. [YouTube universal links](https://support.google.com/youtube/answer/7174035)
- `watch?v=`, `/shorts/`, `/live/` are **not specified anywhere primary**. Our parser is therefore an unsanctioned heuristic: take `v` from the query string for `/watch`, else the first path segment after `/shorts/`, `/live/`, `/embed/`, else the first path segment for `youtu.be`. It must be covered by unit tests and must fail closed (reject rather than guess) on anything else, because no contract backs it.

## 2. youtubei.js on Cloudflare Workers

### Runtime support — yes, officially

- Cloudflare Workers is a **first-class build target**, not a community hack. `package.json` declares the export `"./cf-worker": {"default": "./dist/src/platform/cf-worker.js"}`, the build script runs `bundle:cf-worker`, and `bundle/cf-worker.d.ts` ships in the repo. The CHANGELOG records "add support of cloudflare workers ([#596])". [package.json](https://github.com/LuanRT/YouTube.js/blob/main/package.json), [CHANGELOG](https://github.com/LuanRT/YouTube.js/blob/main/CHANGELOG.md), [bundle/](https://github.com/LuanRT/YouTube.js/tree/main/bundle)
- The shim uses only Web-platform APIs — `caches.open('yt-api')`, `crypto.randomUUID`, `fetch`, `Request`/`Response`/`Headers`, `FormData`, `File`, `ReadableStream`, `CustomEvent`, plus a WebCrypto SHA-1 polyfill. [src/platform/cf-worker.ts](https://github.com/LuanRT/YouTube.js/blob/main/src/platform/cf-worker.ts)
- **No Node built-ins are required on this path.** `grep -rn "node:" src/` over the checked-out `main` returns nothing; the only Node imports (`stream/web`, `crypto`, `path`, `os`, `fs/promises`, `url`) live in `src/platform/node.ts`, which the `cf-worker` entry never imports. Runtime deps are `@bufbuild/protobuf`, `fflate`, `meriyah` — all pure JS. `nodejs_compat` is not needed for `youtubei.js/cf-worker`.
- Caveat on the guide: the public docs still say only "Node.js, Deno, and modern browsers" and do not mention Workers; the README says "Works on Node.js, Deno, modern browsers, and more". The Workers support is real in the package but undocumented on the site. [Getting started](https://ytjs.dev/guide/getting-started.html), [README](https://github.com/LuanRT/YouTube.js#readme)
- One hard Workers limit: the default JS-evaluator shim throws — "To decipher URLs, you must provide your own JavaScript evaluator." Workers forbid `eval()` and `new Function` outright, so any code path needing the player decipher is dead on Workers. Transcripts do not need it, but PO-token/BotGuard generation does. [src/platform/jsruntime/default.ts](https://github.com/LuanRT/YouTube.js/blob/main/src/platform/jsruntime/default.ts), [Workers web standards](https://developers.cloudflare.com/workers/runtime-apis/web-standards/)

### Unauthenticated transcripts — no longer viable

- Maintainer LuanRT, 2025-12-19, on the still-open transcript failure: "It appears YouTube's web app now requires a BotGuard response token for transcript requests. This token is generated via a challenge retrieved from the `/att/get` endpoint… It may be possible to generate a valid BotGuard response with `JSDOM`, but if the attestation requirements are more strict, then a full browser environment is probably required." [Issue #1102](https://github.com/LuanRT/YouTube.js/issues/1102)
- Collaborator absidue, 2025-12-26, same thread: "The correct solution is adding attestation support to the transcript fetching in YouTube.js… Additionally the textracks endpoints already uses content/video ID bound PO tokens, so if you think that switching to the text track endpoints will let you escape the need for attestations you are wrong." [Issue #1102](https://github.com/LuanRT/YouTube.js/issues/1102)
- That work is **still not done**. At v18.1.0 (`main`, 2026-09-24), `MediaInfo#getTranscript` walks the `engagement-panel-searchable-transcript` panel and calls `/get_transcript` with no attestation or PO-token parameter anywhere in the path; `grep -i attestation src/` finds only `Innertube#getAttestationChallenge`, live-chat `RunAttestationCommand`, and the session-bound PO token on `Session`. Issue #1102 remains open. [src/core/mixins/MediaInfo.ts](https://github.com/LuanRT/YouTube.js/blob/main/src/core/mixins/MediaInfo.ts), [src/parser/youtube/TranscriptInfo.ts](https://github.com/LuanRT/YouTube.js/blob/main/src/parser/youtube/TranscriptInfo.ts)
- Bot checks now also hit plain metadata: a January 2026 report of `playabilityStatus.status: LOGIN_REQUIRED`, reason "Sign in to confirm you're not a bot", across WEB, ANDROID, iOS and WEB_EMBEDDED clients. [Issue #1119](https://github.com/LuanRT/YouTube.js/issues/1119)
- Session-bound PO tokens are explicitly described in the source as BotGuard/DroidGuard attestation output — i.e. generated outside the library, by a browser-grade environment. [src/core/Session.ts](https://github.com/LuanRT/YouTube.js/blob/main/src/core/Session.ts)

### Datacenter / cloud IPs

- The project's own FAQ, answering why requests fail on a server but work locally: "The most common one is that the server's IP address is blocked by YouTube. Unfortunately, there is no known solution to this problem." [FAQ](https://ytjs.dev/guide/faq.html)
- LuanRT, 2024-09-11: "Your IPs are likely blocked. PoTokens do not bypass full IP blocks." [Issue #748](https://github.com/LuanRT/YouTube.js/issues/748)
- Cloudflare Workers egress from Cloudflare's own datacenter address space. Nothing in the maintainers' statements carves out an exception for it, and we cannot attach a residential proxy from a Worker without paying for one.

### Verdict — drop step (2)

Cut opportunistic Innertube captions from the ladder. Three independent reasons, each sufficient:

1. Transcript retrieval now requires a BotGuard attestation that **youtubei.js does not implement** (LuanRT and absidue, both in #1102, issue still open at v18.1.0). There is nothing to call.
2. Even once implemented, generating the attestation needs a browser-grade JS environment. Cloudflare Workers ban `eval()`/`new Function`, and the library's own evaluator shim throws on Workers. A Worker cannot solve BotGuard in-process.
3. The maintainers state plainly that server IPs get blocked and that there is no known solution, and that PO tokens do not bypass IP blocks. A Worker is a datacenter IP.

The ladder becomes: (1) Data API metadata always → (2) Supadata transcript on the user's optional key → (3) partial item. Revisit only if `LuanRT/YouTube.js#1102` closes with attestation support **and** someone demonstrates it working from a Worker.

## 3. Supadata costs — cross-check of `14-byok-key-verification.md`

- `/v1/metadata`: **confirmed, 1 credit.** "All metadata requests cost **1 credit**, regardless of platform or media type." Doc 14's claim stands. [Metadata](https://docs.supadata.ai/get-metadata.md)
- `/v1/transcript`: doc 14's flat "1 credit" is **incomplete and should be corrected.** The real schedule is "1 native transcript = 1 credit" but "1 generated transcript minute = 2 credits". The `mode` parameter defaults to `auto`, which is "try native, fallback to generate if unavailable". So a YouTube video with no captions silently falls through to AI generation at 2 credits/minute — a 40-minute video would be 80 credits, four-fifths of the entire free monthly allowance, from one save. [Transcript pricing](https://docs.supadata.ai/get-transcript.md), [Transcript OpenAPI](https://docs.supadata.ai/api-reference/endpoint/transcript/transcript.md)
  - **Implementation consequence:** send `mode=native` explicitly. Under `native` a caption-less video returns the `206 transcript-unavailable` soft result at 1 credit, which is exactly the "captured, no transcript" path doc 14 describes. Never rely on the `auto` default.
- `206 transcript-unavailable` costs 1 credit — confirmed. "1 credit is charged when request to get a transcript returns status 206 (Transcript Unavailable)." [Transcript pricing](https://docs.supadata.ai/get-transcript.md)
- Two further billing facts doc 14 does not record: polling a job's status is free ("No credits are charged for checking transcription job status"), and for `202` async jobs the `x-billable-requests` header is only a precharge estimate, reconciled on completion. A client-side timeout still consumes the credit. [Transcript pricing](https://docs.supadata.ai/get-transcript.md)
- Free plan: **confirmed, 100 credits/month, 1 request/second, no credit card.** [Pricing](https://supadata.ai/pricing)
- Costs are identical across YouTube, TikTok, Instagram, X, Facebook and file uploads — no YouTube-specific rate.

## Verification limits

The `400 API_KEY_INVALID` and `403 PERMISSION_DENIED` bodies above were observed live on 2026-09-29 against `www.googleapis.com/youtube/v3/videos` with a bogus key and with no key. **No valid YouTube API key was available**, so nothing behind a successful call was observed: the `200` body, the `items` shape, ISO 8601 duration values, `regionRestriction` presence, and above all the response for a non-existent or private video id are taken from documentation or, where the docs are silent, are explicitly flagged as unconfirmed. The `403 quotaExceeded` body was not reproduced live and is quoted from the error reference only — verify its exact shape against a real exhausted key before branching on it in production.

youtubei.js was read as source at `main` (v18.1.0, pushed 2026-09-24) and was **not executed on Cloudflare Workers**. The claim that the `cf-worker` entry needs no Node built-ins is from static inspection (`grep -rn "node:" src/` empty; `src/platform/cf-worker.ts` uses only Web APIs), not from a deploy. Since the verdict is to drop that step, this was not pursued further. Maintainer statements are quoted from GitHub issues authored by LuanRT (owner) and absidue (collaborator); no maintainer has commented on Cloudflare Workers plus transcripts specifically, so the verdict combines three separate primary statements rather than resting on one.

Supadata's `200` transcript and metadata bodies remain unobserved, as in doc 14. No live Supadata call was made in this check.

Nothing primary was found on YouTube video-id URL grammar or on chapter-timestamp formatting rules; both are called out above as heuristics rather than contracts.
