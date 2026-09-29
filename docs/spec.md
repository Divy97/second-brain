# Second Brain — Product & Pipeline Spec

Status: v2 — decided 2026-09-27 after research (see `docs/research/`). Supersedes v1.

## 1. What it is

A personal memory. You dump anything (text, voice, photo, PDF, link, transcript) in under 3 seconds, from any device. Later you ask a question in plain language and get **one direct answer with the source item** — verbatim recall, not an essay.

Test case: you save a video about an "agentic browser". Weeks later you ask "what was that agentic browser I watched?" → the answer names it and links the saved video.

## 2. Non-goals (V1)

- Calendar / email / any auto-sync integrations. Manual capture only.
- Browser extension (designed for, built after V1 — see §11).
- Knowledge graph (door kept open — see §6).
- Local/on-device models.
- "Cheap mode". One pipeline, best quality.
- Proactive resurfacing, dashboards.

## 3. Users, auth, keys

- Multi-user from day one (single user today; open-source / commercial later).
- **BYOK for everything that costs money.** Each user adds keys in settings:
  - OpenRouter — chat, enrichment, STT, embeddings (required)
  - Transcript API (Supadata or similar) — YouTube fallback + Instagram (optional)
  - Reader API (Tavily / Firecrawl / Jina) — bot-blocked article fallback (optional)
- Without an optional key, the corresponding fallback is skipped and the item is saved `partial`.
- Web app (responsive) is the only V1 client.

## 4. Inputs and extraction

Rule: **a capture never fails.** Raw input is stored before any processing starts.

| Type            | Source                                                     | Extraction                                                                                                                     |
| --------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Text            | typed / pasted (thoughts, facts, quotes, meeting notes)    | as-is                                                                                                                          |
| Voice           | browser mic, audio file                                    | OpenRouter STT (Whisper / Qwen3 ASR, auto language). **Raw audio kept.**                                                       |
| Photo           | upload / camera (screenshots, calendar photos, book pages) | vision model: OCR text + scene description                                                                                     |
| PDF             | upload                                                     | text PDF → pure-JS extraction in Worker; scanned → vision OCR per page. Original kept.                                         |
| YouTube         | URL                                                        | §4.2 ladder                                                                                                                    |
| Instagram       | URL                                                        | metadata API (BYOK) → caption, author, hashtags. No key → link + user note, `partial`. Audio is not transcribed: see ADR-0003. |
| Blog / web page | URL                                                        | §4.1 ladder. Cleaned markdown + raw HTML snapshot stored.                                                                      |
| Any URL         | fetch failed                                               | item saved, status `failed`, retryable                                                                                         |

### 4.1 Article ladder (pasted URL)

1. `fetch()` with `Accept: text/markdown` (Cloudflare Markdown for Agents — free win when the site has it on).
2. HTML → **Defuddle** on linkedom → markdown. Covers most public pages.
3. Output thin for an article page → **Browser Run** `/content` (headless Chrome, free tier to start) → Defuddle again. Covers JS-rendered pages.
4. Still blocked (403 / bot wall) → **hosted reader API** on the user's key, if present.
5. Paywall / login wall / no key → `capture_quality = partial`: title, OpenGraph description, user note. No server-side fix exists. Extension completes it later (§11).

### 4.2 YouTube ladder

1. **Metadata always**: official Data API `videos.list` (title, channel, description) on the **operator's** key. Free, 10k units/day, 1 unit per video, reliable. Chapters are _not_ available from this API; they exist only as timestamps people type into the description, so they arrive as description text and are not parsed.
2. **Transcript**: transcript API on the user's optional key, pinned to `mode=native`. 1 credit per video.
3. No transcript, or no key → metadata-only item, `partial`.

Revised 2026-09-30 (see `docs/research/15-youtube-ingestion.md`):

- The former step 2, opportunistic Innertube captions via `youtubei.js`, is **dropped**. YouTube now gates `/get_transcript` behind a BotGuard attestation the library does not implement; solving it needs `eval`, which Workers forbid; and the maintainers state server IPs are blocked with no known solution. Three independent blockers. Revisit only if `LuanRT/YouTube.js#1102` closes _and_ someone demonstrates it working from a Worker.
- AI transcription of uncaptioned videos is **not** used. The transcript API's default `auto` mode bills 2 credits per minute, so one 40-minute uncaptioned video would consume 80 of a free plan's 100 monthly credits in a single save. `mode=native` keeps every video at 1 credit; an uncaptioned video stays `partial`, still searchable by title, channel and description.

No yt-dlp, no ffmpeg, no Container anywhere.

## 5. Pipeline

```
capture → extract → enrich → chunk → index (vector + keyword) → [facts]
ask → rewrite → retrieve (hybrid, RRF) → rerank → answer with citations
```

Runs as a Cloudflare **Workflow** per item, triggered from a **Queue**. Each stage is a durable step with its own retry. Status visible per item: `pending | processing | ready | failed`, plus `capture_quality: full | partial`.

### 5.1 Enrich (one LLM call per item, user's chat model)

- `title`
- `summary` — 2–3 sentences, **always English** regardless of source language (cross-language recall)
- `clean_text` — raw text with STT/OCR errors corrected in context ("Asian tech browser" → "agentic browser"). `raw_text` kept untouched.
- `kind` — `quote | fact | thought | meeting | link | video | article | image | pdf | other`
- `entities` — people, products, books, places (stored as rows, not JSON — graph door)
- `tags` — 5–10, **embedding-assisted**: nearest-neighbour items' tags are fed into the prompt to keep vocabulary stable (Karakeep pattern)
- `language`

### 5.2 Chunk

- ≤ ~500 tokens → one chunk.
- Longer → header-aware split (markdown headings / transcript timestamps), ~400 tokens, small fragments merged forward, ~15% overlap.
- **Parent-child**: chunks are the search unit, the item is the answer unit. Retrieval returns chunks; answers cite items.
- Every chunk is embedded as `"{title} — {summary}\n\n{chunk_text}"` (contextual retrieval).

### 5.3 Index

Per chunk: `embedding` (pgvector) + `embedding_model` + `tsv` (Postgres full-text over chunk + title + entities + tags).

Embedding model is **fixed per platform and versioned**: one multilingual model via OpenRouter for all users. Upgrading = platform-wide re-embed job. Users choose chat/enrich model only.

### 5.4 Facts layer (own words only)

Runs on `kind ∈ {thought, fact, meeting, quote}` and voice notes — things the user said, not other people's content.

- LLM extracts atomic facts ("dentist is Dr. Mehta", "prefers window seat").
- Per fact: retrieve top-10 similar existing facts → LLM picks **ADD / UPDATE / DELETE / NOOP** (Mem0 loop).
- Superseded facts are **invalidated, never deleted** (`valid_from`, `valid_to`), with provenance to the source item.
- Facts are embedded and full-text indexed like chunks; retrieval queries both and fuses.

### 5.5 Ask

1. **Rewrite** (LLM): fix typos, expand ("that browser that browses for you" → "agentic browser"), extract filters — date range ("recently" = 30d, "few days ago" = 14d), `kind`, type. Generate 2–3 query variants.
2. Vector + full-text search over chunks **and** facts, filters applied in SQL, in parallel per variant.
3. **RRF** (k = 60) → top 30.
4. **Rerank** (LLM) → top 5–8.
5. **Answer** — only from retrieved content. Rules:
   - **Verbatim**: quotes, facts, names, numbers returned exactly as stored, never paraphrased.
   - Every answer cites item IDs → UI shows source cards (title, kind, date, link/file).
   - Multiple plausible hits → list candidates with dates, don't guess.
   - Conflicting facts → newest valid wins, older shown with date.
   - Below similarity floor → "I don't have anything saved about that." **Never invent.**

### 5.6 Threads

Chat threads in V1. A thread holds prior questions + answers + cited item IDs; follow-ups ("tell me more about that one") resolve against the thread's cited items first, then run a fresh retrieval with the thread summary as context. Every answer in a thread still cites.

## 6. Data model

```
users              id, email, created_at
user_keys          user_id, provider (openrouter|transcript|reader), key (encrypted)
items              id, user_id, type, kind, status, capture_quality, source_url,
                   file_key, raw_text, clean_text, title, summary, tags[], language,
                   captured_at, source_published_at, error, deleted_at
item_captures      item_id, captured_at              -- same URL twice = 1 item, 2 captures
chunks             id, item_id, idx, text, embedding vector, embedding_model, tsv
entities           id, user_id, name, type           -- graph door: plain rows
item_entities      item_id, entity_id
facts              id, user_id, text, embedding, embedding_model, tsv,
                   source_item_id, valid_from, valid_to
threads            id, user_id, title, created_at
messages           id, thread_id, role, text, cited_item_ids[], created_at
```

Dedupe: normalised URL per user; file hash for uploads.

## 7. Lifecycle

- Edit text / title, soft delete, "forget this fact", "reprocess" (re-run from extract) per item.
- Failed items show the error and a retry button.
- Nightly DB + R2 backup. Non-negotiable.

## 8. Privacy stance

User content goes to third-party models and APIs on the user's own keys. Stated plainly at key setup. No PII scrubbing in V1.

## 9. Architecture

```
apps/web         Next.js 16 — UI only. Vercel Hobby ($0; Pro when commercial).
apps/api         Cloudflare Worker (Hono). All backend in one deploy:
                   REST API (capture, ask, threads, items, settings, keys)
                   Better Auth
                   Queue consumer + Workflows (pipeline)
                   Browser Run binding (JS-rendered articles)
apps/extension   Later. Client of apps/api.
packages/db      Drizzle schema + queries (Neon via Hyperdrive)
packages/ai      OpenRouter calls (STT, vision, enrich, embed, rerank, answer)
```

| Layer    | Choice                                                           | Why                                                                                                                         |
| -------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Compute  | Cloudflare Workers, **free plan to start**                       | No Container, no binary. Upgrade to Paid ($5/mo) only when a limit bites (10 MiB Worker size, Browser Run minutes, CPU ms). |
| Pipeline | Cloudflare Queues + Workflows                                    | durable per-step retries, no Redis, no server                                                                               |
| DB       | Neon Postgres + pgvector via Hyperdrive, Drizzle                 | hybrid search in one DB; Hyperdrive = connection pool for Workers                                                           |
| Files    | Cloudflare R2                                                    | 10 GB free, zero egress                                                                                                     |
| Auth     | Better Auth                                                      | multi-user, TS-native, runs in the Worker                                                                                   |
| Models   | OpenRouter (chat, STT, embeddings)                               | single BYOK key covers the chain                                                                                            |
| Articles | Defuddle → Browser Run → reader API → partial                    | §4.1                                                                                                                        |
| Video    | Data API metadata (operator key) → transcript API, `mode=native` | §4.2                                                                                                                        |

Monthly cost at personal scale: **$0**. Model/API spend on the user's keys.

## 10. Reference implementations (MIT/Apache — safe to read and lift)

- Supermemory — Workers + Hono + Drizzle + Workflows ingestion; same shape as ours.
- `RafalWilinski/cloudflare-rag` — RRF fusion + multi-query on Workers.
- `rahilp/second-brain-cloudflare` — capture classify → dedupe → contradiction → index.
- Mem0 paper — ADD/UPDATE/DELETE/NOOP loop.
- Defuddle — extractor.
- AGPL (Karakeep, Khoj, Readeck): read for patterns, don't copy code.

## 11. Extension (designed now, built after V1)

- Sends `{url, title, text}` from the rendered DOM (Defuddle in the extension). Paywalls, logins, JS — irrelevant, the browser already has it.
- Reads the YouTube transcript panel for videos being watched.
- **Completes `partial` items**: when the user visits a URL that's saved `partial`, the extension upgrades it to `full` automatically.
- Auto-capture ("save everything I read") with enable/disable and filter rules — separate research session.

## 12. Parked

- Calendar / email integrations.
- Graph retrieval (LightRAG on Postgres) — entities/relations already stored as rows.
- Cloudflare AI Search — revisit when pricing is public.
- Cross-encoder reranker instead of LLM rerank — if answer latency or cost becomes a problem.
