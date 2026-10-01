# ADR-0007: The extension authenticates with device tokens and talks straight to the Worker

Date: 2026-10-01
Status: Accepted

## Context

The browser extension must act as a signed-in User without ever holding their credentials. The web session cookie is `SameSite=Lax`, is not reliably sent from extension contexts, and grants the whole app. ADR-0004 routes every browser call through the web origin so the cookie works; an extension has no such need and gains nothing from that hop.

Alternatives considered: reusing the session cookie (broad power, unreliable across Chrome and Firefox); a pasted token (poor UX, tokens leak through clipboards and screenshots); Better Auth's device authorization alone (finishes with a full unscoped session and stores codes in plaintext); the OAuth provider with the device grant (a full authorization server, and consent is per client rather than per install). Research: `docs/research/20-extension-authentication.md`.

## Decision

The extension gets a per-install device token from Better Auth's API Key plugin. The User approves it on a web page, the extension receives a one-time code through the browser's web-auth-flow redirect, and exchanges it with a PKCE verifier for the token. Tokens are hashed at rest, shown once, revoke-only, and carry a fixed narrow permission set (capture, capture settings, Stored items). Our own route is the only way to mint one; the stock create route is disabled.

Device tokens are accepted only by a separate `/ext` router. Every existing route stays session-only and rejects them, and `/ext` rejects session cookies. Extension requests go directly to the Worker with no cookies, so they do not pass through the Vercel rewrite.

## Consequences

- Amends ADR-0004: the browser app still talks only to the web origin, but extension traffic is the exception. Extension requests carry no cookie, so the third-party-cookie problem ADR-0004 solves does not arise for them.
- `/ext` needs its own CORS rule for extension origins without credentials, and its own per-device rate limit.
- Revoking a device takes effect on the next request; there is no expiry, so a leaked token is bounded only by its narrow permissions until the User revokes it.
- Each verified request writes to the token's row (the plugin counts usage), one extra database write per extension call.
- The allowed redirect addresses are an exact allowlist in configuration, so publishing the extension under a new ID needs a deploy.
- A second, third-party client needing scoped access would justify revisiting the OAuth provider.
