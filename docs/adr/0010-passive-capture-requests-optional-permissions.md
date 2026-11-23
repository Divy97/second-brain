# ADR-0010: Passive capture requests optional browsing permissions

Date: 2026-10-07
Status: Accepted

## Context

Manual capture only needs the active tab. Passive capture observes navigation and reads text from ordinary web pages, which needs broader browser permissions and exposes browsing activity. Asking for those permissions at install time makes the manual-only path unnecessarily invasive.

## Decision

The extension ships with only manual-capture permissions. The popup explains passive capture and requests `webNavigation` plus HTTP(S) host access when the User enables it. The background worker observes committed and SPA history navigations, waits 15 seconds, then passes the page visit through the passive-capture module before extracting text and sending a passive Capture. Firefox declares website content as required data and browsing activity as optional data, matching the manual and passive paths.

Passive captures use the server's synced capture settings. The extension caches those settings locally for worker restarts, refreshes them through the device-key router, and never captures incognito tabs, sensitive default blocklist hosts, media/PDF URLs, unsupported pages, empty pages, or a URL captured within 30 minutes.

## Consequences

- Users can install and use manual capture with minimal permissions.
- Enabling passive capture requires a visible consent step and may be declined without breaking manual capture.
- Chrome uses optional host permissions; Firefox places the optional origins in `optional_permissions` for its MV2 build.
- Passive behavior is testable through one decision interface, independent of browser event wiring.
