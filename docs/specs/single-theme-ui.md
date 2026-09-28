# Single theme UI

## Problem

The existing interface has no clear identity. The unfinished graphite and lime redesign adds a second theme and a dark base the owner does not want.

## Direction

Replace the interface with one warm, light design. Cream paper, plum text, coral, lilac, butter and mint. Use Fraunces for display text and Geist for body text. No theme switch, dark mode, blue accent or sidebar highlight.

## Scope

- Public marketing page at `/`, with a clear sign-up action and an honest note-to-answer illustration.
- Signed-in notes at `/home`; preserve deep links and auth redirects.
- New presentation for capture, notes, note detail, ask, conversations, auth, settings and status.
- Keep existing API, database and form behavior.
- Keep Phosphor icons until Iconly grants redistribution permission.
- Respect reduced motion and phone widths.

## Acceptance

1. A signed-out visitor sees the landing page at `/` and can reach sign-up.
2. A signed-in visitor reaches `/home`; a safe deep link still returns to its destination after sign-in.
3. Capture, browse, edit, delete, ask, source navigation and key management still work.
4. Every screen uses the single palette and works at phone and desktop widths.
5. `bun run check` and the production web build pass; browser checks cover landing, auth, notes and ask.
