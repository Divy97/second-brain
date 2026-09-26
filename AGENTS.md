# Workflow

Every piece of work moves through this loop. Skills live in `.claude/skills/`; invoke them with the Skill tool. They are pinned in `skills-lock.json` and not committed — restore them with `bunx skills experimental_install`.

| When                                                     | Do                                                                                                                                  |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| No task in hand, or a plan that isn't agreed yet         | `grill-with-docs` — interview until the plan is settled, recording ADRs and glossary as decisions land. Use its recommended answer. |
| A conversation has reached agreement                     | `to-spec` — turn it into a written spec. Specs live in `docs/specs/`.                                                               |
| A spec exists                                            | `implement` — build it test-first (`tdd`).                                                                                          |
| Designing a module or its interface                      | `codebase-design` — deep modules: much behaviour behind a small entry point.                                                        |
| Any UI work                                              | `design-taste-frontend` — always, before writing frontend code.                                                                     |
| A fact is needed (API shape, library behaviour, pricing) | `research` — cited, from primary sources. Never from memory.                                                                        |
| Implementation finished                                  | **Verify, then review** (below).                                                                                                    |

## Verify, then review

Finished means proven correct in the running app, not "tests pass".

1. Run the app and drive the feature through the browser (Claude in Chrome / Chrome DevTools). Exercise it the way a user would; repeat until it behaves correctly on every path the spec names. **Done when:** every acceptance criterion in the spec has been observed working in the UI.
2. `code-review` — review the diff against this repo's standards and against the spec. Fix findings before opening the PR.

## Engineering standard

- Best-practice, industry-standard solutions only. Scalable and performant by design.
- Stuck → ask a question, or `research` the primary source, then choose the best solution. A workaround is never the answer.
- Names carry meaning: functions say what they do, variables say what they hold. Read the name, know the thing.
- Functions and files are small and single-purpose.

# Git

- Every change: branch (`<type>/<slug>`) → PR → squash-merge into `master`. `master` is never committed to directly.
- Commit messages follow Conventional Commits; commitlint enforces this on `commit-msg`.
- Commit messages and PR bodies contain no AI attribution lines.

# Code comments

Comments only when extremely important — a non-obvious constraint, a workaround with a reason, a security boundary. No narration of what the code does, no section headers, no marker comments. Precise or absent.

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## Agent skills

### Issue tracker

GitHub Issues on `Divy97/second-brain`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
