# Second Brain

Capture anything, ask for it later, get the thing you saved back verbatim with its source. Product spec: `docs/spec.md`. Research behind the decisions: `docs/research/`.

## Layout

```
apps/web         Next.js UI (Vercel)
apps/api         Hono on Cloudflare Workers: HTTP API, queue consumer, workflows
packages/db      Drizzle schema, migrations, database access (Neon Postgres + pgvector via Hyperdrive)
packages/ai      OpenRouter client (chat with structured output, embeddings) on a caller-supplied key
packages/ui      shadcn/ui components
```

Each package is a deep module: import only from the root of its `src/` (or the entry points its `package.json` exports). `bun run lint:boundaries` enforces this.

## Local development

Prerequisites: Bun 1.3, Docker.

```bash
bun install
cp .env.example .env                        # set POSTGRES_PASSWORD; the URLs derive from it
cp apps/web/.env.example apps/web/.env      # WORKER_ORIGIN (the API the /api proxy forwards to)
cp apps/api/.dev.vars.example apps/api/.dev.vars   # Worker secrets for local dev
docker compose up -d --wait                 # Postgres 17 + pgvector on :5432
bun run db:migrate                          # apply migrations to the local database
bun run dev                                 # web on :3000, api on :8787
```

Database credentials live only in the root `.env` (gitignored). Docker Compose reads it directly; the db and api scripts load it through `bun --env-file`.

Open http://localhost:3000/status to confirm the API and database are reachable.

Migrations live in `packages/db/drizzle`. After changing `packages/db/src/schema.ts`:

```bash
cd packages/db && bunx drizzle-kit generate --name=<change>
```

Migrations are applied programmatically (`@workspace/db/migrate`); `drizzle-kit push` is never used because it drops HNSW operator classes.

## Checks

```bash
bun run check    # lint, typecheck, boundaries, tests across every workspace
```

Tests run against a real Postgres: each suite provisions its own database on the local server. `apps/api` tests run inside the Workers runtime through `@cloudflare/vitest-plugin` (pinned to Vitest 4 until the plugin supports Vitest 5).

The pre-commit hook runs Prettier, ESLint and typecheck; commit messages follow Conventional Commits. Every change goes through a branch and a squash-merged PR; see `AGENTS.md`.
