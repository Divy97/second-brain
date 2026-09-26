# Open-source second-brain projects: survey, patterns, techniques

Researched 2026-09-27. Discussion input, not decisions. Star counts from live fetches that day.

## 1. Project-by-project

### Karakeep (ex-Hoarder) — bookmark-everything, closest to our shape
- 29.3k stars, AGPL-3.0, v0.33.x (semantic search shipped 0.33). Very active.
- Stack: Next.js + tRPC, Drizzle on SQLite, NextAuth, Puppeteer, Meilisearch, OpenAI/Ollama. Background jobs via `liteque` (SQLite queue) with separate queues: crawler, inference, search-index, video (yt-dlp), RSS, asset tidy, webhook, rule engine. Per-queue worker counts and timeouts via env.
- Inputs: links, notes, images, PDFs; RSS; video archival via yt-dlp (50 MB cap); full-page archive via monolith.
- Processing: Puppeteer → readability → monolith/screenshot → OCR (tesseract.js, confidence threshold, optional LLM) → LLM tagging (on by default) + summarization (off by default); image tagging via vision model.
- Search: Meilisearch full-text; since 0.33 embeddings (`text-embedding-3-small`) stored in Meilisearch as vector store. Modes: full text / semantic / hybrid. API, MCP, CLI.
- Answering: no QA chat; search + tags + summaries. MCP lets an external agent do QA.
- Extension: Chrome/Firefox/Safari; iOS/Android apps.
- Multi-user with OIDC; AI keys instance-level env.
- Dedupe: URL check before crawl.
- **Steal:** embedding-assisted tagging — retrieve similar items, feed their tags into the prompt to stop tag sprawl. Separate queues per stage with independent worker counts/timeouts.
- **Avoid:** search engine as vector store couples you to Meilisearch; model/dims change forces full re-embed (documented limitation).
- https://github.com/karakeep-app/karakeep · https://docs.karakeep.app/configuration/environment-variables · https://github.com/karakeep-app/karakeep/releases/tag/v0.33.1

### Supermemory — memory API, open source, Cloudflare-native
- 30.9k stars, MIT, TypeScript. Hosted SaaS + `npx supermemory local`.
- Stack: **Cloudflare Workers + Hono + Drizzle, D1/Hyperdrive→Postgres, KV, Durable Objects, Cloudflare Workflows for ingestion** (`IngestContentWorkflow`: type detection → chunking → embedding → space relationships). Default local embedding `bge-base-en-v1.5`; supports OpenAI/Gemini/Ollama.
- Inputs: PDFs, images (OCR), videos (transcription), code (AST-aware), URLs, connectors (Drive, Gmail, Notion, GitHub, crawler).
- Memory engine: fact extraction, supersession, contradiction resolution, expiry, "intelligent decay", static + dynamic user profile. Forget = soft delete.
- Search: "hybrid" = chunks + extracted memories in one query; metadata filters; sub-400ms claims. Ranks #1 on LongMemEval/LoCoMo per README (self-reported).
- No extension; MCP + IDE plugins.
- `containerTags` for tenant scoping; any provider; offline mode.
- **Steal:** deployment shape is almost exactly ours. Two-layer model: raw chunks *and* distilled memories, queried together.
- **Avoid:** "memory decay" — for a personal archive, silently fading content is a bug. Keep decay as ranking bias, never deletion.
- https://github.com/supermemoryai/supermemory · https://supermemory.ai/blog/memory-engine/

### Khoj — self-hosted "AI second brain", QA-first
- 37.5k stars, AGPL-3.0. Python (FastAPI + Django), **Postgres + pgvector**.
- Inputs: PDF, Markdown, org-mode, Word, images, Notion, GitHub; clients: web, Obsidian, Emacs, desktop, WhatsApp.
- Search: bi-encoder → **cross-encoder reranker**; "bi-encoder confidence threshold" gates what reaches chat.
- Answering: chat with references; agents; scheduled automations.
- **Steal:** retrieve-then-rerank with explicit distance threshold that returns "nothing relevant" instead of hallucinating.
- **Avoid:** Python monolith with GPU rerankers — behavior reference only.
- https://github.com/khoj-ai/khoj · https://docs.khoj.dev/features/search/

### Mem0 — memory extraction library
- 66k stars, YC S24. v3 (Apr 2026): single-pass ADD-only extraction, entity linking, temporal reasoning; LoCoMo 71.4→92.5.
- Pipeline: rolling summary + last 10 messages → LLM extracts facts → per fact retrieve top-10 similar memories → LLM chooses **ADD / UPDATE / DELETE / NOOP**. Graph variant marks conflicting edges invalid (not deleted).
- Results: 67.1% vs 72.9% full-context, but 91% lower p95 latency and 90% fewer tokens. Plain RAG ~61%.
- Storage: Qdrant primary; pgvector supported; graph via Neo4j/Memgraph/Kuzu; hybrid = semantic + BM25 + entity.
- **Steal:** ADD/UPDATE/DELETE/NOOP loop as dedupe + contradiction primitive for "facts about me".
- **Avoid:** don't run everything through extraction — condensed memories lose ~5 pts vs full context. Archive content stays as chunks.
- https://arxiv.org/html/2504.19413v1 · https://github.com/mem0ai/mem0

### Memos — quick-capture notes, no AI
- 63.4k stars, Go + React, MIT. Timeline + tags + pins, attachments, web clipper, Spaces. No semantic search.
- **Steal:** the capture UX — frictionless, chronological, one text box.
- https://github.com/usememos/memos

### Linkwarden — collaborative bookmark preservation
- Next.js, Prisma + Postgres, Meilisearch, Vercel AI SDK tagging via separate AI worker, Expo app, extension. Archives as screenshot/PDF/single-file HTML/readable. Dedupes links. Operator search (`title:`, `before:`). No semantic search.
- **Steal:** preservation formats as first-class artifacts.
- **Avoid:** keyword-only retrieval — reviews: "if you can't recall words on the page, nothing surfaces it."
- https://github.com/linkwarden/linkwarden

### AnythingLLM — private workspace RAG
- Node/Express + separate **collector service** + React. LanceDB default; 10+ vector DBs. Collector: PDF/DOCX/TXT, website (Puppeteer), YouTube transcripts, GitHub/Confluence, audio via Whisper, images via Tesseract.
- Chunking 1000 chars / 20 overlap; similarity threshold (default 0.25); citations per answer; per-workspace LLM; extension. No hybrid/rerank.
- **Steal:** collector as a separate service with one contract ("turn X into text + metadata"). Plan embedding-model versioning up front.
- https://docs.anythingllm.com/setup/vector-database-configuration/overview

### Open WebUI (knowledge)
- Loaders: Tika, Docling, Mistral OCR, YouTube transcripts (needs captions), web, Drive. Splitters: RecursiveCharacter, tiktoken, **markdown header-aware with forward-merge of small fragments** (90%+ fewer vectors claimed). Vector DBs incl. pgvector. Hybrid = BM25 + vector weighted, **cross-encoder reranker**, relevance threshold. Citations per chunk; agentic mode.
- **Steal:** header-aware chunking + merge-small-forward; explicit relevance threshold.
- **Avoid:** default 4096 context silently truncates RAG context.
- https://docs.openwebui.com/features/chat-conversations/rag/

### Fabric — YouTube transcript pipeline reference
- yt-dlp pulls subtitles; API key only for comments/metadata. Patterns: `extract_wisdom`, `summarize`.
- **Key finding:** YouTube 429s "increasingly common"; mitigations sleep, cookies, VPN. Corroborated by the IP-blocked guide.
- https://github.com/danielmiessler/Fabric/blob/main/docs/YouTube-Processing.md

### Omnivore (archived) → successors
- Shut down Nov 2024. Refugees → Karakeep, Wallabag, Readeck, Readwise Reader.

### Readeck — minimal read-later, Go
- Codeberg, 1.1k stars, AGPL. Each bookmark = one immutable ZIP (text + images); readability-style; EPUB; extension; API.
- **Steal:** immutable per-item archive blob + derived text.
- https://codeberg.org/readeck/readeck

### Wallabag
- 13k stars, MIT, PHP. Extraction via graby + ftr-site-config (per-site rules). No AI.
- **Steal:** site-config rules as an escape hatch where readability fails.
- https://github.com/wallabag/wallabag

### Reor — local AI notes (archived March 2026)
- Electron + LanceDB + Transformers.js. No hybrid, no citations.
- **Avoid:** desktop-only, single vector store, no keyword path — died with those constraints.

### Obsidian: Smart Connections & Copilot
- Smart Connections (5.5k): block/heading-level local embeddings; related-notes sidebar.
- Copilot (7.8k, V4 Aug 2026): indexing moved out of the plugin to **Miyo**, a separate local process doing **dense + BM25 hybrid**, so a 100k-file vault doesn't freeze the editor. BYOK any provider.
- **Steal:** block-level chunks as retrieval unit; indexer must live outside the UI process.
- https://github.com/logancyang/obsidian-copilot · https://docs.obsidiancopilot.com/vault-search-and-indexing/

### Screenpipe — rewind-style recorder
- 21.7k stars, YC S26, source-available (non-commercial), Rust + Tauri, SQLite FTS5. Event-driven capture; text from **OS accessibility tree first, OCR fallback**; audio via Whisper/Deepgram with diarization.
- **Steal:** accessibility-tree-before-OCR. For an extension: read the DOM, don't screenshot.
- **Avoid:** license blocks commercial reuse.
- https://github.com/screenpipe/screenpipe

### Small "second-brain" repos worth reading
- **vedjr02/Second-Brain** (closest end-to-end match): Telegram capture; photos → tesseract, vision fallback; voice → faster-whisper; reels → yt-dlp + ffmpeg keyframes + OCR + whisper + one LLM consolidation call; SQLite; MiniLM 384d; sentence-aligned overlapping chunks; hybrid = cosine OR lexical, threshold-gated; explicit "I don't have anything saved" on empty. https://github.com/vedjr02/Second-Brain
- **rahilp/second-brain-cloudflare** (789 stars, MIT): single Worker + D1 + Vectorize + Workers AI + KV. Capture = classify → dedupe → contradiction check → relationships → index (vector + D1 full-text). Graceful degradation if Vectorize is down. v3: workspaces, bearer tokens, MCP, extension + bookmarklet + iOS Shortcuts. https://github.com/rahilp/second-brain-cloudflare
- **RafalWilinski/cloudflare-rag** (606 stars): Workers + D1 FTS (BM25) + Vectorize, **RRF merge**, LLM generates 5 query variants run against both stores, unpdf in-Worker PDF parsing, AI Gateway, SSE streaming. https://github.com/RafalWilinski/cloudflare-rag
- **smixs/agent-second-brain**: Telegram voice/photo/doc → Claude agent → Obsidian vault. https://github.com/smixs/agent-second-brain

### Cloudflare-native primitives (state today)
- **AI Search (ex-AutoRAG):** managed ingest→chunk→embed→hybrid (BM25+vector, RRF or max fusion)→optional cross-encoder rerank→generate; sources R2 + own-zone website; metadata filters; Workers binding / REST / MCP; keyword-enabled instances cap at 500k files. https://developers.cloudflare.com/ai-search/configuration/indexing/hybrid-search/
- **Workflows V2 (May 2026):** deterministic durable execution, 50k concurrent instances, 300 new/s, 2M queue depth. https://www.infoq.com/news/2026/05/cloudflare-workflows-v2-release/
- **Workers AI Whisper:** `whisper-large-v3-turbo` ~$0.0005/audio-min; chunk long audio (official tutorial); community reports of repetitive/corrupted output on some inputs. https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/
- **Browser Rendering:** Puppeteer/Playwright on paid plan; markdown/JSON endpoints; 429s under load.

### Others checked briefly
- **Dify:** General / **parent-child** / Q&A chunking; hybrid; optional reranker; citations. Parent-child = match small child, return larger parent. https://dify.ai/blog/introducing-parent-child-retrieval-for-enhanced-knowledge
- **Memex (WorldBrain):** MIT extension, full-text search of bookmarked/annotated pages, local-only; auto-capture is opt-in per page. https://github.com/WorldBrain/Memex
- **Defuddle:** Readability replacement used by Obsidian Web Clipper; Markdown out. https://github.com/kepano/defuddle
- **Recall (getrecall.ai):** closed source, skipped.

## 2. Patterns that recur across projects

1. **Two-path retrieval is table stakes.** Every serious 2025–26 project runs keyword + vector fused with **RRF**. Keyword-only projects get called out in reviews. pgvector + `tsvector` + RRF in one SQL query is well-trodden; ParadeDB `pg_search` for real BM25 instead of `ts_rank_cd`.
2. **Reranking is optional and separated.** Cross-encoder after fusion, default-off. Anthropic: hybrid alone −49% retrieval failures, +rerank −67%.
3. **Extraction is a separate service with one contract.** Type → (text, metadata, assets). Video universally: download → keyframes+OCR → transcript → one LLM consolidation.
4. **Queue per stage, worker count per queue, timeout per job.** Karakeep's env surface is the clearest spec. Workflows V2 is the Cloudflare equivalent.
5. **Keep the original.** Derived text is regenerable; the source isn't.
6. **Dedupe at two levels.** URL/hash before crawl; semantic ADD/UPDATE/DELETE/NOOP for facts. Nobody dedupes chunks semantically at ingest.
7. **Grounded-or-nothing answers.** Every system has a floor that returns "nothing found."
8. **Embedding model is a migration hazard.** Store `embedding_model` + `dims` per row from day one.
9. **Indexing outside the UI process.** Copilot moved to Miyo; Reor (in-process) died.
10. **YouTube/Instagram fetching from datacenter IPs is broken by default.** Every project runs yt-dlp on a residential box, uses cookies, or pays a transcript API. External dependency, not a Worker.
11. **BYOK is instance-level in most OSS**, per-tenant only in memory APIs. Nobody stores per-user provider keys well — a gap we'd be filling, not copying.
12. **MCP has replaced "chat UI" as the answer surface** for Karakeep, Supermemory, Mem0, rahilp, AI Search, Graphiti.

## 3. Notable techniques

| Technique | Relevance to a personal memory |
|---|---|
| **Contextual retrieval** (Anthropic) — prepend 50–100-token LLM-written context to each chunk before embedding + BM25 | Cheapest big win: −35% failures alone, −49% with BM25, −67% with rerank; retrieve top-20 not top-5. Personal items are short, so context is nearly free. https://www.anthropic.com/news/contextual-retrieval |
| **Late chunking** (Jina) — embed full doc, mean-pool per chunk | Same goal without an LLM call; needs 8k-context embedding model; 2–6% nDCG gain mostly on long docs. https://jina.ai/news/late-chunking-in-long-context-embedding-models/ |
| **Parent-child chunks** (Dify) | Match on small child, return parent; fits "one direct answer + source item" since the parent *is* the item. |
| **Header-aware split + forward-merge small fragments** (Open WebUI) | Keeps structure; far fewer vectors on structured docs. |
| **ColPali / late-interaction visual retrieval** | Skips OCR by embedding page images; multi-vector storage doesn't map to pgvector cleanly; overkill vs OCR+caption at personal scale. https://arxiv.org/abs/2407.01449 |
| **Mem0 extraction/update loop** | ADD/UPDATE/DELETE/NOOP for "facts about me," not archive content. |
| **Zep/Graphiti bi-temporal graph** | `valid_at`/`invalid_at` on edges, invalidate-don't-delete, provenance. Relevant for "what did I think about X in March"; costly (Neo4j/FalkorDB). https://github.com/getzep/graphiti |
| **LightRAG** (EMNLP 2025, 39.9k stars) | Graph + vector dual-level; **Postgres as sole backend** supported; incremental; ~1/100th GraphRAG cost. The one graph approach that fits our stack. https://github.com/HKUDS/LightRAG |
| **Microsoft GraphRAG / LazyGraphRAG** | Full GraphRAG indexing $50–200+ per small corpus; community summaries are for "global" questions — wrong shape for "where did I save that". |
| **Query rewriting / multi-query** (cloudflare-rag, AI Search) | 5 rewritten queries × both stores × RRF; helps short, sloppy personal queries. |
| **Embedding-assisted tagging** (Karakeep 0.33) | Feed nearest neighbours' tags into the tagging prompt for a stable vocabulary. |
| **Accessibility tree before OCR** (screenpipe) | For an extension, DOM/Defuddle text beats screenshots. |
| **Defuddle over Readability** | Modern, maintained, Markdown-out; run it in the extension so the server never re-fetches paywalled pages. |

## 4. Trade-offs surfaced (no decisions)

- **Managed AI Search vs own pgvector pipeline:** AI Search gives hybrid+RRF+rerank for free-ish but indexes from R2/website only, opaque chunking, 500k-file cap with keyword on; own pipeline keeps Postgres as single source of truth and lets you version embeddings.
- **Memory extraction vs chunk RAG:** Mem0's numbers show ~5-pt accuracy loss vs full context for 90% token savings; Supermemory queries both layers together. Chunk layer non-negotiable; fact layer additive.
- **Graph or not:** Graphiti/LightRAG add temporal/relational answers; every project shipping them warns about ops cost and 1–2s latency. LightRAG-on-Postgres is the only option that doesn't add a database.
- **Media fetch location:** yt-dlp + ffmpeg + residential IP cannot live in a Worker. Options: hosted transcript API, small off-cloud runner, or client-side (extension/phone) capture.
- **Whisper on Workers AI vs external:** cheap and colocated, but chunk handling and quality complaints; OpenRouter/Deepgram give better diarization.
- **Licensing:** Karakeep, Khoj, Reor, Readeck are AGPL; screenpipe non-commercial. Supermemory, Mem0, Memos, Wallabag, rahilp, cloudflare-rag, Defuddle, Graphiti, LightRAG are MIT/Apache — safe to lift from.

## Sources

- https://github.com/karakeep-app/karakeep · https://docs.karakeep.app/configuration/environment-variables · https://github.com/karakeep-app/karakeep/releases/tag/v0.33.1
- https://github.com/supermemoryai/supermemory · https://supermemory.ai/blog/memory-engine/
- https://github.com/khoj-ai/khoj · https://docs.khoj.dev/features/search/
- https://arxiv.org/html/2504.19413v1 · https://github.com/mem0ai/mem0
- https://github.com/usememos/memos
- https://github.com/linkwarden/linkwarden · https://docs.linkwarden.app/usage/ai-tagging
- https://docs.anythingllm.com/setup/vector-database-configuration/overview
- https://docs.openwebui.com/features/chat-conversations/rag/
- https://github.com/danielmiessler/Fabric/blob/main/docs/YouTube-Processing.md
- https://github.com/hxckya/youtube-transcript-ip-blocked-guide · https://github.com/jdepoix/youtube-transcript-api/issues/593
- https://linklist.io/omnivore-alternative · https://www.readless.app/blog/omnivore-alternatives-2026
- https://codeberg.org/readeck/readeck · https://github.com/wallabag/wallabag · https://github.com/reorproject/reor
- https://github.com/brianpetro/obsidian-smart-connections · https://github.com/logancyang/obsidian-copilot · https://docs.obsidiancopilot.com/vault-search-and-indexing/
- https://github.com/screenpipe/screenpipe
- https://github.com/vedjr02/Second-Brain · https://github.com/rahilp/second-brain-cloudflare · https://github.com/RafalWilinski/cloudflare-rag · https://github.com/smixs/agent-second-brain
- https://developers.cloudflare.com/ai-search/ · https://developers.cloudflare.com/ai-search/configuration/indexing/hybrid-search/ · https://www.infoq.com/news/2026/05/cloudflare-workflows-v2-release/ · https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/ · https://developers.cloudflare.com/workers-ai/guides/tutorials/build-a-workers-ai-whisper-with-chunking
- https://dify.ai/blog/introducing-parent-child-retrieval-for-enhanced-knowledge · https://github.com/WorldBrain/Memex · https://github.com/kepano/defuddle
- https://www.anthropic.com/news/contextual-retrieval · https://jina.ai/news/late-chunking-in-long-context-embedding-models/ · https://arxiv.org/abs/2407.01449 · https://github.com/getzep/graphiti · https://arxiv.org/abs/2501.13956 · https://github.com/HKUDS/LightRAG · https://www.microsoft.com/en-us/research/blog/lazygraphrag-setting-a-new-standard-for-quality-and-cost/
- https://www.paradedb.com/blog/hybrid-search-in-postgresql-the-missing-manual · https://github.com/pavangupta352/pghybrid
