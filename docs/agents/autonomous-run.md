# Autonomous run

The prompt below drives an unattended Claude Code session through the open tickets of the current slice. Launch it from the repo root with permissions bypassed, Docker running, and the machine kept awake:

```bash
docker compose up -d --wait
caffeinate -dims claude --dangerously-skip-permissions
```

Then paste the prompt as the first message (it starts with `/implement` so the implement skill is invoked explicitly).

Before starting, `.env` must contain `OPENROUTER_API_KEY` with a real key; the browser verification of tickets #8 onward calls models on it. Tests never do.

## Prompt

```text
/implement Work through the frontier of GitHub issues labelled ready-for-agent under parent #5, in dependency order (#6, #7, #8, #9, #10), one ticket at a time, without stopping for input. Run until every ticket is merged or you are genuinely blocked on something only a human can do.

For EACH ticket, in this order, nothing skipped:

1. Read the ticket with `gh issue view <n> --comments`, its parent #5, docs/spec.md, and AGENTS.md. Every acceptance criterion is a contract.
2. Branch from an up-to-date master: `git switch master && git pull && git switch -c feat/<slug>`.
3. Research before code whenever an API shape, library behaviour or version is needed (Better Auth, Hono, Cloudflare Workflows/Queues, Drizzle, OpenRouter, Next 16 from node_modules/next/dist/docs). Never from memory; save findings under docs/research/ with sources.
4. Design each new module as a deep module (codebase-design skill): small interface at the root of src/, implementation in subfolders. The boundary rules in .dependency-cruiser.cjs are law.
5. Build test-first at the seams the spec names: the API's HTTP boundary through the Workers runtime against the real local Postgres with OpenRouter stubbed; `processItem` called directly; RRF as a pure function. One test, one implementation, repeat. Run typecheck and the single test file often; `bun run check` before every commit.
6. UI work goes through the design-taste-frontend skill first, then shadcn/Tailwind v4/Geist in apps/web. Both themes. Phone width.
7. Verify in the browser with agent-browser: start `bun run dev`, drive every acceptance criterion the way a user would, screenshot each state (light and dark), and keep going until every criterion is observed working. Use the OpenRouter key from .env for the real model path. Stop the dev servers afterwards.
8. Run the code-review skill against master with the ticket as spec. Fix every hard finding and every judgement call you agree with; write the ones you reject, with reasons, into the PR body.
9. Commit through the hooks with Conventional Commits, push, open the PR with `gh pr create` (body: summary, decisions, deviations, verification incl. what was screenshotted; `Closes #<n>`). Wait for the `check` workflow with `gh pr checks <n> --watch`. If it fails, fix and push until it passes. Then `gh pr merge <n> --squash --delete-branch`, pull master, and move to the next ticket.

Rules that override everything else:
- Never commit or push to master directly. Never force-push master. Never rewrite history on a pushed branch except your own feature branch before the PR exists.
- No AI attribution lines anywhere. Comments only when extremely important.
- No secrets in tracked files; credentials come from .env / .dev.vars only. If GitGuardian flags something, treat it as a real finding and fix it.
- No shortcuts or workarounds. If a tool fights you, research the correct usage, do not paper over it. If stuck for more than an hour on one problem, write the exact blocker into the PR (or the ticket if no PR yet), swap the ticket's ready-for-agent label for ready-for-human, and continue with what is not blocked.
- Decisions the spec does not settle: choose the option most consistent with docs/spec.md and AGENTS.md, and record it under "Decisions made without you" in the PR body. Do not stop to ask.
- Never deploy, never create cloud resources, never run wrangler login or touch Neon/Vercel. Local only.
- Never delete data outside the Docker Postgres and never modify files outside this repository.

When all tickets are merged (or the remainder are blocked), finish with a summary comment on #5 listing: merged PRs, screenshots taken per ticket, decisions made without a human, and every open blocker.
```
