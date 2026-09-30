# Marketing and everyday UX

## Problem

The homepage understates the product. Session loading shifts navigation; generic loading blocks obscure the destination. Motion and Google branding need polish.

## Solution

Preserve the wordmark, warm light theme, routes and navigation labels. Build a product-led homepage showing notes, voice recordings, photos, PDFs, links, extracted text, sourced answers and follow-up conversations. Explain the OpenRouter key requirement honestly. Use a real product screenshot and accessible, restrained CSS motion.

## Acceptance criteria

- Homepage communicates all five capture formats, extraction, sourced answers and follow-ups; signup and sign-in links work.
- Desktop and phone layouts have no horizontal overflow; primary CTA appears in the first viewport.
- Refreshing signed-in routes keeps navigation in place while session resolves. Protected content stays gated.
- Session and data skeletons reflect home, questions, note detail, conversation and settings layouts.
- Google sign-in uses the official multicolor G with unchanged auth behavior.
- Buttons, navigation, capture panels and content arrivals have subtle feedback; reduced-motion disables movement.
- Keyboard focus remains visible; mobile navigation works.

## Implementation and testing

Reuse existing components, CSS tokens and Playwright browser seams, with controlled session/API responses for deterministic refresh and loading tests. Run existing checks, desktop/phone browser tests and inspect screenshots. No new dependencies, routes, backend behavior or authentication contracts.

## Verification

The pre-change browser regression reproduced a 386px desktop navigation shift. The updated test checks both initial session resolution and a real refresh, including gated content. Browser coverage includes all five loading destinations, official logo loading, keyboard focus, reduced-motion hover stability, and mobile overflow. Product screenshots use illustrative fixture content in the running app. Live OAuth and AI providers are not exercised by these frontend checks.
