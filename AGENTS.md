# Git workflow — first rule

- **Never commit directly to `master`.** Every change: branch → PR → rebase-and-squash merge into `master`.
- Branch names: `<type>/<short-slug>` (e.g. `feat/text-capture`, `docs/spec-v2`).
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) — enforced by husky + commitlint on `commit-msg`. Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`, `build`, `perf`, `style`.
- Squash-merge only; the squashed commit title must itself be a conventional commit.
- No AI attribution lines anywhere — no "Generated with Claude Code" in PRs, no "Co-Authored-By: Claude" trailers in commits, nothing in docs or code.

# Code comments

Comments only when extremely important — a non-obvious constraint, a workaround with a reason, a security boundary. No narration of what the code does, no section headers, no marker-style comments (`ponytail:`, `TODO` without an issue, etc.). Precise or absent.

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
