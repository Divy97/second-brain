# YouTube / Instagram ingestion: captions, download compute, hosted APIs

Researched 2026-09-27. Discussion input, not decisions.

## A) YouTube caption fetching from cloud IPs

| Approach | Works from datacenter IP (CF Workers / AWS / GCP)? | Notes |
|---|---|---|
| `youtube-transcript-api` (Python) / `youtube-transcript` (npm) | **No, unreliably.** Fresh cloud IPs work briefly, then `RequestBlocked` / `IpBlocked` / 429 / "Sign in to confirm you're not a bot". Blocks after ~100–200 requests in a few hours. | Maintainer issue #593 (May 2026, open) confirms AWS blocked, local works. Webshare *free* tier is datacenter proxies — also blocked. `PoTokenRequired` is now a distinct error class. |
| `youtubei.js` (Innertube, JS-native, runs on Workers) | **Partially.** `get_transcript` returns 400 / `FAILED_PRECONDITION` intermittently (issue #1102, open since Dec 2025); WEB `timedtext` returns empty bodies (PO-token gated). | The **ANDROID Innertube player client still returns caption URLs without a PO token** (verified 17 Sept 2026 in a real Workers deployment). Worker IPs can still get `LOGIN_REQUIRED`; that project degrades to description-only. Only JS-only, binary-free path with field evidence — brittle by definition. |
| YouTube Data API v3 `captions.download` | **No for third-party videos.** Requires OAuth from the *video owner*; non-owner gets 403. By design. | `captions.list` (50 units) says tracks exist but no text. **`videos.list` (1 unit) is the right call for metadata** (title, description, duration, channel, thumbnails) — 10,000 units/day free, no owner OAuth. |
| PO tokens (bgutil / WPC providers) | Provider plugins need a Node/browser runtime; tokens per-video, ~12h. Sept 2026 reports (yt-dlp #17682) of bgutil tokens rejected with 403. | Not viable inside a Worker (needs a sidecar). |
| Cookies | Raise trust briefly; expire in 1–2 days on burned IPs; accounts get locked. "Never use your main account." | Don't fix the IP problem. |
| Residential proxies | Required for DIY at any volume. Webshare rotating residential: $3.50/GB (1 GB) down to ~$1.12–1.40/GB. ~$0.15–$1.40 per 1,000 transcripts. | Still periodically blocked. **Workers can't use SOCKS/HTTP proxies natively** — forces a non-Workers runtime. |

### Hosted transcript APIs (YouTube)

| Service | Free tier | Paid | Uncaptioned fallback | Notes |
|---|---|---|---|---|
| **Supadata** | 100 credits/mo, no card | $5/mo = 300 credits; $17/mo = 3,000; $47 = 30k. Top-ups $10/1k. No rollover. | Yes — AI transcript at 2 credits/min | 1 credit per transcript *or* metadata call. Also covers **Instagram, TikTok, X**. Praised in the `youtube-transcript-api` thread as "works reliably, no blocking". |
| **TranscriptAPI.com** | 100 credits | $5/mo for 1k; top-ups $2.50/1k | — | Self-published comparisons. |
| **youtube-transcript.io** | 25 tokens/mo | $9.99/mo = 1,000; $24.99 = 3,000 | — | |
| **Apify actors** | $5/mo platform credit | apidojo $0.001/transcript; apihq $3/1k; lance_api $1/1k + $4 per 1k Whisper minutes | Some actors | Pay only on success. |
| **SearchAPI** | — | From $40/mo | — | Overkill. |
| **RapidAPI** listings | Varies | Unverifiable | — | Per-vendor reliability. |
| **FreeTranscriptAPI.com** | 50 req/hr per IP, 1,000 credits | — | — | Unknown longevity. |

## B) Where to run yt-dlp + ffmpeg on demand

| Platform | Free tier (2026) | Cost beyond free | Fit | Caveats |
|---|---|---|---|---|
| **Cloudflare Containers** | None — Workers Paid $5/mo. Included: 375 vCPU-min, 25 GiB-hr memory, 200 GB-hr disk, 1 TB egress. | $0.000020/vCPU-s, $0.0000025/GiB-s, $0.025/GB egress | Good: tight Workers/DO integration, custom Dockerfile. | Included compute modest (~6 vCPU-hours/mo). Docs updated 28 Aug 2026, no beta label. |
| **Google Cloud Run** | 180k vCPU-s + 360k GiB-s + 2M req/mo (~50 CPU-hours), never expires. Scale-to-zero. | $0.000024/vCPU-s, $0.40/M req | **Strongest free option**: any Docker image, 60-min timeout, Cloud Run Jobs. | Needs billing account. GCP IPs on YouTube's blocklist. |
| **AWS Lambda (container image)** | 1M req + 400k GB-s/mo, permanent. | $0.20/M req + $0.0000167/GB-s | Fine for audio-only; 10 GB image, 15-min ceiling. | Cold starts; AWS IPs blocked. |
| **Modal** | $30/mo credit, resets monthly. | $0.0000131/core-s | Excellent Python DX: `Image.debian_slim().apt_install("ffmpeg").pip_install("yt-dlp")` + web endpoint. Scale-to-zero. | Python-only orchestration. Datacenter IPs. |
| **Fly.io** | Free tier ended Oct 2024; 2 VM-hour / 7-day trial. | shared-cpu-1x ≈ $2.19/mo always on | Machines stop/start on demand. | Practical floor ~$5/mo. |
| **Railway** | One-time $5 trial, 30 days. | Hobby $5/mo; no sleep | Works; idle cost. | ~$20–40/mo realistic always-on. |
| **Render** | Free: 750 hrs/mo, 512 MB / 0.1 CPU, spins down after 15 min, "not for production". | Hobby $5/mo | Underpowered for ffmpeg. | Cold start 30–60s. |
| **Koyeb** | **Closed to new signups** after Mistral acquisition (Feb 2026). | Pro $29/mo | — | No free path for new accounts. |
| **Oracle Cloud Always Free** | ARM cut 4 OCPU/24 GB → **2 OCPU/12 GB** (18 Aug 2026), murky enforcement. x86 micro unchanged. 200 GB storage. | $0 | A real always-on VM. | ARM64; capacity lottery; idle-reclaim risk; datacenter IP. |
| **Hetzner** | None. | CX23 €5.49/mo (prices rose June 2026) | Best €/perf. | Hetzner ranges explicitly blocked by YouTube. |
| **GitHub Actions** | 2,000 min/mo | — | Runs anything. | **ToS violation**: Additional Product Terms prohibit use "as part of a serverless application". Not viable. |

### The IP problem is independent of platform

Every option sits in publicly mapped cloud ranges. Field reports (Aug 2026): ~1 in 4 fresh exit IPs hits the bot wall on first contact; serverless is worst ("shared IP pools other people already burned"). Mitigations in use:

- Residential proxy via `--proxy` (~$3.50/GB; a 5-min audio download ≈ 5 MB ≈ $0.02/video).
- Burner-account cookies as a secret — brief help, lock risk, rotation needed.
- PO-token provider sidecar — heavy, rejected-token reports Sept 2026.
- `--sleep-requests` spacing.
- Managed download APIs (Supadata AI transcript 2 credits/min, Apify Whisper-fallback actors $4/1k min) — they eat the proxy problem.

### STT costs per audio minute

| Provider | Price | Free |
|---|---|---|
| Cloudflare Workers AI `whisper-large-v3-turbo` | ~$0.0005/min | 10,000 neurons/day |
| Groq Whisper large-v3-turbo | ≈ $0.00067/min | 2,000 audio req/day |
| Groq Whisper large-v3 | ≈ $0.00185/min | same |
| Deepgram Nova-3 | $0.0043/min | $200 credit |
| OpenAI Whisper | $0.006/min | — |

STT is negligible; getting the audio is the whole cost.

## C) Instagram

| Item | Status Sept 2026 |
|---|---|
| **yt-dlp Instagram extractor** | Fragile. Stable 2026.06.09 broke on reels ("empty media response"); fix nightly-only. Sept 2026 issues (#17707) show login walls even with browser-exported cookies. Maintainer guidance: `--update-to nightly` + `--cookies-from-browser`. |
| **Cookies required?** | Practically yes. Anonymous requests get login-redirected or empty responses. |
| **Ban risk** | High, lands on the cookie account: action blocks, checkpoints, suspension. Behavioral ML + TLS fingerprinting. Burner only. |
| **Official caption/transcript API** | **None.** Graph API is Business/Creator, own-media only. Basic Display API died Dec 2024. No endpoint exposes reel auto-captions. |
| **oEmbed** | Reversed 15 June 2026: **no token or App Review needed** for public posts, 1,000 req/hr. Returns `html` embed + basic fields — **no caption text, no transcript, no media URL**; docs forbid non-embed use. Good for "show the reel" in UI only. |
| **Supadata** | Instagram reel transcript via URL, timestamped; 100 free credits/mo, then $5/mo. AI-transcript 2 credits/min. |
| **Apify** | Reel scrapers $0.05–$2.60 per 1k; "reel transcript" actors ~$0.02/reel with speech, silent reels free. $5/mo free credit. |

## Trade-offs for us (no decisions)

1. **JS-only Worker path exists for YouTube but is the least stable thing on this list.** ANDROID Innertube + `videos.list` metadata is zero-cost and binary-free today; can go dark any week.
2. **A hosted transcript API costs less than a proxy subscription and removes the IP fight.** Supadata at $5/mo covers 300 YouTube/Instagram/TikTok items incl. AI transcription — same $5 as Workers Paid, none of the maintenance. Vendor lock-in and rate caps are the price.
3. **If we self-host download+STT, Cloud Run or Modal are the free-tier candidates; Cloudflare Containers is $5/mo with best DX for a Workers backend.** All share the IP problem → "free compute" still implies a residential proxy and a burner cookie jar.
4. **Instagram has no clean path.** Every route is scraping.
5. **Oracle Always Free is the only $0 always-on VM, just halved with murky enforcement.**
6. **GitHub Actions is ruled out by ToS.**

## Sources

YouTube captions
- https://github.com/jdepoix/youtube-transcript-api/issues/593
- https://github.com/hxckya/youtube-transcript-ip-blocked-guide
- https://github.com/jdepoix/youtube-transcript-api/issues/511
- https://www.tutorialpedia.org/blog/downloading-captions-always-returns-a-403/
- https://developers.google.com/youtube/v3/getting-started
- https://github.com/LuanRT/YouTube.js/issues/1102
- https://github.com/spokospace/zapiszprzepis/pull/141
- https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide
- https://github.com/yt-dlp/yt-dlp/issues/17682
- https://ansaribilal.com/blog/ytagent-datacenter-ip-block-youtube-ai-agents-2026/
- https://supadata.ai/pricing
- https://transcriptapi.com/blog/youtube-transcript-api-comparison
- https://www.youtube-transcript.io/pricing
- https://apify.com/pricing
- https://apify.com/apidojo/youtube-transcript-scraper
- https://apify.com/lance_api/youtube-transcripts-scraper
- https://www.webshare.io/pricing

Compute
- https://developers.cloudflare.com/containers/pricing/
- https://cloud.google.com/run/pricing
- https://www.cloudzero.com/blog/lambda-pricing/
- https://modal.com/pricing
- https://fly.io/pricing-update/
- https://docs.railway.com/pricing/plans
- https://render.com/docs/free
- https://www.koyeb.com/docs/faqs/pricing
- https://terminalbytes.com/oracle-cloud-free-tier-changes-2026/
- https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/
- https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features
- https://ytdlp.org/guides/run-yt-dlp-server
- https://developers.cloudflare.com/workers-ai/platform/pricing/
- https://console.groq.com/docs/speech-to-text

Instagram
- https://github.com/yt-dlp/yt-dlp/issues/17074
- https://github.com/yt-dlp/yt-dlp/issues/17707
- https://ytdlp.org/guides/yt-dlp-for-instagram
- https://www.socialcrawl.dev/blog/instagram-scraping-2026
- https://developers.facebook.com/docs/instagram-platform/oembed/
- https://supadata.ai/instagram-transcript-api
- https://apify.com/apify/instagram-reel-scraper
