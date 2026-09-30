# Same-origin proxy: preview checklist

Run before cutover (ADR-0004, issue #65). Vercel's rewrite behaviour for external destinations is unconfirmed in its docs, so each item below is an observation, not an assumption. `<web>` is the preview or production web origin.

## Configure

1. Vercel project env var `WORKER_ORIGIN` = the Worker URL (`https://second-brain-api.divyparekh1810.workers.dev`). Rewrites are built at build time, so redeploy after setting it. Unset, the build points at `http://localhost:8787` and every API call fails.
2. Deploy the Worker with `API_ORIGIN` and `WEB_ORIGIN` both set to `<web>` (`bun run --cwd apps/api deploy` does this for the production web origin; pass different `--var` values for a preview URL).

## Observe

1. **Cookie is first-party.** Sign in at `<web>/sign-in`, then in DevTools, Application, Cookies, `<web>`: a `__Secure-better-auth.session_token` cookie exists. Reload `<web>/home`: still signed in. Repeat in Brave and Safari.
2. **Session via proxy.** `curl -s <web>/api/auth/get-session -b '<cookie>' -H 'origin: <web>'` returns the user.
3. **Large upload.** Upload an audio, image or PDF file over 4.5 MB from the app. It must be accepted. If Vercel answers `413`, uploads need a different path (follow-up spec).
4. **Streaming.** Ask a question in a thread. The reply must appear incrementally, not all at once after a long wait.
5. **Client IP header.** After signing in, `get-session` returns `session.ipAddress`. If it is not your public IP, redeploy the Worker with `--var AUTH_CLIENT_IP_HEADER:x-forwarded-for` (then try `x-real-ip`) until it is. Until then the auth rate limit counts every user as one client.
6. **No shared cache.** Signed in as two users in two browsers, `GET <web>/api/items` returns each user's own items and the response carries `cache-control: no-store`.

When all six pass, mark ADR-0004 Accepted.
