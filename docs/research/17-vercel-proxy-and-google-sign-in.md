# Vercel rewrite proxy to a Cloudflare Worker, plus Google sign-in with Better Auth 1.7.6

Research date: 2026-09-30. Sources: vercel.com/docs (pages cite their `last_updated`), the Next.js 16.3.3 docs bundled at `apps/web/node_modules/next/dist/docs/` and its compiled server source in `apps/web/node_modules/next/dist/`, the installed `better-auth@1.7.6` and `@better-auth/core@1.7.6` source under `node_modules/.bun/` (paths abbreviated below as `better-auth/dist/…` and `core/dist/…`), better-auth docs MDX on GitHub (`main`), developers.google.com, support.google.com and developers.cloudflare.com. Anything I could not confirm from a primary source is marked **unconfirmed**. Pages fetched through the WebFetch tool were summarised by a small model; every quoted limit was cross-checked against a second page or the source where noted.

Context: `apps/web` (Next.js 16.3.3, Vercel, `https://second-brain-sigma-green-70.vercel.app`) calls `apps/api` (Hono on a Cloudflare Worker, `https://second-brain-api.divyparekh1810.workers.dev`). Cookies are `SameSite=Lax` and the origins are cross-site, so the browser drops them (see [07](./07-better-auth-hono-workers.md) §TL;DR 7). Decision already made: proxy the API through a Vercel rewrite so the browser only talks to the web origin. Today `apps/api/src/lib/auth.ts` sets `baseURL: env.API_ORIGIN`, `trustedOrigins: [env.WEB_ORIGIN]` and `advanced.ipAddress.ipAddressHeaders: ["cf-connecting-ip"]`. The Worker mounts Better Auth at `/api/auth/*` and everything else at the root (`/items`, `/threads`, `/keys`). `apps/web` has no `app/api` routes, no `proxy.ts` and no `middleware.ts`.

## TL;DR / decisions that matter

1. **Timeout is fine for streaming threads.** A proxied request (external rewrite) may wait **120 s** for the first byte, on every plan. After that it can run longer as long as data arrives at least once every 120 s ([limits](https://vercel.com/docs/limits#proxied-request-timeout), [changelog, 2025-05-08](https://vercel.com/changelog/cdn-origin-timeout-increased-to-two-minutes)). Failure mode is `ROUTER_EXTERNAL_TARGET_ERROR`.
2. **The 4.5 MB body limit is documented only for Vercel Functions.** Vercel's own pages do not say whether an external rewrite is subject to it ([limits for Functions](https://vercel.com/docs/functions/limitations#request-body-size), [KB](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions)). Vercel's CDN doc places rewrites in the routing layer, before caching and compute ([How Vercel CDN works](https://vercel.com/docs/how-vercel-cdn-works#routing-layer)), so an external destination plausibly never touches a Function. That is an inference, not a statement. **Decision: treat audio/image/pdf upload through the rewrite as unconfirmed and test a >4.5 MB multipart upload on a preview deployment before the cutover.**
3. **Do not add `proxy.ts` matching `/api/*`.** Next buffers the request body in memory when `proxy` runs, capped at 10 MB by default (`experimental.proxyClientMaxBodySize`). Plain rewrites do not involve `proxy` ([proxyClientMaxBodySize](file:apps/web/node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/proxyClientMaxBodySize.md)).
4. **Cache poisoning risk.** Projects created on or after 2026-04-06 make the CDN honour upstream `Cache-Control`, `CDN-Cache-Control` and `Vercel-CDN-Cache-Control` on external rewrites by default ([Rewrites on Vercel](https://vercel.com/docs/routing/rewrites#caching-rewrites-to-external-origins)). Our authenticated responses must carry `Cache-Control: private, no-store`, or the rewrite must set `x-vercel-enable-rewrite-caching: 0`. We do not yet know the project creation date.
5. **`cf-connecting-ip` stops identifying the end user.** Cloudflare defines it as the client connecting to Cloudflare ([CF headers](https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-connecting-ip)). Behind the rewrite, the client is Vercel's egress, so Better Auth's IP (rate limiting, session `ipAddress`) would collapse onto a handful of Vercel IPs. What Vercel forwards to the destination (`Host`, `X-Forwarded-*`) is **unconfirmed** in its docs. Verify with an echo request before choosing a replacement header.
6. **One config file.** Vercel: "Use only one configuration file: `vercel.ts` or `vercel.json`" ([vercel.ts](https://vercel.com/docs/project-configuration/vercel-ts)). For a Next.js app Vercel says external-origin rewrites "work universally with all frameworks" but to prefer the framework's own routing for same-app rewrites ([Rewrites on Vercel](https://vercel.com/docs/routing/rewrites#framework-considerations)). **Decision: put the rewrite in `next.config.ts`.** It is the single place Next already reads, and there is no Vercel-only feature we need.
7. **Better Auth `baseURL` must become the web origin, and the Worker must keep serving `/api/auth/*`.** The redirect URI is `${baseURL}/callback/google`, and `baseURL` without a path gets `/api/auth` appended, so Google sees `https://<web-origin>/api/auth/callback/google`. The rewrite must preserve `/api/auth/*` on the way to the Worker.
8. **Linking a Google login to an existing `emailVerified=false` password user will fail with defaults.** `accountLinking.requireLocalEmailVerified` defaults to `true` (source below), and it blocks linking even when Google is a trusted provider. The OAuth callback redirects to the error URL with `error=account_not_linked`. The option is `@deprecated` and "will become unconditional" in the next minor. **This needs a product decision before we ship (see Open questions).**
9. **Sign-in flow.** `authClient.signIn.social({ provider: "google", callbackURL, errorCallbackURL, newUserCallbackURL })` POSTs `/sign-in/social`, receives `{ url, redirect: true }`, and a client plugin does `window.location.href = url`. The state cookie is set on that XHR response, which only works once the call goes through the web origin. Once proxied, `createAuthClient()` needs no `baseURL`: the client falls back to `window.location.origin + /api/auth`.
10. **Google Cloud setup is small.** Web application client, redirect URIs `http://localhost:3000/api/auth/callback/google` and `https://second-brain-sigma-green-70.vercel.app/api/auth/callback/google`, consent screen "External" and published ("In production") so basic-scope sign-in is not capped at 100 test users.

---

## 1. Vercel rewrites to an external origin

### 1.1 Body size

| Claim                                                                                                                                             | Source                                                                                                                                                                | Status                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| "The maximum payload size for the request body or the response body of a Vercel Function is **4.5 MB**", error `413 FUNCTION_PAYLOAD_TOO_LARGE`   | [Functions limits → Request body size](https://vercel.com/docs/functions/limitations#request-body-size)                                                               | Confirmed, scoped to Functions              |
| The bypass KB article frames the limit around "a Vercel Function" and never mentions rewrites; streaming function responses are not subject to it | [KB](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions)                                                                           | Confirmed, silent on rewrites               |
| Rewrites are evaluated in the routing layer, before cache and compute; a matching external rewrite forwards to the destination                    | [How Vercel CDN works](https://vercel.com/docs/how-vercel-cdn-works#routing-layer), [Rewrites](https://vercel.com/docs/routing/rewrites#rewrites-to-external-origins) | Confirmed                                   |
| External rewrites are exempt from the 4.5 MB limit                                                                                                | none                                                                                                                                                                  | **Unconfirmed**                             |
| General-limits table (Hobby, Pro, Enterprise) lists no request-body limit for proxied requests; only "Proxied Request Timeout"                    | [Limits → General limits](https://vercel.com/docs/limits#general-limits)                                                                                              | Confirmed absence, not a guarantee          |
| Next.js buffers and caps request bodies at 10 MB only when `proxy` runs                                                                           | [proxyClientMaxBodySize](file:apps/web/node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/proxyClientMaxBodySize.md)                     | Confirmed, not applicable to plain rewrites |

The Worker itself has its own request-body limit, which is a separate question (Cloudflare plan based; see [04](./04-workers-vitest-pool-hyperdrive-wrangler.md) and [13](./13-multimodal-capture-apis.md) for upload sizing).

### 1.2 Duration and timeouts

- Max proxied-request timeout: **120 s**, all plans. "If the external server does not reply until the maximum timeout is reached, an error with the message `ROUTER_EXTERNAL_TARGET_ERROR` will be returned." ([limits](https://vercel.com/docs/limits#proxied-request-timeout))
- Semantics: the CDN waits up to 120 s for the backend to **start sending**; "After the initial byte is received, your backend can take longer than two minutes to complete the request, as long as it continues sending data at least once every 120 seconds." ([changelog](https://vercel.com/changelog/cdn-origin-timeout-increased-to-two-minutes)). The post describes LLM generation as a target use case.
- This 120 s figure is independent of the Functions `maxDuration` (300 s default, 800 s max on Pro) ([Functions limits](https://vercel.com/docs/functions/limitations#max-duration)), which applies to Vercel Functions, not to an external destination.
- Self-hosted Next.js would use its own proxy with a 30 s default (`proxyTimeout: … || 30000` in `apps/web/node_modules/next/dist/server/lib/router-utils/proxy-request.js`). That code path is not what Vercel runs for external rewrites; I found no Vercel doc stating how `next.config` rewrites are executed on the platform, so treat the 120 s figure as the governing one (**inferred**).

Implication: a thread message that streams tokens at least every 120 s is fine. A silent 2-minute gap (for example a long tool call with no bytes) is not. Emit a keep-alive from the Worker if that can happen.

### 1.3 Streaming (SSE, chunked)

No Vercel page I found states that external rewrites stream responses through unbuffered. Indirect evidence only: the changelog above describes backends that keep "sending data" after the first byte. **Unconfirmed.** Test on a preview deployment with a real SSE route (`text/event-stream`, `Cache-Control: no-store`, periodic flush) and check time-to-first-byte in the browser.

### 1.4 Headers and cookies

| Topic                                           | What the primary source says                                                                                                                                                                                                                                                                                             | Status                                                                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `Set-Cookie` from destination to browser        | Not documented for external rewrites                                                                                                                                                                                                                                                                                     | **Unconfirmed**. Test that `Set-Cookie` with `Path=/`, no `Domain`, `Secure; HttpOnly; SameSite=Lax` arrives on the web origin |
| `Origin` / `Cookie` from browser to destination | Not documented                                                                                                                                                                                                                                                                                                           | **Unconfirmed**. Better Auth needs them (see §2.3)                                                                             |
| `Host` seen by destination                      | Not documented for Vercel. For self-hosted Next the proxy uses `changeOrigin: true` (destination host) and sets `x-forwarded-host` to the incoming `Host` (`proxy-request.js`)                                                                                                                                           | **Unconfirmed on Vercel**                                                                                                      |
| `X-Forwarded-For`                               | Vercel: "The public IP address of the client that made the request"; Vercel "overwrite[s] the `X-Forwarded-For` header and do[es] not forward external IPs" (anti-spoofing). `x-real-ip` and `x-vercel-forwarded-for` are identical ([Request headers](https://vercel.com/docs/headers/request-headers#x-forwarded-for)) | Confirmed for requests **into** Vercel. Whether these reach the external destination is **unconfirmed**                        |
| `x-forwarded-host` / `x-forwarded-proto`        | Identical to `host`, and `https` in production ([Request headers](https://vercel.com/docs/headers/request-headers#x-forwarded-host))                                                                                                                                                                                     | Same caveat                                                                                                                    |
| Field reports                                   | Users report that Next rewrites overwrite `x-forwarded-host` with the Vercel project domain ([vercel/next.js#70019](https://github.com/vercel/next.js/issues/70019), no maintainer answer, closed "invalid link"; [#57397](https://github.com/vercel/next.js/issues/57397), locked bug, self-hosted reverse-proxy case)  | Field reports, not primary docs                                                                                                |

**`cf-connecting-ip`.** Cloudflare: "provides the client IP address connecting to Cloudflare to the origin web server" ([CF headers](https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-connecting-ip)). When Vercel's CDN calls `*.workers.dev`, the connecting client is Vercel, so the Worker's `cf-connecting-ip` is a Vercel egress address. Our current `ipAddressHeaders: ["cf-connecting-ip"]` would therefore rate-limit all users together. Fix only after the echo test shows which header carries the client IP, and only trust a header the client cannot spoof (Vercel says it overwrites `X-Forwarded-For`). Also consider whether the Worker should reject requests that do not arrive via Vercel, since `workers.dev` stays publicly reachable and is then a second, unproxied door. That is a scope decision, not part of this research.

### 1.5 Bandwidth and pricing

- **Fast Data Transfer** "is calculated based on the full size of each HTTP request and response transmitted to or from Vercel's CDN. This includes the body, all headers, the full URL and any compression. Incoming data transfer corresponds to the request, and outgoing corresponds to the response." ([CDN pricing and usage](https://vercel.com/docs/manage-cdn-usage#calculating-fast-data-transfer)). So uploaded files count as incoming FDT, and streamed responses as outgoing.
- **CDN Requests**: every request the CDN processes counts, static or dynamic. Hobby includes first 1,000,000; Pro uses Flat Rate CDN or per-unit regional pricing ([same page](https://vercel.com/docs/manage-cdn-usage#cdn-requests)). Hobby includes the first 100 GB of FDT.
- **Fast Origin Transfer** is described for Functions, Middleware, Blob and ISR data cache. Whether an external rewrite incurs it is **unconfirmed**; the page does not list rewrites.
- We do not know the plan (Hobby vs Pro) or whether Flat Rate CDN is on.
- External rewrites appear under Observability → External Rewrites (request counts, hostnames) and can be exported through logs drains ([Rewrites](https://vercel.com/docs/routing/rewrites#draining-rewrites-to-external-origins)).

### 1.6 `next.config.ts` vs `vercel.ts` / `vercel.json`

- `vercel.json` is static. `vercel.ts` "executes at build time" and uses the same property names, with `routes.rewrite(...)` helpers ([vercel.ts](https://vercel.com/docs/project-configuration/vercel-ts)). **Only one of the two may exist.**
- `vercel.json`/`vercel.ts` rewrites count as Routes, limit 2048 per deployment; Next creates Routes automatically from its own rewrites ([Limits → Routes](https://vercel.com/docs/limits#routes-created-per-deployment)).
- Next's rewrite semantics (bundled docs, `rewrites.md`): `beforeFiles` / `afterFiles` / `fallback` ordering, `has`/`missing` matching, `basePath: false` for external destinations, trailing-slash handling ("If you're using `trailingSlash: true`, you also need to insert a trailing slash in the `source`"), and the order is headers, redirects, `proxy`, `beforeFiles`, filesystem, `afterFiles`, dynamic routes, `fallback`.
- Caching controls for external rewrites live in response headers. You can set `x-vercel-enable-rewrite-caching: 0` via `vercel.json` `headers` per the Vercel doc, and Next's `headers()` in `next.config.ts` is the equivalent ([headers](file:apps/web/node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/headers.md)). That the Next `headers()` output is honoured as a platform header for this purpose is **unconfirmed**; prefer setting `Cache-Control: no-store` in the Worker, which needs no platform feature.
- A rewrite source of `/api/:path*` will not collide with anything in `apps/web` (no `app/api` routes today). The Worker expects `/api/auth/*` unchanged but `/items`, `/threads` and `/keys` without a prefix, so the web side needs two mappings (`/api/auth/:path*` to `/api/auth/:path*`, and a second prefix for the rest). Choice of the second prefix is a design decision outside this research.

---

## 2. Better Auth 1.7.6 and Google

### 2.1 Config

From `core/dist/social-providers/google.{mjs,d.mts}`:

```ts
betterAuth({
  baseURL: env.WEB_ORIGIN, // see §2.3
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
  },
})
```

Docs show exactly this, and warn: "You must configure the `baseURL` to avoid `redirect_uri_mismatch` errors" ([google.mdx](https://github.com/better-auth/better-auth/blob/main/docs/content/docs/authentication/google.mdx)).

Options present in the installed source:

| Option                                                                                                  | Effect in 1.7.6 source                                                                                                                             |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clientId` (`string \| string[]`), `clientSecret`                                                       | Required. Missing either throws `CLIENT_ID_AND_SECRET_REQUIRED` when building the authorization URL                                                |
| Default scopes                                                                                          | `email`, `profile`, `openid`; `disableDefaultScope` empties them; `scope` adds more                                                                |
| `accessType: "offline"`, `prompt`                                                                       | Needed for a refresh token. Docs: `accessType: "offline"` plus `prompt: "select_account consent"`. We do not need a refresh token for sign-in only |
| `hd`                                                                                                    | Restrict to a Workspace domain; enforced against the id-token `hd` claim                                                                           |
| `includeGrantedScopes`                                                                                  | Default sends `include_granted_scopes=true`                                                                                                        |
| `mapProfileToUser`, `getUserInfo`, `disableSignUp`, `disableImplicitSignUp`, `overrideUserInfoOnSignIn` | Inherited `ProviderOptions`; `disableImplicitSignUp` needs `requestSignUp: true` on the client call                                                |
| Uses PKCE                                                                                               | `codeVerifier` is mandatory for Google                                                                                                             |

User info comes from the decoded id token (`email`, `name`, `picture`, `email_verified`), account id is the `sub` claim.

### 2.2 Endpoints and redirect URI

- `POST {baseURL}/sign-in/social` (`better-auth/dist/api/routes/sign-in.mjs`). Body: `provider`, `callbackURL`, `errorCallbackURL`, `newUserCallbackURL`, `disableRedirect`, `idToken`, `scopes`, `requestSignUp`, `loginHint`, `additionalData`. Returns `{ url, redirect }`, and sets `Location` unless `disableRedirect`.
- `GET|POST {baseURL}/callback/google` (`routes/callback.mjs`). POST (used by some providers) just re-issues a redirect to the GET with the same params.
- Redirect URI sent to Google and used again at token exchange: `` `${c.context.baseURL}${getOAuthCallbackPath(provider)}` `` with default path `/callback/${provider.id}` (`oauth2/utils.mjs`).
- `baseURL` derivation (`better-auth/dist/utils/url.mjs`): a configured string is used as-is if it already has a path, otherwise `basePath` (default `/api/auth`) is appended. Without config, it falls back to env (`BETTER_AUTH_URL`, …) and then the request origin. `x-forwarded-host`/`x-forwarded-proto` are used **only** with `advanced.trustedProxyHeaders: true`. Do not enable that; set `baseURL` explicitly.
- Resulting redirect URIs: `http://localhost:3000/api/auth/callback/google` and `https://second-brain-sigma-green-70.vercel.app/api/auth/callback/google`. Set `baseURL` per environment (for local dev, `http://localhost:3000` if the dev server also proxies, otherwise the Worker origin).

### 2.3 Behaviour with `baseURL` = web origin, requests arriving at `/api/auth/*` through the proxy

- **Path routing.** Better Auth strips the path of `baseURL` from `req.url` before matching (`api/index.mjs` uses `new URL(ctx.baseURL).pathname` and `normalizePathname`). The Hono route `/api/auth/*` on the Worker then matches as long as the rewrite leaves `/api/auth/...` untouched.
- **`trustedOrigins`.** The origin of `baseURL` is added automatically, then `options.trustedOrigins` and `BETTER_AUTH_TRUSTED_ORIGINS` are appended (`context/helpers.mjs` `getTrustedOrigins`). With `baseURL = WEB_ORIGIN`, the existing `trustedOrigins: [env.WEB_ORIGIN]` becomes redundant for the proxied path. Keep the Worker origin out of it.
- **Origin check** (`api/middlewares/origin-check.mjs`). Skipped for GET/HEAD/OPTIONS, so the Google callback (GET) is not origin-checked. For POSTs it validates `Origin` (falling back to `Referer`) against trusted origins, but only when the request has a `Cookie` header, or via Fetch Metadata when it does not. If a cookie is present and both `Origin` and `Referer` are missing or `"null"`, it throws `MISSING_OR_NULL_ORIGIN` (403). So **Origin passthrough through the rewrite matters** (unconfirmed in §1.4).
- **`callbackURL`, `errorCallbackURL`, `newUserCallbackURL`** are each validated against trusted origins on the sign-in POST; relative paths (`/home`) are allowed if they pass `isSafeRelativeURL` (single leading `/`, no `//`, no backslash, no encoded separators) (`auth/trusted-origins.mjs`). After Google returns:
  - success for an existing user: redirect to `callbackURL`;
  - success for a newly registered user: `newUserCallbackURL || callbackURL`;
  - any OAuth error: redirect to `errorCallbackURL` (stored in state) with `?error=<code>[&error_description=…]`. If none was given, it goes to `onAPIError.errorURL` or `` `${baseURL}/error` ``, which is Better Auth's built-in error page at `/api/auth/error` on the web origin.
  - `callbackURL` is required at callback time (`NO_CALLBACK_URL` otherwise). At sign-in it defaults to `options.baseURL` (the web origin).
  - Always pass explicit `errorCallbackURL` (our sign-in page), otherwise users land on the library's page.
- **State and cookies.** Default `storeStateStrategy` is database: a random `state` is written to the `verifications` table (10 min) and a signed `state` cookie is set (`maxAge` 300 s). The callback requires both to match or it redirects with `state_mismatch` (`state.mjs`). Cookie attributes come from the normal auth cookie getter: `sameSite: "lax"`, `Secure` and the `__Secure-` prefix when the base URL is https (`cookies/index.mjs`). Why this works: the cookie is set by the `POST /sign-in/social` XHR on the **web** origin, and Google's return is a top-level GET navigation to the same origin, which Lax cookies allow. With the Worker origin it fails for the reasons that motivated the proxy. The source also has a `storeStateStrategy === "cookie"` branch that stores encrypted state in a cookie instead of the database; not needed here.
- **Session cookie** set on the callback redirect response must survive the rewrite (`Set-Cookie` passthrough, unconfirmed in §1.4).

### 2.4 Account linking

All from `better-auth/dist/oauth2/link-account.mjs` (`handleOAuthUserInfo`) and `core/dist/types/init-options.d.mts`.

1. On callback, Better Auth first looks up an account by `(providerId, accountId)`. If found, it signs that user in.
2. Otherwise it looks up a user by **lower-cased email**. No match means sign-up (unless `disableSignUp`).
3. With an email match and no linked account, linking is **refused** (`account not linked`, surfaced as `error=account_not_linked` on the error URL) when any of these holds:
   - `!isTrustedProvider && !googleEmailVerified`;
   - `requireLocalEmailVerified && !localUser.emailVerified` (**default `true`**);
   - `accountLinking.enabled === false`;
   - `accountLinking.disableImplicitLinking === true`.
4. `trustedProviders` defaults to `[]` (nothing trusted). Google returns `email_verified`, so Google passes the provider check by itself; adding `"google"` to `trustedProviders` only matters when Google says the email is unverified.
5. **Our existing users have `emailVerified=false`, so step 3's second condition blocks implicit linking, even with `trustedProviders: ["google"]`.** The option's doc comment: defaults to `true` so that "an attacker who pre-registers an unverified account at a victim's email cannot have the victim's OAuth identity linked into the attacker-owned row"; `@deprecated`, "the gate will become unconditional" in the next minor. Setting it to `false` is possible today but is a known takeover trade-off and will stop working.
6. When linking succeeds and Google says the email is verified, Better Auth sets `user.emailVerified = true` on the local row.
7. `allowDifferentEmails`, `allowUnlinkingAll` and explicit `linkSocial()` for signed-in users also exist. The docs page for account linking does not mention `requireLocalEmailVerified` at all ([users-accounts.mdx](https://github.com/better-auth/better-auth/blob/main/docs/content/docs/concepts/users-accounts.mdx)); the source is authoritative for 1.7.6.

Practical outcomes for a person who signed up with email+password and later clicks "Continue with Google" using the same address:

- Default config: blocked with `account_not_linked`. The user can still sign in with their password, then link Google from a signed-in session with `linkSocial` (explicit linking skips the `requireLocalEmailVerified` gate because the user is authenticated, per `opts.selectedUser`/`link` branches; not exercised here, **verify in a test**).
- A brand-new Google user gets a fresh account, `emailVerified` from Google.
- A user who is new to the app and signs up with Google first, then tries email+password sign-up with the same address, gets `USER_ALREADY_EXISTS`; they need a password-reset or set-password path (not researched).

### 2.5 Client behaviour

- `authClient.signIn.social({ provider: "google", callbackURL, errorCallbackURL, newUserCallbackURL })` sends the POST above with the client's fetch. The client's `redirectPlugin` (`better-auth/dist/client/fetch-plugins.mjs`) runs on success: if `data.url && data.redirect && isSafeUrlScheme(url)` it sets `window.location.href = data.url`. So the browser leaves the app for `accounts.google.com`; the promise effectively does not resolve into UI code.
- Pass `disableRedirect: true` to get `{ url }` back and navigate yourself.
- Client `baseURL` default (`client/config.mjs`): explicit option, then env (`NEXT_PUBLIC_BETTER_AUTH_URL` and others), then `window.location.origin` plus `/api/auth`. After the proxy, `createAuthClient()` without `baseURL` works in the browser. Our current `apps/web/lib/auth-client.ts` passes `apiBaseUrl` (the Worker origin); that must change together with the rewrite.
- Relative `callbackURL`s such as `/home` are accepted by the server validator (see §2.3), and resolve against the web origin after the redirect chain.

### 2.6 Google Cloud Console

- **Client type**: "Web application". Console flow: Google Auth Platform → Clients → Create client; "Authorized JavaScript origins" and "Authorized redirect URIs" ([support.google.com/cloud/answer/6158849](https://support.google.com/cloud/answer/6158849)). Better Auth uses a server-side code flow, so **the redirect URI is the required field**. JavaScript origins are only needed for browser-side Google APIs or One Tap (not used here).
- **Redirect URIs to register**: `http://localhost:3000/api/auth/callback/google` and `https://second-brain-sigma-green-70.vercel.app/api/auth/callback/google`. Add any custom production domain separately. Preview deployments have a different hostname per deploy and **cannot** be registered with a wildcard.
- **URI rules** ([web-server guide, redirect URI validation](https://developers.google.com/identity/protocols/oauth2/web-server#uri-validation)): HTTPS required except localhost; no raw IPs except localhost; no wildcards, fragments, userinfo, `/..` path traversal, or open redirects; must match exactly, including scheme, case and trailing slash, or Google returns `redirect_uri_mismatch`.
- **Propagation**: "It may take 5 minutes to a few hours for changes made to these settings to take effect" ([answer/6158849](https://support.google.com/cloud/answer/6158849)).
- **Client secret**: shown at creation; if lost, rotate rather than recover (same page). Store as a Worker secret (`wrangler secret put GOOGLE_CLIENT_SECRET`), never in plain Wrangler `vars`.
- **Consent screen / audience** ([Manage app audience](https://support.google.com/cloud/answer/15549945)): user type External for arbitrary Google accounts (Internal only for the Workspace org). Publishing status "Testing" caps at 100 test users and expires authorisations after 7 days; the exception is sign-in with only `email`, `profile`, `openid`, which needs no verification and does not expire. Move status to "In production" before inviting real users. Branding setup (app name, support email, authorised domain) is at [answer/10311615](https://support.google.com/cloud/answer/10311615); verification of branding is needed for the app name and logo to show.
- Authorised domain: adding the Vercel domain under branding may require domain ownership verification for a custom domain; `*.vercel.app` is a public-suffix-listed domain, so I could not confirm whether Google accepts it as an authorised domain. **Unconfirmed.**

---

## Open questions / risks

1. **Upload size through the rewrite is unconfirmed.** Test a 5 to 50 MB multipart POST to `/items/audio` via a preview deployment. If it fails with `413`, the options are direct upload to object storage with a signed URL or a split (uploads direct to the Worker with a token, not cookies). Needs a founder-level call if it changes scope.
2. **Streaming passthrough and `Set-Cookie`/`Origin`/`Host`/`X-Forwarded-*` delivery are unconfirmed.** One echo endpoint plus one SSE route on a preview deployment settles all four.
3. **Rate limiting and IP.** Replace `cf-connecting-ip` only after the echo test. Until then `AUTH_RATE_LIMIT` (currently opt-in) would key on Vercel egress IPs.
4. **Cache safety.** Confirm the Vercel project creation date (after or before 2026-04-06). Add `Cache-Control: private, no-store` on all authenticated Worker responses regardless.
5. **Existing users with `emailVerified=false` cannot be auto-linked to Google under the default gate.** Decision needed: (a) accept it and offer explicit `linkSocial` from settings, (b) verify emails first, or (c) set `requireLocalEmailVerified: false` and accept a documented, deprecated takeover risk. Recommendation: (a). Ask the product owner which users exist today (likely only dev accounts, in which case migrating them is trivial).
6. **Public `workers.dev` endpoint remains reachable** and would still get cross-site cookies and unproxied traffic. Decide whether to restrict it after the cutover.
7. **Preview deployments** have per-deploy hostnames, so Google sign-in will only work on the production domain and localhost unless we register each URL or route previews through one fixed auth domain.
8. **Plan and cost.** Confirm the Vercel plan (Hobby includes 100 GB FDT and 1 M CDN requests) and whether uploads plus streamed answers fit. A Pro plan is priced per regional unit unless Flat Rate CDN is enabled.
9. **Google app audience.** Confirm whether the app stays External and gets published, and who owns the Google Cloud project (personal vs RaftLabs).
