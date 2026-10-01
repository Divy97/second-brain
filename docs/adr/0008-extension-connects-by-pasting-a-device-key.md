# ADR-0008: The extension connects by pasting a device key

Date: 2026-10-02
Status: Accepted. Supersedes the connect method in ADR-0007.

## Context

ADR-0007 connected the extension through a web approval page, the browser's web-auth-flow API and PKCE, and rejected a pasted token for poor UX and clipboard leakage. In practice that flow needs the extension's exact ID in a Worker allowlist (a deploy per new ID), cannot work on Firefox where every install has a random ID, needs the `identity` permission, depends on the profile completing a sign-in inside the flow, and failed silently in the first build. The owner wants one extension in many browsers and profiles without touching the API.

## Decision

The User creates a device key in Settings. Our authenticated route mints it through the API Key plugin with the fixed extension permission set and returns it once. The User pastes it into the extension popup, which validates it against the connection check and stores it locally. The approval page, authorization-code routes, PKCE helpers, redirect allowlist and `identity` permission are removed. Device listing, revocation, hashing at rest, the separate extension router and extension CORS from ADR-0007 are unchanged. A User may hold at most 20 device keys.

## Consequences

- Connecting a new browser, profile or extension ID needs no deploy or configuration change, and works on Chrome, Brave and Firefox alike.
- The key passes through the clipboard and may appear in a screenshot. It is shown once, revoke-only, and limited to capture, capture settings and Stored items, so a leak is bounded and fixable by disconnecting the device.
- Connecting takes one manual step instead of one click. One-click connect can return later with a pinned extension key if the friction matters.
- Authorization codes were stored as rows in the verification table, so there is no table to drop. Unused codes expire on their own.
