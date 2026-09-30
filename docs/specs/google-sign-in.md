# Google sign-in

Issue: #66 (builds on #65)

## Problem Statement

A **User** can only sign in with an email and password. They have to invent and remember another password, and anyone with a Google account has to type it into yet another site.

## Solution

Add Google as a second **Sign-in method**. The sign-in and sign-up pages each show a "Continue with Google" button. A new **User** is created on first use, and a returning **User** is signed in. Password sign-in is unchanged. Builds on the same-origin proxy (ADR-0004), so the **Session** cookie works on every browser.

## User Stories

1. As a new **User**, I want to tap "Continue with Google" on the sign-up page, so that I do not have to create a password.
2. As a returning **User**, I want to tap "Continue with Google" on the sign-in page, so that I sign in in two taps.
3. As a **User**, I want to land on the page I was heading to before sign-in, so that I do not lose my place.
4. As a **User**, I want my name and avatar from Google filled in, so that my profile is not blank.
5. As a **User**, I want to come back after closing the tab and still be signed in, so that I do not repeat the flow.
6. As a **User**, I want Google sign-in to work in Brave and Safari, so that my browser choice does not matter.
7. As a **User** who has an email and password account with the same email (unverified), I want a clear message telling me to sign in with my password, so that I know my account exists and is safe.
8. As a **User**, I want that message shown on the sign-in page, not on a raw error page, so that I can act on it.
9. As a **User** who cancels on Google's consent screen, I want to return to the sign-in page with a short explanation, so that I can try again or use a password.
10. As a **User**, I want a failed Google sign-in (Google down, bad state, expired flow) to show a generic "Could not sign in with Google. Try again." message, so that I am not left on a blank page.
11. As a **User**, I want the button disabled while the redirect starts, so that I do not start the flow twice.
12. As a **User** who signed up with Google, I want a password sign-in attempt to fail with the normal incorrect-credentials message, so that nothing reveals how I signed up.
13. As a **User** who signed up with Google and later tries to create a password account with the same email, I want the existing "An account with this email already exists." message, so that I know to use Google.
14. As a **User**, I want the Google button to be keyboard-reachable and labelled for screen readers, so that it is accessible.
15. As a **User** on a phone, I want the button to fit and be tappable, so that mobile sign-in works.
16. As an operator, I want Google sign-in to be hidden or disabled cleanly when credentials are not configured, so that an unconfigured environment does not show a broken button.
17. As an operator, I want the Google client id and secret stored as Worker secrets, so that they never appear in the repo.
18. As an operator, I want a short setup guide for the Google Cloud OAuth client, so that I can configure redirect URIs for local and production.
19. As an operator, I want the redirect URI to follow the configured web origin, so that local, preview and production each work with their own URI.
20. As a developer, I want the no-auto-link rule covered by a test, so that nobody weakens it by accident (ADR-0005).

## Implementation Decisions

- **Provider:** Better Auth `socialProviders.google`, enabled only when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` Worker secrets are both present. Existing `emailAndPassword` config is untouched.
- **Account linking:** Better Auth's default guard stays in force (ADR-0005). No `accountLinking` option may disable it, and Google is not added as a trusted provider for unverified local accounts.
- **Flow:** the client starts sign-in with the social call, the browser goes to Google, Google returns to the Worker callback at the web origin's `/api/auth/callback/google` (through the proxy), and the **Session** cookie is set on the web origin.
- **Destinations:** the client passes explicit `callbackURL` (the sanitised `next` path, default `/home`), `newUserCallbackURL` (same), and `errorCallbackURL` (the current auth page). Redirect targets always pass through the existing safe-path helper, so no open redirect.
- **Error handling:** the auth pages read the `error` query parameter on load and show it in the existing alert. `account_not_linked` maps to "An account with this email already exists. Sign in with your password." User cancellation (`access_denied`) maps to "Google sign-in was cancelled." Everything else maps to "Could not sign in with Google. Try again."
- **Availability flag for the UI:** the web app learns whether Google is configured from a public build-time flag, so the button renders only when `NEXT_PUBLIC_GOOGLE_SIGN_IN` is `on`. The Worker independently refuses the route when unconfigured.
- **UI:** a full-width secondary "Continue with Google" button with the Google mark, above the email form, separated by an "or" divider, on both auth pages. Uses existing UI components; follows `design-taste-frontend`. The button shows a pending state during the redirect.
- **Schema:** none. Linked sign-ins are stored in the existing `accounts` table; Google's `emailVerified` is honoured by Better Auth.
- **Docs:** the setup guide (Google Cloud project, Web application client, consent screen published to Production, redirect URIs for `http://localhost:3000/api/auth/callback/google` and the production web origin, secrets to set) goes in the research/ops notes, and `.dev.vars.example` lists the new variables.
- **Ordering:** implemented after the same-origin proxy spec lands.

## Testing Decisions

- A good test asserts external behaviour: HTTP responses and redirects at the Worker, and rendered output and navigation in the web app.
- **Highest seam: the Worker's HTTP surface** via the existing `request` helper. Tests cover: starting sign-in returns a Google authorization URL whose `redirect_uri` is `<web origin>/api/auth/callback/google` and whose `state` is set; with no credentials the route refuses; a callback with a stubbed Google token response creates a **User** and a **Linked sign-in** and sets a **Session**; a callback whose email matches an existing unverified password **User** links nothing and redirects to the error URL with `account_not_linked`; a callback for an already-linked Google user signs in without creating a second **User**.
- Google's token and userinfo endpoints are stubbed in the test pool, following the existing stub pattern (OpenRouter and extraction stubs in the test support folder).
- **Web seam:** component tests for the auth form: the button renders only when the flag is on, starts the social call with the sanitised `next` and error URLs, shows the mapped message for each `error` value, and disables while pending. An end-to-end test that the button is present and initiates the redirect to Google on both pages (Google's consent screen itself is not automated).
- Prior art: `apps/api/test/auth.test.ts`, `apps/api/test/support/openrouter-stub.ts`, `apps/web/e2e/auth-form.spec.ts`, `apps/web/lib/auth-client.test.ts`.
- The real Google consent round-trip is a manual check by the operator once credentials exist.

## Out of Scope

- Email verification, and linking Google to an existing unverified password account (ADR-0005).
- Other providers (GitHub, Apple) and account settings for managing **Linked sign-ins**.
- One Tap / Google Identity Services popup.
- Migrating existing **Users** to Google.

## Further Notes

- Research: `docs/research/17-vercel-proxy-and-google-sign-in.md`.
- Until the operator adds credentials, the feature ships dark: the flag is off and the Worker route is unconfigured.
- The consent screen must be published to Production; in Testing status sign-in is capped at 100 test users.
