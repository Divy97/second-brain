# Browser extension

Status: agreed in the planning session, 2026-10-01. Research: `docs/research/20-extension-authentication.md`, `docs/research/21-browser-extension-platform.md`.

## Problem Statement

A user finds worth-remembering things while browsing, but saving each one means leaving the page, opening the app and pasting a link. Pages behind a login or paywall cannot be saved at all, because the server fetches URLs itself and sees only the public page. So the Second Brain misses most of what the user actually reads.

## Solution

A browser extension for Chrome and Firefox. The user saves the current page in one click, with a shortcut, or from the context menu. The extension reads the page as the user sees it, including logged-in and paywalled pages, and sends the text to the Second Brain.

Optionally the user turns on **Passive capture**, which records pages as they browse. A setting decides whether passive captures are **Indexed** straight away or only **Stored**, so the user can choose later what is worth Indexing. Stored items are listed in the web app, where the user Indexes them one at a time or in bulk.

The extension connects with a device key the User creates in Settings and pastes into the popup. The key is per-device and revocable that can capture and manage capture settings but cannot read item content, ask questions, or touch API keys.

## User Stories

1. As a user, I can create a device key in Settings and paste it into the extension to connect it, so that I never type my password into the extension.
2. As a user, I can use any Sign-in method in the web app to create the key, so that connecting works whether I use a password or Google.
3. As a user, I see the key once when I create it, so that I know to copy it then.
4. As a user, I can leave the create dialog without copying, then create another, so that a lost key costs nothing.
5. As a user, I can save the current page with the toolbar button, so that capturing takes one click.
6. As a user, I can save the current page with a keyboard shortcut, so that I do not reach for the mouse.
7. As a user, I can save the current page from the context menu, so that I can capture from any page.
8. As a user, I can save a link or selected text from the context menu, so that I can keep part of a page rather than all of it.
9. As a user, I always get a manual capture Indexed, so that a page I deliberately saved is findable in Ask.
10. As a user, I see a clear confirmation when a capture is accepted, so that I know it worked.
11. As a user, I see a clear message when a capture could not be sent, and that it will be retried, so that I do not lose it silently.
12. As a user, I can capture a page that needs a login, so that private articles and documents are remembered.
13. As a user, I can capture a paywalled article I have access to, so that it is remembered.
14. As a user, saving a page I already saved does not create a duplicate, so that my Brain stays clean.
15. As a user, saving a YouTube or Instagram page sends only the link, so that the existing video handling applies and nothing is scraped from the player.
16. As a user, saving a PDF in the browser sends only the link, so that the existing PDF handling applies.
17. As a user, I can turn on Passive capture in the extension, so that pages I read are recorded without effort.
18. As a user, Passive capture is off until I turn it on, so that nothing is recorded without my choice.
19. As a user, turning on Passive capture explains what is recorded and where it goes before it starts, so that I consent knowingly.
20. As a user, the browser asks for the extra site permission only when I turn Passive capture on, so that a manual-only install asks for little.
21. As a user, I choose whether passive captures are Indexed or only Stored, so that I control cost and noise.
22. As a user, Passive capture never records private (incognito) windows, so that private browsing stays private.
23. As a user, Passive capture ignores sensitive sites by default (banking, email, health, password managers, the Second Brain itself), so that I do not store them by accident.
24. As a user, I can add and remove sites on my own blocklist, so that I decide what is never recorded.
25. As a user, I can pause Passive capture from the toolbar, so that I can stop recording quickly without opening settings.
26. As a user, Passive capture records a page only after I stay on it for a short time, so that pages I bounce off are not stored.
27. As a user, Passive capture handles single-page apps that change URL without reloading, so that those visits are recorded once each.
28. As a user, Passive capture never records the same page twice in a short period, so that revisits do not flood my Brain.
29. As a user, Passive capture skips YouTube, Instagram and PDF pages, so that it never spends my transcript credits on its own.
30. As a user, Passive capture skips non-web pages (browser pages, local files, extension pages), so that only real web pages are recorded.
31. As a user, Passive capture skips pages with no readable text, so that empty shells are not stored.
32. As a user, I can see a list of my Stored items in the web app, with title, site and time, so that I can choose what to keep.
33. As a user, I can Index a single Stored item, so that it becomes searchable in Ask.
34. As a user, I can Index many Stored items at once, so that I can clear a backlog quickly.
35. As a user, I can delete Stored items I do not want, so that clutter does not accumulate.
36. As a user, I can see an item's state (Stored, processing, ready, failed) in one place, so that I know what Ask can see.
37. As a user, Stored items do not appear in Ask answers, so that unreviewed browsing never leaks into answers.
38. As a user, a Stored item that fails to Index shows why and can be retried, so that I am not stuck.
39. As a user, I can see how many Stored items are waiting, so that I remember to review them.
40. As a user, I can change the capture settings in the web app as well as in the extension, so that I can manage them from either place.
41. As a user, the capture settings follow me to a second browser, so that I configure once.
42. As a user, I can see my connected devices in Settings with a label and when each was last used, so that I know what has access.
43. As a user, I can revoke one device, so that a lost laptop stops working immediately.
44. As a user, a revoked extension tells me to reconnect instead of failing silently, so that I can fix it.
45. As a user, I can connect several browsers, each with its own token, so that revoking one does not break the others.
46. As a user, the extension cannot read my notes, items, answers or API keys, so that a stolen token exposes as little as possible.
47. As a user, a stolen token cannot be used on the rest of the app, so that the damage is bounded to adding captures.
48. As a user, my Indexing costs follow my existing key and fallback rules, so that the extension adds no new billing surface.
49. As a user on Firefox, I get the same features as on Chrome, so that the browser I use does not matter.
50. As a user, I can disconnect the extension from inside it, so that I can sign out without opening the web app.
51. As an operator, I can read what data the extension collects in a published privacy policy, so that the store listings are honest.
52. As an operator, captures from the extension are rate limited per device, so that a bug or abuse cannot flood the pipeline.

## Implementation Decisions

**Language** (see `CONTEXT.md`): Capture, Passive capture, Stored, Index, Extension. Manual captures are always Indexed. Passive captures follow the capture setting. A Stored item can be Indexed later; the reverse does not exist.

**Item lifecycle.** Add a Stored state before the existing pending state. A Stored item holds the page text and metadata but has no pipeline job queued, no chunks, no embeddings and no facts. Ask and retrieval only read ready items, so Stored items are invisible to them without further change. Indexing a Stored item queues the existing pipeline on the saved text, with no re-fetch of the URL. Indexing an item that is already past Stored is a no-op that returns its current state. Saving a page whose content hash already exists returns the existing item, as text and URL captures do today.

**Capture payload.** The extension sends the URL, title, readable text, capture time and the intended handling (Index or Store). Text is extracted in the browser from a cloned DOM with the Readability library and only the text is sent. The server treats the text as untrusted user content, applies the existing size limit for notes, and decides Stored versus pipeline from the request plus the user's settings. The URL is validated with the same public-HTTP-only rule as URL captures. For YouTube, Instagram and PDF links the payload carries the URL only, and the server routes it through the existing media and PDF handling. Passive capture never produces these.

**Capture settings.** Stored per User on the server so they follow the User across browsers and are editable from the web app and the extension. Fields: Passive capture on or off (default off), passive handling (Index or Store, default Store), the User's blocklist, and a paused flag. The default sensitive-site blocklist ships with the extension and is merged with the User's list; the User can see it but only edit their own entries. Whether sites outside the default list are subject to a minimum dwell time is a client constant, not a setting.

**Authentication.** The Better Auth API Key plugin, configured once for the extension: hashed at rest, shown once, per-key listing and revocation, no session created from a key, rate limit set explicitly (its default is far too low). Keys are minted only by our own route, which sets the permissions on the server; the stock create route is disabled. Permissions: create captures, read and write capture settings, list Stored items (listing fields only), Index and delete the User's own Stored items. Nothing else.

**Connect flow.** Superseded by ADR-0008 (the web-auth-flow approval page was replaced). The User creates a device key in Settings; our own route mints it with the fixed permission set and returns it once. The User pastes it into the extension popup, which validates it against the connection check before storing it in extension local storage, readable by the service worker and extension pages only. Keys are revoke-only (no expiry) and show a last-used time; a revoked key yields an authentication error the extension turns into a reconnect prompt.

**API surface.** A separate extension router behind a key-verification middleware. Existing routes stay session-only and reject keys; the extension router rejects session cookies. The extension router exposes: capture, list Stored (id, URL, host, title, captured-at, status; never text), Index one, Index many, delete, read and write settings, and a connection check that returns the User's email and device label. The web app's own session routes cover the device list, revocation and the Stored list UI, using the same underlying functions.

**Origin and CORS.** Extension traffic goes straight to the Worker, not through the Vercel rewrite. It carries no cookies. A path-scoped CORS rule on the extension router allows extension origins without credentials. This departs from ADR-0004's "the browser only talks to the web origin" and is recorded in a new ADR that amends it. The per-IP auth rate limit is unaffected because the extension router is not part of the auth endpoints; it has its own per-device limit.

**Web app.** A Settings section for connected devices (create key, label, created, last used, revoke) and capture settings; a Stored list with per-item Index, bulk Index, delete and a count of waiting items. UI follows `design-taste-frontend` and the single-theme rules.

**Extension.** A new workspace app built with WXT (pinned version) for Chrome and Firefox, Manifest V3. Install-time permissions are minimal (active tab, scripting, storage, alarms, context menus, and the API host). Passive capture adds optional host permissions and navigation events, requested from a user click when the User enables it. Private-window use is disabled in the manifest. A single capture engine module decides what to do with a page visit: capture, skip or wait, given the settings, blocklist, dwell time, URL type and recent captures. Everything bound for the API goes through a persistent queue drained by an alarm, because the Chrome service worker can stop at any time; failed sends retry with backoff and surface a message after repeated failure. Content scripts only extract and message; they hold no decision logic.

**Schema.** One new table for keys from the plugin, plus device metadata (label, user agent, last used). The item status enum gains Stored. A capture-settings record per User. Migrations follow the repo's existing Drizzle workflow.

**Privacy and store compliance.** Passive capture is browsing-history data. The extension shows a first-run disclosure, the listing carries a privacy policy, the Chrome Limited Use affirmation is made, and the Firefox data-collection declaration is set. Writing the policy text is a launch task owned by the operator.

## Testing Decisions

A good test drives external behaviour only: an HTTP request in and a response or visible state out, or a page visit and settings in and a decision out. Tests never assert on private functions, call order or storage layout.

Seams, confirmed with the user:

1. **API HTTP seam** (primary), using the existing request and sign-up helpers in the Workers test pool. Prior art: the items, keys and url-capture tests. Covers connect and revoke, device listing, extension capture into Stored versus Indexed, duplicate handling, Indexing one and many, deletion, settings, listing fields, and scope enforcement in both directions (key on session-only routes, cookie on the extension router). The pipeline itself is already covered; these tests only assert the Stored-to-pending handoff.
2. **Extension capture engine**, tested with Vitest and WXT's in-memory browser API. Covers blocklist, incognito, dwell time, SPA navigation, duplicates, non-web pages, YouTube/Instagram/PDF URL-only and never passive, the paused flag, queue retry and backoff, and the reconnect-on-revoked path.
3. **Existing Playwright e2e in the web app**, limited to the approval page, the Settings devices and capture sections, and the Stored list with Index actions.

No end-to-end test of the extension in a real browser in this spec.

## Out of Scope

- Rules that Index automatically by domain or topic.
- Safari, Edge-specific listings, and mobile browsers.
- Capturing screenshots, images, selected media or full-page archives.
- Reading from the Second Brain inside the extension (search, Ask, side panel).
- Syncing browser history or bookmarks that predate installation.
- Un-Indexing an item back to Stored.
- Token expiry and rotation (revoke-only in v1).
- Store submission, the privacy policy text and store assets, which are launch tasks.
- Playwright end-to-end of the extension in a browser.
- Third-party API access for other clients.

## Further Notes

- A new ADR records the extension's authentication and direct-to-Worker origin, and amends ADR-0004.
- Unconfirmed items from the research that the implementation must verify early: the exact Origin and preflight behaviour of extension requests, Firefox's event-page idle timeout, and whether a Bun-only lockfile satisfies the Firefox source-build rule.
- Passive capture can store a large volume of text per active user. Stored items count toward storage; the implementation should confirm the cost and add a per-user cap if it is material.
- Cross-device settings sync means the blocklist is also server data and must be included in backups and account deletion.
