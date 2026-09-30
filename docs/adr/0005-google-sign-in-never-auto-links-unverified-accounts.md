# ADR-0005: Google sign-in never auto-links to an unverified email and password account

Date: 2026-09-30
Status: Accepted

## Context

Every existing user signed up with email and password and has `emailVerified=false`; we send no verification email. If Google sign-in auto-linked to an account whose email was never proven, someone who pre-registered a victim's address with a password would keep access after the victim later signs in with Google. Better Auth's default (`requireLocalEmailVerified`) refuses this and returns `account_not_linked`.

Alternatives considered: disabling the guard (takeover risk), and building email verification first (a separate feature needing an email provider and a verify flow).

## Decision

Keep the guard. When Google sign-in matches an existing unverified email and password user, the sign-in page shows "An account with this email already exists. Sign in with your password." and nothing is linked.

## Consequences

- A user who signed up with a password cannot add Google later. Revisit when email verification exists.
- The guard has no test-visible switch to remove by accident; do not set `accountLinking` options to bypass it.
