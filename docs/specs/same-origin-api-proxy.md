# Same-origin API proxy

Issue: #65

## Problem Statement

A **User** who signs in on the deployed site appears signed out. The web app (`*.vercel.app`) and the API (`*.workers.dev`) are cross-site, so browsers drop the `SameSite=Lax` **Session** cookie. Sign-in returns success and then `get-session` returns `null`. Brave and Safari also block third-party cookies, so loosening the cookie does not fix it. The same failure would break any Google sign-in added later.

## Solution

The browser only talks to the web origin. The web app forwards every API call to the Worker, so the **Session** cookie is first-party. From the **User**'s side nothing changes except that staying signed in now works on every browser. See ADR-0004.

## User Stories

1. As a **User**, I want to stay signed in after I sign in on the deployed site, so that I do not land back on the sign-in page.
2. As a **User**, I want sign-in to work in Brave and Safari, so that my browser choice does not block me.
3. As a **User**, I want my **Session** to survive a page refresh, so that I am not asked to sign in again.
4. As a **User**, I want to sign out and have the **Session** end, so that a shared computer is safe.
5. As a **User**, I want note and thread pages to load my data after sign-in, so that the app shows my content.
6. As a **User**, I want uploading an audio, image or PDF file to work through the same site, so that capture is not broken by the change.
7. As a **User**, I want replies in a thread to keep streaming in, so that asking a question feels as fast as before.
8. As a **User**, I want opening a saved file (audio, image, PDF) to work, so that my captures stay viewable.
9. As a **User**, I want failed requests to show the same errors as before, so that messages stay understandable.
10. As an operator, I want one configurable origin for the API in each environment, so that local, preview and production are all set by config.
11. As an operator, I want local development to keep working with the web app on port 3000 and the Worker on 8787, so that I can develop without Vercel.
12. As an operator, I want the auth rate limit keyed on the real client, so that one noisy **User** cannot throttle everyone behind the proxy.
13. As an operator, I want to change the client-IP header without a code change, so that I can adapt once I see what Vercel forwards.
14. As an operator, I want authenticated API responses never cached at the edge, so that one **User**'s data is never served to another.
15. As an operator, I want the Worker to keep working when called directly, so that health checks and tests are unaffected.
16. As a developer, I want a documented checklist for verifying the proxy on a preview deployment, so that the unconfirmed Vercel behaviours are checked before cutover.

## Implementation Decisions

- **API prefix on the web origin:** the API is reached at `/api/*` on the web origin. Better Auth keeps its existing `/api/auth/*` paths unchanged. Every other Worker route (`/items`, `/threads`, `/keys`, `/health`) is reached at `/api/<route>`, and the prefix is stripped before it reaches the Worker. The prefix is needed because the web app already owns `/items`, `/threads`, `/settings` and `/status` pages.
- **Rewrite location:** a rewrite in the Next.js config that targets the Worker origin, read from build-time config. The `vercel.ts` rewrite is not used (one config file only; no Vercel-only feature is needed).
- **Web client base URL:** the shared API client and the auth client use the web origin's `/api` prefix for browser calls. Auth uses the web origin as its base and keeps its `/api/auth` path. Local development points the rewrite at the local Worker, so the same code path runs locally.
- **Worker configuration:** the deploy script sets `API_ORIGIN` and `WEB_ORIGIN` both to the web origin. Better Auth's `baseURL` therefore becomes the web origin, and its redirect URIs, cookie `Secure` decision and trusted origin follow from it. The Worker's own `workers.dev` URL stays reachable and unchanged for health checks, but is no longer used by the browser.
- **Client-IP header:** the auth IP header list becomes a Worker var (default `cf-connecting-ip`, current behaviour). The operator sets it after the preview echo check shows which header carries the real client IP.
- **Caching:** responses from the Worker under the proxy carry `Cache-Control: no-store` for authenticated routes, since Vercel honours upstream `Cache-Control` on external rewrites for newer projects.
- **Deployment order:** ship the Worker config and the web rewrite together; the old cross-site URLs stop being used by the browser the moment the new web build is live.
- **Verification checklist on a preview deployment** (unconfirmed in Vercel's docs, see `docs/research/08-vercel-proxy-and-google-sign-in.md`): a multipart upload above 4.5 MB succeeds; a streamed thread reply streams incrementally; `Set-Cookie` arrives first-party and `get-session` returns the **User**; the `Origin` and client-IP headers seen by the Worker; no shared-cache hit across two **Users**.
- No schema change.

## Testing Decisions

- A good test drives external behaviour only: HTTP requests in and responses out, or rendered output, not internal function calls.
- **Single highest seam: the Worker's HTTP surface** through the existing `request` helper and the workerd test pool. Tests run the Worker with `API_ORIGIN` and `WEB_ORIGIN` set to a web origin and assert: sign-up then sign-in issues a `Secure`, `HttpOnly` cookie, `get-session` with that cookie returns the **User**, a request from the web origin is accepted, and a request from another origin is refused.
- **Web seam:** one unit test on the rewrite table, asserting that `/api/auth/*` maps to the Worker's `/api/auth/*`, that `/api/items`, `/api/threads`, `/api/keys` and `/api/health` map to the Worker without the prefix, and that page routes are not rewritten. Plus a test that the client modules derive their URLs from the prefix.
- The IP header var is covered at the Worker seam: with the var set to another header, the recorded session IP comes from that header.
- Prior art: `apps/api/test/auth.test.ts`, `apps/api/test/support/http.ts`, `apps/web/lib/auth-client.test.ts`, `apps/web/lib/safe-next-path.test.ts`.
- Vercel's own proxying (body size, streaming, headers) cannot be tested locally; it is covered by the preview checklist above, run by the operator.

## Out of Scope

- A custom domain or `crossSubDomainCookies`; moving to one supersedes ADR-0004.
- Google sign-in (separate spec).
- Email verification.
- Changes to item, thread or key behaviour beyond their URL prefix.

## Further Notes

- Research: `docs/research/08-vercel-proxy-and-google-sign-in.md`.
- Known risk: if Vercel rejects large multipart bodies on external rewrites, uploads need a different path (for example a direct upload URL). That would be a follow-up spec, found during the preview check.
- Proxied bytes count toward Vercel Fast Data Transfer.
