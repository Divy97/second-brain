# URL → clean text extraction: Cloudflare features vs. open-source/hosted options

Researched 2026-09-27. Discussion input, not decisions.

## A) Cloudflare features for AI agents/bots reading web content

Short version: Cloudflare's "AI bot" features are almost all built for site owners to control/monetise/serve bots hitting *their own* zone. Only Browser Run and Workers AI directly help a third-party app read *other people's* sites. Nothing Cloudflare offers bypasses bot-blocking or paywalls.

| Feature | What it actually does | Helps us read *other people's* sites? | Pricing / free tier | Key limitations |
|---|---|---|---|---|
| **Web Bot Auth / Signed Agents / Verified Bots** | Bot signs HTTP requests (Ed25519, HTTP Message Signatures, IETF draft). Cloudflare verifies and classifies as "Verified Bot" or "Signed Agent". Enrolment via Bot Submission Form. | Only marginally. Being verified lets sites *that opt to allow signed agents* let you through. Verified Bots policy requires >1,000 req/day across multiple domains — a small second-brain app is unlikely to qualify. | Free to enrol | Only applies to sites behind Cloudflare Bot Management; sites must explicitly allow signed agents; enforcement ramping from July 2026. Still an Internet-Draft. |
| **Pay Per Crawl** | Site owner sets a per-zone/per-path price; crawler gets HTTP 402 + `crawler-price`; retries with signed price headers; Cloudflare is merchant of record, min $0.001/request. | No, not practically. Monetisation tool for publishers. Requires verified crawler + Stripe. Closed beta. | Beta; crawler pays per fetch | Closed beta; needs verified-crawler status. |
| **AI Crawl Control** | Dashboard for zone owners: see/allow/block/charge AI crawlers by category (Search / Agent / Training). From 15 Sept 2026 Training + Agent crawlers blocked by default on ad-bearing pages. Available on Free plan. | **No — works against us.** More sites now block "Agent" category by default. | Free for site owners | N/A except as a threat. |
| **Markdown for Agents** (12 Feb 2026) | Zone owner enables it; client sends `Accept: text/markdown`; Cloudflare converts origin HTML → Markdown at the edge (YAML frontmatter + body + JSON-LD). Headers `x-markdown-tokens`, `x-original-tokens`. 2 MB origin cap. | Opportunistically, on sites that (a) are on Pro/Business/Enterprise and (b) turned it on. Off by default. Cheap to try: add the header on every fetch and check `Content-Type`. | Free on Pro/Biz/Ent | Not on Free zones; off by default; plain converter, not main-content extractor. |
| **Browser Run** (renamed from Browser Rendering, 15 Apr 2026) REST API | Headless Chromium. Quick Actions: `/markdown`, `/content`, `/scrape`, `/json`, `/links`, `/snapshot`, `/screenshot`, `/pdf`, `/crawl`. `/markdown` supports `waitUntil: networkidle0`, `waitForSelector`, cookies, custom UA. Also Workers binding (Puppeteer/Playwright). | **Yes — the real one.** Solves JS-rendered pages. | Free: 10 browser-min/day, 3 concurrent, 1 new browser/20s, 1 Quick Action/10s, 60s timeout. Paid: 10 browser-hours/mo included, then $0.09/browser-hour; 10 concurrent included then $2/browser/mo. Failed calls not billed. | Does **not** bypass bot protection or paywalls (docs explicit); datacenter egress IP; `/markdown` is Turndown-style, not Readability-style extraction; free-tier rate limits are demo-only. |
| **Workers AI `env.AI.toMarkdown()`** | Converts HTML, PDF, images, office docs → Markdown inside a Worker. Strips script/style, extracts meta, resolves links, CSS selector support. | Partially — a conversion step after we fetch. Doesn't fetch, render JS, or extract main content. | Free for most formats; images may bill neurons. | Not an extractor. |
| **Workers AI (models)** | Serverless inference. Could run an LLM cleanup pass. No ReaderLM-v2. | Post-processing only. | 10k neurons/day free; $0.011/1k neurons. | Not a fetcher. |
| **AI Search** (formerly AutoRAG) | Managed RAG: ingest → chunk → embed → Vectorize → query. Sources: built-in storage, R2, Website. | No for fetching: "You can only crawl domains that you have onboarded onto the same Cloudflare account." Possibly useful *downstream* to index text we already extracted. | Free during open beta: 100 instances, 100K files/instance, 20K queries/mo. | Own-zone only; 4 MB/file; pricing not announced. |

Cross-cutting facts:

- **Workers `fetch()` egress IPs are datacenter IPs** on many IP-reputation blocklists. Expect fast 403s on a meaningful minority of news sites regardless of library. Browser Run has the same egress problem.
- Cloudflare's Sept 2026 default (block Training + Agent crawlers on ad-supported pages) means our fetcher's *category* matters. A plain UA fetch is an unverified bot; we probably can't qualify for Verified Bots at our traffic level.

## B) Open-source extraction projects and hosted reader APIs

### Open-source libraries / self-hostable services

| Project | Language / license | Runs in Cloudflare Workers? | JS rendering | Anti-bot | Quality reputation | Notes |
|---|---|---|---|---|---|---|
| **Mozilla Readability** | JS / Apache-2.0 | Yes with `linkedom` (jsdom does not work in Workers). ~80 KB + ~240 KB linkedom; 20–40 ms CPU/page. | No | No | Still the reference: May 2026 BulkMD benchmark matched ground truth within 5% on 88% of 50 articles. Retains short non-prose blocks; effectively unmaintained. | Pair with Turndown (MIT). "Hono + Readability + linkedom + Turndown" is the de-facto Workers pattern. |
| **Defuddle** (kepano / Obsidian Web Clipper) | TS / MIT | Yes — accepts a linkedom/JSDOM/happy-dom Document; community Worker exists (`thieung/defuddle`). Sept 2026 releases fix linkedom vs JSDOM metadata inconsistencies. | No | No | Built to replace Readability; more forgiving; consistent footnotes/math/code; mobile CSS to detect clutter; site-specific extractors. Actively maintained. | Outputs cleaned HTML *or* Markdown natively. Demo: `defuddle.md/<url>`. |
| **Postlight Parser** (ex-Mercury) | JS / Apache-2.0 | Not cleanly — cheerio + node request stack; last commit July 2024. | No | No | Effectively unmaintained. | Skip. |
| **Trafilatura** | Python / Apache-2.0 | No (Python). | No | No | Best-in-class multilingual + comment handling; ~85 ms/page; well-benchmarked. | Only if we accept a Python microservice. |
| **markdowner** (supermemoryai) | TS / MIT | Yes — it *is* a Worker. Browser Rendering binding + Durable Objects for warm sessions + Turndown. | Yes | No | Thin wrapper; low maintenance. | Requires Workers Paid + Browser Run. Reference architecture. |
| **website2markdown** (Digidai) | TS / Apache-2.0 | Yes — Worker. 14 site adapters, 5-layer fallback, MCP server. | Partial | Site-adapter approach | New (2026); unknown track record. | Design reference for a fallback chain. |
| **cloudflare-dom-distiller** (ainoya) | TS | Yes — Browser Rendering + Readability + Turndown | Yes | No | Small | Reference impl. |
| **readdown** (zcag) | TS | Likely | No | No | New 2026 | Token-count estimation built in. |
| **Firecrawl** (self-host) | TS/Python / **AGPL-3.0** core | No — Docker: API + Redis + Playwright (+ Postgres/RabbitMQ). | Yes | No — stealth/proxy "fire-engine" is cloud-only. | Cloud output widely rated best of hosted readers. Self-host lags. | AGPL matters if we modify and run as a service. |
| **Jina Reader** (OSS branch) | TS / Apache-2.0 | No — Docker image bundles headless Chrome + LibreOffice. | Yes | No | Good "sufficient for articles"; includes more extraneous content than Firecrawl. | ReaderLM-v2 (1.5B HTML→MD model) too heavy for Workers AI. |
| **Crawl4AI** | Python / Apache-2.0 | No — Python + Playwright. | Yes | Basic stealth | Very popular; "Fit Markdown" boilerplate removal. | Also has a Cloud offering. |

None of the pure-JS extractors render JS or beat bot blocks — they operate on HTML you already have.

### Hosted reader APIs with free tiers

| Service | Endpoint | Free tier | Paid | JS render | Anti-bot | Notes |
|---|---|---|---|---|---|---|
| **Jina Reader** `r.jina.ai/<url>` | GET prefix | No key: 20 RPM. Free key: 500 RPM + 10M tokens | Token-based; ReaderLM-v2 mode 3× tokens | Yes | Some | Simplest integration. |
| **Firecrawl Cloud** `/scrape` | POST | 1,000 credits/mo (doubled 2026), no card | Hobby $19 (5k), Standard $99 (100k) | Yes | Yes (stealth/proxies) | Best-rated cleaning; credits don't roll over. |
| **Exa** `/contents` | POST | $10 credits/mo + $10 onboarding | $1/1k pages per content type | Yes | Some | Search + contents. |
| **Tavily** `/extract` | POST | 1,000 credits/mo, no card; 1 credit per 5 URLs (basic) | PAYG $0.008/credit | Yes | Some | Cheapest per URL (~5,000 extractions/mo free). Failed URLs free. |
| **Crawl4AI Cloud** | REST | $10 credit pack free until 31 Dec 2026 | PAYG | Yes | Basic | New. |
| **Cloudflare Browser Run `/markdown`** | POST | 10 browser-min/day, 1 req/10s | $0.09/browser-hour | Yes | No | No extraction step. |

## What this means for us (trade-offs, not decisions)

- The "Cloudflare lets AI bots read blogs" belief is half-right and points the wrong way. Web Bot Auth, AI Crawl Control and Pay Per Crawl are site-owner controls that mostly *reduce* what an unverified fetcher can read. The pieces that fetch for us are Browser Run and (as a converter) `toMarkdown()`.
- A Workers-native pipeline is feasible for the ~80% case: `fetch()` with `Accept: text/markdown` → if HTML, Readability-or-Defuddle on linkedom → Markdown; escalate to Browser Run only when the static fetch is thin. JS-render fallback realistically means Workers Paid.
- Bot-blocking and paywalls are unsolved by every Cloudflare primitive and every self-hosted OSS option. Only hosted readers with stealth/residential layers move that needle, and none guarantee paywalled content. Any design needs a "couldn't extract — save the URL + user-provided text" path.
- Quality vs deployability: Trafilatura/Crawl4AI/Firecrawl give the best OSS quality but force a container. Defuddle is the strongest option that stays inside Workers and is actively maintained.
- Hosted fallback budget is generous at second-brain volume (Tavily ≈5,000 URLs/mo free), but adds a vendor dependency and sends user-saved URLs to a third party.
- AI Search is a downstream tool, not an ingester.

## Sources

Cloudflare (official)
- https://blog.cloudflare.com/signed-agents/
- https://blog.cloudflare.com/web-bot-auth/
- https://developers.cloudflare.com/bots/concepts/bot/verified-bots/policy/
- https://github.com/cloudflare/web-bot-auth
- https://developers.cloudflare.com/ai-crawl-control/features/pay-per-crawl/what-is-pay-per-crawl/
- https://developers.cloudflare.com/ai-crawl-control/
- https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents
- https://developers.cloudflare.com/changelog/post/2026-02-12-markdown-for-agents/
- https://developers.cloudflare.com/browser-rendering/rest-api/markdown-endpoint/
- https://developers.cloudflare.com/browser-rendering/platform/limits/
- https://developers.cloudflare.com/browser-rendering/platform/pricing/
- https://developers.cloudflare.com/changelog/post/2026-04-15-br-rename/
- https://developers.cloudflare.com/workers-ai/features/markdown-conversion/
- https://developers.cloudflare.com/ai-search/
- https://developers.cloudflare.com/ai-search/configuration/data-source/website/
- https://developers.cloudflare.com/ai-search/platform/limits-pricing/

Third-party coverage
- https://crawlbase.com/blog/web-bot-auth-signed-agents/
- https://www.helpnetsecurity.com/2026/07/02/cloudflare-ai-crawler-controls/
- https://techcrunch.com/2026/07/01/cloudflares-new-policy-pushes-ai-companies-to-pay-for-publishers-content/
- https://suganthan.com/blog/cloudflare-markdown-for-agents/
- https://cogley.jp/articles/cloudflare-workers-html-to-markdown
- https://scrapeops.io/web-scraping-playbook/403-forbidden-error-web-scraping/

Open-source projects
- https://github.com/kepano/defuddle
- https://github.com/thieung/defuddle
- https://github.com/supermemoryai/markdowner
- https://github.com/Digidai/website2markdown
- https://github.com/ainoya/cloudflare-dom-distiller
- https://github.com/zcag/readdown
- https://docs.firecrawl.dev/contributing/self-host
- https://github.com/jina-ai/reader
- https://huggingface.co/jinaai/ReaderLM-v2
- https://github.com/unclecode/crawl4ai
- https://github.com/postlight/parser/issues/758
- https://trafilatura.readthedocs.io/en/latest/evaluation.html
- https://bulkmd.app/blog/readability-vs-trafilatura-extractors

Hosted APIs / pricing
- https://jina.ai/reader/
- https://www.firecrawl.dev/pricing
- https://exa.ai/docs/reference/pricing
- https://docs.tavily.com/documentation/api-credits
- https://crawl4ai.com/
- https://blog.apify.com/jina-ai-vs-firecrawl/
