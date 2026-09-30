# ADR-0004: The API is served same-origin through a Vercel rewrite

Date: 2026-09-30
Status: Proposed — becomes Accepted once the preview-deployment checks in the proxy spec pass

## Context

The web app runs on `*.vercel.app` and the API on `*.workers.dev`. Both are public suffixes, so every browser request between them is cross-site. Better Auth's session cookie is `SameSite=Lax`, which browsers do not attach to cross-site `fetch` calls. Sign-in succeeds and `get-session` then returns `null`. Brave and Safari also block third-party cookies, so `SameSite=None` would not fix it for them. The same failure would follow a Google sign-in, whose callback lands on the API origin.

Alternatives considered: a custom domain with `app.` and `api.` subdomains and `crossSubDomainCookies` (cleanest long term, needs a domain we do not own yet), and `SameSite=None; Secure` cookies (breaks under third-party cookie blocking).

## Decision

The browser only talks to the web origin. A `next.config.ts` rewrite forwards the API to the Worker, and `API_ORIGIN` / Better Auth `baseURL` become the web origin. Every credentialed call goes through the rewrite, not only `/api/auth/*`, because the session cookie must accompany file uploads and thread requests too.

## Consequences

- No CORS and no third-party cookies in the browser.
- Uploads (`/items/audio`, `/image`, `/pdf`) and streamed thread replies now cross the Vercel proxy. Its body-size, streaming and header behaviour for external rewrites is unconfirmed in Vercel's docs (`docs/research/08-vercel-proxy-and-google-sign-in.md`) and must be verified on a preview deployment before cutover.
- `cf-connecting-ip` behind the rewrite identifies Vercel, not the user. The per-IP auth rate limit must be re-pointed at the real client IP header, or it throttles all users together.
- Proxied bytes count toward Vercel Fast Data Transfer.
- Moving to a custom domain later supersedes this ADR.
