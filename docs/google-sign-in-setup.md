# Google sign-in setup

One-time setup for issue #66. Until both secrets exist and the web flag is on, the feature stays dark: the button is hidden and the Worker has no Google route.

## Google Cloud Console

1. Create or pick a project. Open Google Auth Platform, Branding: set the app name, support email and, for production, the authorized domain.
2. Audience: choose External, then publish the app (status "In production"). In "Testing" sign-in is capped at 100 test users. The scopes used (`openid`, `email`, `profile`) need no Google verification.
3. Clients, Create client: type "Web application". Under Authorized redirect URIs add exactly:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://second-brain-sigma-green-70.vercel.app/api/auth/callback/google`
4. Copy the client id and secret. Changes can take minutes to propagate.

Preview deployments have their own hostnames and cannot be registered, so Google sign-in works on production and localhost only.

## Local

Add to `apps/api/.dev.vars`: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Add `NEXT_PUBLIC_GOOGLE_SIGN_IN=on` to `apps/web/.env`. Restart both dev servers.

## Production

```bash
cd apps/api
bunx wrangler secret put GOOGLE_CLIENT_ID
bunx wrangler secret put GOOGLE_CLIENT_SECRET
bun run deploy
```

In Vercel, set `NEXT_PUBLIC_GOOGLE_SIGN_IN=on` and redeploy (it is read at build time). This requires the same-origin proxy (#65) to be live so the session cookie survives the redirect.

## Check

Sign in with a Google account on a fresh profile: you land on `/home` signed in. Then try a Google account whose email already has an unverified password account: you see "An account with this email already exists. Sign in with your password." (ADR-0005).
