# Marketing UX implementation facts

Verified 2026-10-01 against primary sources and the installed Next.js documentation.

## Google sign-in

- Google permits custom sign-in buttons following its branding rules. Use the current gradient multicolor G, preserve its proportions, and pair it with an explicit sign-in action. Do not redraw or recolor the logo. [Google branding guidelines](https://developers.google.com/identity/branding-guidelines)
- Saved the official standalone logo unchanged to `apps/web/public/google-g.png` (200 × 204). Render with matching proportions and a light background. [Official asset](https://developers.google.com/static/identity/images/g-logo.png)
- The current downloadable SVG button contains a `foreignObject` CSS conic gradient. The standalone PNG avoids depending on that SVG rendering behavior. [Official asset bundle](https://developers.google.com/static/identity/images/signin-assets.zip)

## Installed Next.js guidance

- Pages/layouts default to Server Components. Keep static marketing content server-rendered; isolate hooks, handlers, and browser APIs in small Client Components. Serializable props can cross the boundary. [Installed guide](../../apps/web/node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md)
- Assets in the app's `public` directory are referenced from `/`. Explicit image dimensions reserve the correct ratio and prevent loading shifts. [Installed image guide](../../apps/web/node_modules/next/dist/docs/01-app/01-getting-started/12-images.md)
- `priority` is deprecated since Next.js 16. Prefer `loading="eager"` or `fetchPriority="high"` where appropriate; use `preload` deliberately. Known SVG sources bypass optimization automatically. [Installed Image API](../../apps/web/node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md)

## Implementation inference

Keep pending navigation in the same layout as resolved navigation, reserving the account-control dimensions. CSS motion can enhance static markup without expanding the Client Component boundary; honor reduced-motion preferences.
