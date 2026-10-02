# Browser extension platform: Chrome + Firefox MV3 capture extension

Last verified: 2026-10-01

Sources: primary only. Chrome docs (developer.chrome.com/docs/extensions, /docs/webstore), MDN WebExtensions, Mozilla Extension Workshop, the official WXT docs (wxt.dev), Playwright docs, and the `mozilla/readability` repo (raw source and README). Release dates come from `npm view` and `gh api`/`gh release list` run on 2026-10-01. Doc pages were fetched with WebFetch, which returns a model-written extract, so quoted wording is as returned by the tool and should be re-read on the page before it goes into a store submission or a client message. Anything not confirmed in a primary source is marked UNCONFIRMED.

## Bottom line

Build `apps/extension` with WXT. It is the only one of the four options that is actively released, supports Chrome and Firefox MV3 from one codebase, and ships a Vitest plugin with an in-memory `browser`. Request almost nothing at install (`activeTab`, `scripting`, `storage`, `alarms`, `contextMenus`) so manual capture works with no host warning, and put passive capture behind `optional_host_permissions` requested from a button click. Extract article text in the page with `@mozilla/readability`, send URL only for YouTube, Instagram and PDFs. Two blockers sit outside the extension: the API authenticates with a `SameSite=Lax` cookie (ADR-0004), so the extension needs its own credential, and passive capture of browsing data needs a founder decision on privacy policy and store disclosures before any build starts.

## 1. Build tooling

| Option            | Latest release (verified 2026-10-01)                                                                                                 | MV3 + Firefox                                                                                                                    | Monorepo / TS / Vitest fit                                                                                                            | Verdict                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| WXT               | `wxt` 0.21.4, 2026-08-11 (npm and GitHub release). Repo pushed 2026-10-01.                                                           | Yes. "supports Manifest V2/V3 across Chrome, Firefox, and Safari"; per-browser manifest function; `wxt zip -b firefox`.          | Vite-based, TS-first. Built-in `WxtVitest` plugin. Peer deps: vite `^6.3.4 \|\| ^7 \|\| ^8`, typescript `>=5.4`; engines node `>=22`. | Recommended                                     |
| Plasmo            | `plasmo` 0.90.5, 2025-05-17 (npm). Latest repo commits on the first page are also 2025-05-17.                                        | Cross-browser claimed; Parcel-based. README: "currently alpha software".                                                         | Parcel, not Vite, so Vitest config would be separate from the extension build.                                                        | Reject: no release or commit in about 16 months |
| CRXJS Vite plugin | npm `@crxjs/vite-plugin` 3.0.0 published 2026-09-24; GitHub "Latest" release is `vite-plugin-v2.7.0` (2026-06-19). The two disagree. | Chrome-first. Only Firefox note found: v2.2.0 "support for root url content script match in firefox". No MV3 Firefox guide read. | Plain Vite plugin, so Vitest works as normal. No test helpers.                                                                        | Viable fallback, weaker Firefox story           |
| Plain Vite        | n/a                                                                                                                                  | You write manifest, multi-entry build, `background.scripts` vs `service_worker` split and Firefox packaging yourself.            | Most control, most glue.                                                                                                              | Reject: rebuilds what WXT already provides      |

Evidence:

- WXT: https://wxt.dev/guide/introduction.html (version 0.21.4, MV2/MV3, Chrome/Firefox/Safari, MIT, monorepo-ready modular packages); https://wxt.dev/guide/essentials/config/manifest.html (per-browser `manifest` function, MV2/MV3 auto-conversion, output to `.output/{target}/manifest.json`); https://wxt.dev/guide/essentials/publishing.html (`wxt zip`, `wxt zip -b firefox` includes sources, `wxt submit`); https://wxt.dev/guide/essentials/unit-testing.html. Release dates: https://github.com/wxt-dev/wxt/releases and `npm view wxt`.
- Plasmo: https://github.com/PlasmoHQ/plasmo (README alpha disclaimer, Parcel); `npm view plasmo time.modified` = 2025-05-17.
- CRXJS: https://github.com/crxjs/chrome-extension-tools/releases (v2.7.0 Latest, v2.6.1 "full vite 8 support"); `npm view @crxjs/vite-plugin` shows 3.0.0 on 2026-09-24 and 2.7.1 on 2026-07-01. UNCONFIRMED: what 3.0.0 changes, and why GitHub does not flag it as the latest release.
- WXT caveat: WXT is pre-1.0 (0.x), so minor versions can break. Pin the version and read the changelog on each upgrade. WXT's `wxt` package requires Node `>=22` or Bun `>=1.2.0` (from `npm view wxt engines`); the repo declares `node >=20` in the root `package.json`, so CI must use Node 22+ for this workspace. UNCONFIRMED: whether the root `engines` field needs raising.
- Repo fit: root `package.json` uses Bun workspaces (`apps/*`, `packages/*`), Turbo tasks `build lint typecheck test lint:boundaries`, Vitest 5 and shared `@workspace/typescript-config` and `@workspace/eslint-config`. A new `apps/extension` fits. Turbo's `build` outputs are `.next/**` only, so add `.output/**` for this app. `lint:boundaries` runs dependency-cruiser from `../../.dependency-cruiser.cjs` and the extension needs a rule so it cannot import from `apps/api` or `apps/web` internals.

## 2. MV3 constraints and permissions

### Service worker lifetime and reliable upload

Chrome (https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle):

- Terminates after 30 seconds idle ("Receiving an event or calling an extension API resets this timer").
- Terminates when a single event or API call takes more than 5 minutes.
- Terminates when a `fetch()` response takes more than 30 seconds to arrive.
- Do not rely on global variables; persist to storage.

Firefox does not run a service worker. https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background: Firefox "Does NOT support `service_worker`" and supports `background.scripts`. The documented cross-browser MV3 manifest declares both keys (`"scripts": ["background.js"], "service_worker": "background.js"`); Chrome uses the service worker, Firefox the event page. `persistent: true` is disallowed in MV3. WXT generates this per browser (UNCONFIRMED: exact WXT output, check `.output/firefox-mv3/manifest.json` once built). UNCONFIRMED: Firefox's idle timeout for the event page; the `runtime.onSuspend` page (https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/onSuspend) says async work started there "is not guaranteed to complete". Design both browsers as "may be killed at any moment".

Upload pattern that follows from those rules:

1. The handler writes the capture into a queue in `storage.local` first, then returns. Nothing important lives in memory.
2. A `drainQueue()` function sends each item with `fetch` from the background context, deletes it on a 2xx, and keeps it with an incremented attempt count and `nextAttemptAt` on failure.
3. Triggers for `drainQueue()`: right after enqueue, `runtime.onStartup`, and a repeating alarm. Re-create the alarm on every worker start. Reason: Chrome's alarms page recommends recreating critical alarms on service worker startup for cross-browser compatibility, and says alarms "won't wake" a sleeping device and missed ones fire once on wake (https://developer.chrome.com/docs/extensions/reference/api/alarms).
4. Alarm period: "Chrome limits alarms to at most once every 30 seconds" in production. Use `periodInMinutes` of 1 or more for the retry sweep. The alarms page, as returned, mentions `persistAcrossSessions` "(Chrome 150+)". UNCONFIRMED: treat as not available and always recreate.
5. Keep each `fetch` well under 30 seconds. Cap payload size (section 4) so a single POST is quick.
6. Make the server idempotent on `url` plus `capturedAt` (or a client-generated id) so a retry after a lost response does not duplicate the item.

Fetch from the worker: https://developer.chrome.com/docs/extensions/develop/concepts/network-requests says service workers and extension pages can make cross-origin requests when the extension declares `host_permissions` for the target, content scripts cannot ("bound by the same-origin policy"), and a content script should send a message to the service worker to make the request. It also says never to pass arbitrary URLs from content scripts. The API origin therefore needs one fixed `host_permissions` entry (the Worker or web origin, whichever the extension talks to). That is a single named host, not a broad one.

### Permissions

Facts:

- `activeTab` (https://developer.chrome.com/docs/extensions/develop/concepts/activeTab): temporary access to the current tab when the user invokes the extension by action click, context menu item, keyboard shortcut, or omnibox. It exposes URL, title and favicon and allows `scripting.executeScript` if `scripting` is also declared. Access ends when the user navigates away or closes the tab. It does not apply to `chrome://` pages.
- Optional permissions (https://developer.chrome.com/docs/extensions/reference/api/permissions): declare `optional_permissions` and `optional_host_permissions`; "Permissions must be requested from inside a user gesture, like a button's click handler" via `permissions.request()`; Chrome prompts only if the permission triggers a new warning; `permissions.contains()`, `getAll()`, `remove()`, and `onAdded`/`onRemoved` events exist. `debugger`, `declarativeNetRequest`, `devtools` and a few others cannot be optional; none of the ones we need are on that list.
- Warnings (https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings): request only what is essential, use optional permissions at runtime, use `activeTab` instead of broad hosts. When an update adds a warning-bearing permission the extension is disabled until the user accepts.
- Firefox treats host permissions as user-controlled (https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/host_permissions): "most browsers treat `host_permissions` as optional"; Firefox 127+ shows them in the install prompt; extension updates that add them are still not shown (bug 1893232). The extension must call `permissions.contains()` and `permissions.request()` regardless of what the manifest says.
- `<all_urls>` covers http, https, ws, wss, ftp, data, file; `*://*/*` covers http(s) and websockets only (https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Match_patterns). Use `*://*/*` or, better, `https://*/*` plus `http://*/*`, never `<all_urls>`.

Recommended manifest split:

| Feature                                 | Needs                                                                                                                                                  | When granted                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Manual capture (button, shortcut, menu) | `activeTab`, `scripting`, `storage`, `alarms`, `contextMenus`, plus `host_permissions` for the API origin only                                         | At install                                           |
| Keyboard shortcut                       | `commands` manifest key (no permission string). `_execute_action` opens the action; a custom command fires `commands.onCommand` and grants `activeTab` | At install                                           |
| Passive capture                         | `optional_host_permissions: ["https://*/*", "http://*/*"]` and `optional_permissions: ["webNavigation"]` (or use `tabs.onUpdated`, see section 3)      | `permissions.request()` from the opt-in toggle click |
| Tab-per-site passive capture (narrower) | `permissions.request({origins: ["https://example.com/*"]})` per site                                                                                   | Per-site opt-in from the popup                       |

Registering the passive content script after the grant: use `scripting.registerContentScripts` with `matches` set to the granted origins. https://developer.chrome.com/docs/extensions/reference/api/scripting says it needs host permissions (or `activeTab`) and `persistAcrossSessions` defaults to `true`. MDN (https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/scripting/registerContentScripts) confirms Firefox 101+ in MV3. This avoids declaring a static `content_scripts` entry with a broad `matches`, which would put the broad host in the install prompt. UNCONFIRMED: that a dynamic registration against optional-only hosts avoids the install warning on both stores; verify by loading a build and reading the Chrome install dialog and the Firefox prompt.

Open design choice, needs a founder decision: ask for "all sites" (one prompt, broad) or per-site grants (many prompts, narrow). The store sections below say broad hosts slow review; "all sites, on opt-in" is the simpler product.

### Store implications of broad hosts and browsing data

Chrome Web Store:

- Review: "For most extensions, review is completed within a few days, but it can take up to a few weeks." Broad host patterns (`*://*/*`, `https://*/*`, `<all_urls>`) and `tabs`-class permissions lengthen review, as do new developers and new extensions (https://developer.chrome.com/docs/webstore/review-process).
- User data definition includes "Web browsing activity and any information about the website content or resources a user requests or interacts with, including the domains or URLs the browser interacts with" (https://developer.chrome.com/docs/webstore/program-policies/user-data-faq). Passive capture sends exactly that.
- Required: privacy policy on the dashboard, data sent over HTTPS, and a "prominent disclosure" in the extension UI that describes the data and obtains consent; it "must not be located only in a privacy policy" (same page).
- Limited Use (https://developer.chrome.com/docs/webstore/program-policies/limited-use): use only for the disclosed single purpose; web browsing activity collection is prohibited unless it is "a prominently described user-facing feature"; no use for personalised ads, no sale, human access to raw data restricted to consent, security, legal, or aggregated/anonymised cases; the developer must affirm compliance (usually in the privacy policy).
- Dashboard privacy tab (https://developer.chrome.com/docs/webstore/cws-dashboard-privacy): single-purpose description, a justification per permission, remote-code declaration, data-use certification matching the policy URL.
- Single purpose (https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines-faq): narrow focus, and "Google assumes extensions use every permission they request". Write the single purpose as "save web pages to your personal second brain and search them" so passive capture is part of it, not a second purpose.

Firefox AMO:

- Policies (https://extensionworkshop.com/documentation/publish/add-on-policies/): request only necessary permissions (4.1), no remote code (4.2), user must have "a clear way to control the add-on's data transmission" (6.2), personal data requires explicit opt-in (6.2.2.2), unexpected features need explicit opt-in with clear disclosure (1.1).
- Built-in data consent (https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/): "From November 3, 2025, all new extensions must adopt the Firefox built-in data collection consent system", declared under `browser_specific_settings.gecko.data_collection_permissions` with `required` and `optional` arrays. Categories include `browsingActivity` and `websiteContent`. Supported in Firefox Desktop 140+ and Android 142+. Our extension sends page text and URLs, so declare `websiteContent` and `browsingActivity`. Put them as `required` for the extension to function, or as `optional` and request via `permissions.request()` to model passive capture as opt-in. UNCONFIRMED which choice AMO reviewers prefer; `optional` matches the opt-in design.
- Firefox also needs an explicit extension id for `storage.sync` (section 5), so set `browser_specific_settings.gecko.id` from day one.

## 3. Passive capture mechanics

Detecting a real visit. Options:

| Signal                                   | What it gives                                                                                                                     | Note                                                                                                                                                                                                            |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `webNavigation.onCommitted` (frameId 0)  | Top-frame navigation committed, with `transitionType` and qualifiers. Main frame always has `frameId` 0.                          | Needs `webNavigation`. https://developer.chrome.com/docs/extensions/reference/api/webNavigation. Event order is `onBeforeNavigate -> onCommitted -> onDOMContentLoaded -> onCompleted`.                         |
| `webNavigation.onHistoryStateUpdated`    | SPA `pushState`/`replaceState` URL changes. Firefox supports it. Accepts a URL filter.                                            | https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webNavigation/onHistoryStateUpdated                                                                                                  |
| `tabs.onUpdated`                         | `status` loading/complete, `url`, `title` changes; fires several times per navigation and for non-navigation changes (pin, mute). | https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/onUpdated. Needs dedup. Firefox 88+ for `url` filtering. Whether it requires `tabs` permission to read `url`: UNCONFIRMED here. |
| Content script (`document_idle`) in page | Runs once per document load; sees the DOM and `visibilitychange`.                                                                 | Default injection timing is `document_idle`, top frame only unless `all_frames` (https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts).                                                |
| WXT `wxt:locationchange`                 | Content-script-side event for URL changes without reload.                                                                         | https://wxt.dev/guide/essentials/content-scripts.html. WXT mechanism, not a browser API; UNCONFIRMED how it detects changes internally.                                                                         |

Recommended: put the visit logic in the content script, not the background. The content script is the only place that can read the DOM, measure dwell time on a visible tab, and run Readability, so the background only receives finished captures. For SPA navigation, the background listens to `webNavigation.onHistoryStateUpdated` filtered to granted origins and messages the tab's content script ("URL changed"), which resets its dwell timer and re-extracts. That adds `webNavigation` (declare it optional) but avoids polling the URL in the page. UNCONFIRMED: dwell-time thresholds are product choices, not documented values; start at 15 seconds of the tab being visible and focused and make it a constant to tune. Measure dwell with `document.visibilityState` and `visibilitychange`, not wall-clock since load, so background tabs do not count.

Skipping pages. Nothing in the docs identifies "authenticated" or "sensitive" pages, so this is all heuristics we write (UNCONFIRMED as to any browser-provided signal):

- Scheme: only `http:` and `https:`. Content scripts cannot run on `chrome://` pages or the Web Store anyway (content-scripts page above), and match patterns can exclude schemes.
- Excluded by pattern: `exclude_matches` or an in-code blocklist check for `localhost`, `*.local`, RFC1918 and loopback hosts, `file:`.
- Sensitive defaults: ship a built-in blocklist (banking, health, webmail, password managers, SSO and login hosts) and block URL paths matching `/login`, `/signin`, `/auth`, `/oauth`, `/account`, `/checkout`, `/settings`. Treat pages with a visible `input[type=password]` as sensitive.
- No capture of URL query or fragment unless the user allows it: strip tokens and `utm_*`. (A session token in a URL would otherwise be uploaded.)
- Passive mode `index` vs `store` (section 5): in `index` the server keeps embeddings only; this is a product semantic, not a browser concern.

Domain blocklist/allowlist. Evaluate in the content script before extraction, and again in the background before upload, since content scripts are the untrusted side. Store entries as bare hostnames and match a host or any parent (`example.com` blocks `www.example.com`). Parse with `new URL()`, not regex on the string. Prefer a blocklist plus the built-in sensitive list for the default; offer an optional "only these sites" allowlist mode, which maps cleanly onto per-site `permissions.request` origins so the browser enforces it too. Cross-reference match pattern rules (hosts need `*.` at the start only; Firefox does not support port numbers in match patterns, https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Match_patterns), so store the user's list as hostnames and convert to patterns only for `registerContentScripts`.

Incognito.

- Chrome (https://developer.chrome.com/docs/extensions/reference/manifest/incognito): `incognito` takes `spanning` (default), `split`, `not_allowed`. `not_allowed` disables the extension in incognito entirely. As returned, the page does not state that Chrome disables extensions in incognito until the user enables "Allow in Incognito"; UNCONFIRMED from a primary Chrome page in this session, though it is widely known behaviour. Do not rely on it.
- Firefox (https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/incognito): by default extensions do not run in private windows and the user must opt in per extension. `split` is unsupported and falls back to `not_allowed`. `browser.extension.isAllowedIncognitoAccess()` reports access. MDN warns that with `spanning` you must not leak private data to non-private sessions, and shows `fetch(url, {credentials: "omit", cache: "no-cache"})`.
- Decision for us: set `"incognito": "not_allowed"` in the manifest. It is valid in both browsers per the pages above and removes the whole class of "captured a private tab" bugs. Also check `tab.incognito` / `sender.tab.incognito` in the background and drop the capture if true (defence in depth). The cost is that a user cannot manually save from a private window. UNCONFIRMED: whether `not_allowed` also hides the extension's shortcut/menu in incognito on Chrome; test it.

## 4. Text extraction in the browser

`@mozilla/readability` (https://github.com/mozilla/readability, README and `Readability.js` raw source):

- Version 0.6.0 on npm, published 2025-03-03. Repo pushed 2026-08-04 (dependency and NOTICE commits); GitHub has no releases object ("Not Found" for latest release). Apache 2.0 licence per the file header on `Readability-readerable.js` (as returned). Maintenance is slow but alive; the package is small and stable, so a pinned dependency is fine.
- Usage per README: `if (isProbablyReaderable(document)) { let article = new Readability(document.cloneNode(true)).parse(); }`. "The clone matters": the constructor takes a Document and mutates it heavily (strips scripts, removes nodes), so always pass a clone or you break the live page.
- `isProbablyReaderable` (`Readability-readerable.js`): defaults `minContentLength` 140, `minScore` 20; scans `p`, `pre`, `article` and `div` with `br`; filters unlikely classes such as `ad`, `banner`, `footer`, `sidebar`; sums `sqrt(textLength - 140)` per visible candidate and returns true once the score exceeds 20. It is a cheap pre-check, not a guarantee.
- `parse()` returns `title, byline, dir, lang, content, textContent, length, excerpt, siteName, publishedTime`, or `null` when no article is found. `charThreshold` defaults to 500, so shorter articles return `null` unless lowered. `maxElemsToParse` defaults to 0 (no limit); when set and exceeded, `parse()` throws "Aborting parsing document; N elements found". Set it (for example 20,000 as a starting value, UNCONFIRMED as a good number) so a huge DOM cannot freeze the tab.
- Security: the README says to use "a sanitizer library like DOMPurify" for the HTML `content`. We send `textContent` only, never `content`, so no HTML reaches our UI. If a future feature renders `content`, sanitise it.
- Runs in the content script's isolated world, which has a CSP that "prevents the use of `eval()`" (content-scripts page); Readability does not need `eval`. UNCONFIRMED: bundle size and parse time on large pages; measure.

Size limits. Nothing in the extension docs sets a payload cap; the limit is ours and the API's. Chrome `storage.local` holds 10 MB (5 MB before Chrome 113) unless `unlimitedStorage` is declared (https://developer.chrome.com/docs/extensions/reference/api/storage), and the upload queue lives there, so cap each capture (suggest 200 KB of text, truncated at a paragraph boundary, UNCONFIRMED as a product choice) and cap the queue length. Reject captures under a minimum length rather than uploading near-empty text.

Non-article pages. `isProbablyReaderable` false or `parse()` null means "not an article": in passive mode skip silently; in manual mode fall back to sending the URL only and let the server's existing ladder (Jina Reader, ADR-0001) handle it, with a note in the UI. Never send raw `document.body.innerText` as a fallback; that is how nav, ads and private page chrome get uploaded.

PDFs. A WebSearch result stated that content scripts cannot run in the browser's built-in PDF viewer, but the primary page it came from was not identified, so treat as UNCONFIRMED. Either way, `activeTab` still gives the tab URL and title, so send URL only for PDFs. The API already has a PDF upload route (`/items/pdf`, per ADR-0004) so PDFs are a server concern.

YouTube and Instagram. The server already resolves these by URL (ADR-0002: operator Data API metadata plus optional transcript key; ADR-0003: Instagram caption via `/v1/metadata`, dedupe on `platform:mediaId`). Recommendation: the extension sends `{url, title, capturedAt}` with no `text` for `youtube.com`, `youtu.be`, `youtube-nocookie.com`, `instagram.com`, `instagr.am`. Reasons: (1) Readability on a video page extracts comments or recommendations, not the video, which would pollute the index; (2) sending DOM text would bypass the dedupe and the cost rules the ADRs set; (3) the server already holds the correct ladder. Passive capture should skip these entirely unless the user opts in, because the server path may spend the user's transcript credits (ADR-0002/0003 describe 1 credit per call). That last point needs a product decision: an automatic visit to a YouTube page must not silently spend credits. Recommendation: passive mode never captures YouTube or Instagram; manual capture does, URL only.

## 5. Messaging architecture and settings

Flow:

```
content script (extract + filter) --runtime.sendMessage--> background (validate, queue, upload) --fetch--> API
popup / options  --storage / sendMessage-->  background
```

- Content scripts cannot make cross-origin requests; the Chrome network-requests page tells you to send a message to the service worker for them. The background validates every message (shape, size, URL scheme, incognito, blocklist) because content scripts are the untrusted side; the page can influence the content script's DOM reads but not the isolated world's code.
- Never include a user-controlled URL as the fetch target; only the fixed API origin is fetched, with the captured URL in the body (network-requests page, security guidance).
- Use a typed message protocol with a discriminated union in one shared module, so `apps/extension` has a single `messages.ts`. UNCONFIRMED whether to use `@webext-core/messaging` or `@wxt-dev/*` helpers; hand-rolled is a few lines and avoids a dependency. Out of scope for this research to decide.
- Manual capture from a context menu, shortcut or action click: the background gets the click with `activeTab` granted, runs `scripting.executeScript` for an extraction function in the tab, receives the result, then enqueues. No persistent content script is needed for manual capture. Context menus: create items inside `runtime.onInstalled` and handle `contextMenus.onClicked` with a top-level listener (https://developer.chrome.com/docs/extensions/reference/api/contextMenus). Commands: at most four suggested shortcuts, must include Ctrl or Alt, Ctrl becomes Command on macOS, the user can rebind at `chrome://extensions/shortcuts` (https://developer.chrome.com/docs/extensions/reference/api/commands). Register all listeners synchronously at the top level of the background, so a restarted worker receives the event (lifecycle page).

Settings model `{passiveCapture: boolean, passiveMode: 'index' | 'store', blocklist: string[]}`.

| Area              | Limits (Chrome docs)                                                                                          | Use for                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `storage.sync`    | about 100 KB total, 8 KB per item, 512 items, 120 writes/min and 1,800/hour; syncs across signed-in browsers  | The settings object above, stored under one key per field |
| `storage.local`   | 10 MB (unlimited with permission)                                                                             | Upload queue, retry state, last-seen dedupe map           |
| `storage.session` | 10 MB, memory only, cleared on browser restart or extension reload; not exposed to content scripts by default | Short-lived dwell timers, in-flight flags                 |

Firefox `storage.sync` (https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/sync): requires `browser_specific_settings.gecko.id` in the manifest, same limits (102,400 bytes, 8,192 per item, 512 items), syncs about every 10 minutes and only if the user enabled add-on sync; Android does not sync.

Recommendation: `passiveCapture`, `passiveMode`, `blocklist` in `storage.sync` (small, user-wide). Two cautions: (a) a large `blocklist` can hit the 8 KB item limit, so store one array under a single key and cap its length (about 8 KB / 30 bytes per host is about 270 hosts, UNCONFIRMED as a sizing, measure it) or shard; (b) `passiveCapture` being true in `storage.sync` on a second device must not imply the optional host permission was granted there. The permission is per-install, so derive the effective state as `passiveCapture && await permissions.contains(...)` and show the toggle as "needs permission on this device". The upload queue and any access token stay in `storage.local`, never in `sync`.

Authentication (not asked, but it blocks the build). ADR-0004: the web session cookie is `SameSite=Lax` and the browser only talks to the web origin. A cookie-based call from an extension service worker is cross-site, and the extension origin is not the web origin. The extension needs its own credential (for example a user-minted API token or Better Auth bearer flow). Which one is a product and security decision; not researched here (see `docs/research/07-better-auth-hono-workers.md` for the auth stack). Note also that the browser token must be stored in `storage.local` and sent over HTTPS only, per the CWS policy above.

## 6. Testing

Unit tests with Vitest:

- WXT ships `WxtVitest()` (https://wxt.dev/guide/essentials/unit-testing.html). It uses `@webext-core/fake-browser` to provide an in-memory `browser`, absorbs the Vite config from `wxt.config.ts`, sets `import.meta.env.BROWSER` and friends, and resolves the `@/` and `@@/` aliases. The fake browser has a real in-memory `storage` so you do not mock `browser.storage`; call `fakeBrowser.reset()` between tests. Mock WXT utilities by their resolved paths, not `#imports`.
- `@webext-core/fake-browser` 2.0.1, published 2026-07-26 (npm). `webextension-polyfill` is at 0.12.0, 2024-05-14, and is not needed because WXT exposes a promise-based `browser` global itself (UNCONFIRMED: WXT's exact polyfill mechanism, not read in this session). Skip the polyfill.
- Not covered by fake-browser (UNCONFIRMED): event firing for alarms and `webNavigation`, and real service-worker termination. Structure code so the logic (queue, backoff, blocklist, URL normaliser, extraction wrapper) is pure functions plus a thin listener layer, and unit test the pure parts. Readability can be tested in Vitest with a DOM environment (jsdom or happy-dom); UNCONFIRMED which of the two matches Readability best, README only documents jsdom for Node.
- Repo fit: root `package.json` already has Vitest 5 and `turbo test`; add `"test": "vitest run"` to `apps/extension`.

End-to-end:

- Chrome: https://playwright.dev/docs/chrome-extensions. Extensions only work in Chromium with `launchPersistentContext` and `--disable-extensions-except` / `--load-extension` args; use `channel: 'chromium'` because Chrome and Edge "removed the command-line flags needed for side-loading" and the bundled Chromium allows headless; get the extension id from the service worker URL; the worker suspends after about 30 seconds and Playwright keeps the same Worker handle, but in-flight `evaluate()` throws "Service worker restarted". WXT recommends exactly this (https://wxt.dev/guide/essentials/e2e-testing.html): "Playwright is the only good option for writing Chrome Extension end-to-end tests", pointed at `.output/chrome-mv3`. That means a CI job: `wxt build`, then `playwright test` with the Chromium channel, which works headless on Linux runners. UNCONFIRMED: Playwright's xvfb requirement on CI; not stated in the page as returned.
- Firefox: neither the Playwright page nor WXT's e2e page covers Firefox extension loading. UNCONFIRMED. Plan to cover Firefox with unit tests plus a manual `wxt dev -b firefox` smoke test, and treat automated Firefox e2e as out of scope until someone verifies `web-ext` or Selenium (WXT lists `web-ext >=9.2.0` as a peer dependency; that is for its runner, not a test harness).
- Include at least one e2e test that loads the built extension and posts a capture to a stub API.

## 7. Distribution (brief)

| Store            | Requirements                                                                                                                                                                                                                                                                                                                                                                                                 | Review time                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chrome Web Store | Developer account (fee: UNCONFIRMED, not read), privacy policy, single-purpose statement, per-permission justification, data-use certification, remote-code declaration (MV3 forbids remotely hosted code). No obfuscation.                                                                                                                                                                                  | "within a few days, but it can take up to a few weeks"; contact support after three weeks. Broad host permissions and new developers slow it (review-process page). |
| Firefox AMO      | Gecko id, privacy policy if any data leaves the device ("a privacy policy explaining what is being sent and how it's used is required"), `data_collection_permissions`, source code zip when bundled or minified (WXT `wxt zip -b firefox` builds it), build instructions that reproduce byte for byte, open-source build tools, max 200 MB. Default reviewer env: Ubuntu 24.04.4, Node 24.14.0, npm 11.9.0. | Not stated in the docs read. UNCONFIRMED.                                                                                                                           |

Sources: https://developer.chrome.com/docs/webstore/review-process, https://developer.chrome.com/docs/webstore/cws-dashboard-privacy, https://extensionworkshop.com/documentation/publish/submitting-an-add-on/, https://extensionworkshop.com/documentation/publish/source-code-submission/, https://wxt.dev/guide/essentials/publishing.html. Note that the AMO build-reproduction rule matters for a Bun workspace: the submitted sources must build with a lockfile the reviewer can run; the default reviewer image lists npm, so confirm that a Bun-only lockfile is acceptable or provide `npm` instructions (UNCONFIRMED).

## Not covered / open questions

- How the extension authenticates to the API (section 5). Needs a decision before the API contract is written.
- Whether passive capture is in v1 at all, given the store disclosure burden. Manual capture alone needs no browsing-data disclosure beyond the data the user explicitly sends; passive capture triggers Limited Use, prominent disclosure and Firefox `browsingActivity`.
- Whether the API should accept `text` from the client at all, versus the existing ladder. Client text is user-controlled and unverified; the server must treat it as untrusted input, cap size and strip control characters. This is an API-side change not researched here.
- Server handling of client-supplied text for `index` vs `store` modes (what is retained). Product semantics, not a platform fact.
- Safari: WXT lists it, but publishing is manual via Xcode (publishing page). Not in scope.
- Chrome's exact install-dialog text for the chosen permission set, and Firefox's. Needs a built extension to read.
- Edge, Brave, Arc: not researched. WXT supports an Edge zip target (publishing page).
- Cost and process of the Chrome Web Store developer registration fee. Not read.

## Recommendation

1. Use WXT 0.21.x as `apps/extension` (pin the version; it is 0.x). Reject Plasmo (no release since 2025-05-17) and plain Vite; keep CRXJS as the fallback only.
2. Phase 1: manual capture only. Permissions: `activeTab`, `scripting`, `storage`, `alarms`, `contextMenus`, and one `host_permissions` entry for the API origin. Surfaces: toolbar button, a `commands` shortcut, a context menu item. Extract with Readability, upload through a `storage.local` queue drained by an alarm. `"incognito": "not_allowed"`.
3. Phase 2: passive capture, off by default, enabled from a settings toggle that calls `permissions.request()` for `optional_host_permissions` and `webNavigation`, then registers the content script dynamically. Visible-tab dwell timer, blocklist plus a built-in sensitive-host list, `index` vs `store` modes, and Firefox `data_collection_permissions` for `browsingActivity` and `websiteContent`.
4. Send URL only (no text) for YouTube, Instagram and PDFs; never capture those passively.
5. Before building, get founder decisions on: (a) whether passive capture ships in v1; (b) the extension auth mechanism; (c) the privacy policy and store disclosures wording, since this is a contract and relationship matter. Then write the spec.

## Chrome Web Store submission mechanics (verified 2026-10-02)

Sources: developer.chrome.com/docs/webstore/* (fetched 2026-10-02), wxt.dev CLI reference, and the `wxt-dev/wxt` GitHub repo. Doc pages were fetched with WebFetch, which returns a model-written extract; treat quoted wording as a paraphrase to re-read on the live page before it goes into a client-facing document. Anything the primary pages did not state is marked UNCONFIRMED, even where a secondary source (blog, forum) states it confidently.

### 1. Developer registration fee

The dashboard registration page states only that a one-time fee exists, not the amount: "Before you can publish items on the Chrome Web Store, you must register as a CWS developer and pay a one-time registration fee" (https://developer.chrome.com/docs/webstore/register, page last updated 2024-02-13 per its own footer, read 2026-10-02). It does not state the dollar amount, payment method, or any promotion/waiver; it says the registration screen itself shows the live price. **UNCONFIRMED from a primary source in this session**: the amount is widely reported as a one-time US$5 (e.g. the original 2010 TechCrunch report on Google introducing it, and secondary 2020/2026 writeups), unchanged since introduction per those secondary sources, but no developer.chrome.com page fetched here states "$5". Confirm the live figure on the dashboard at https://chrome.google.com/webstore/devconsole before budgeting, since this is exactly the kind of number that goes stale.

### 2. Submission flow

**Manual dashboard flow** (https://developer.chrome.com/docs/webstore/publish, read 2026-10-02):

1. Sign in to the Developer Dashboard (chrome.google.com/webstore/devconsole) and click "Add new item".
2. Upload the extension ZIP. Max package size is 2 GB. New publisher accounts start capped at two published extensions.
3. Fill out, via the left-hand menu: **Package** (read-only view of the uploaded build), **Store Listing** (the public-facing listing), **Privacy** (single-purpose statement and data-use declarations, see Q4), **Distribution** (pricing, country availability, visibility), **Test Instructions** (credentials for reviewers if the extension needs login).
4. Click "Submit for Review". A dialog lets you choose auto-publish (goes live the moment review passes) or deferred publish (you get up to 30 days after review completion to publish manually).
5. States after submission: Pending Review → (Staged, if deferred) → Published. Email notifications for publish/rejection are opt-in on the Account page.

**`wxt submit` CLI** (https://wxt.dev/guide/essentials/publishing.html and https://wxt.dev/api/cli/wxt-submit, read 2026-10-02):

- `wxt zip` (and `wxt zip -b firefox`, `wxt zip -b edge`) builds the store-ready ZIP(s).
- `wxt submit` is documented as "an alias for `publish-browser-extension`" (https://wxt.dev/api/cli/wxt-submit), i.e. it is a thin CLI wrapper around the npm package `publish-browser-extension` (currently pinned to 5.1.0 per that page) — not `chrome-webstore-upload`, though it fills the same role for Chrome plus Firefox, Edge and Opera in one tool. The underlying package's own README was not readable in this session (npmjs.com returned HTTP 403 to WebFetch); treat the "what it calls internally for the Chrome Web Store API" detail as UNCONFIRMED beyond "it drives the CWS API", and read `node_modules/publish-browser-extension` directly once it's installed if the exact HTTP calls matter.
- `wxt submit init` is an interactive setup that writes the required secrets/options per target store.
- Chrome credentials, per the CLI reference: extension ID, the zip path, and a choice of CWS API version. Two auth shapes are documented — a newer one (API v2) using a **service account** (client email + private key), and a **deprecated** v1.1 one using OAuth **client ID, client secret and refresh token**. The v1.1 fields are explicitly flagged deprecated in the CLI reference.
- Firefox credentials: extension ID (`browser_specific_settings.gecko.id`), JWT issuer and JWT secret (AMO API keys), plus separate zip paths for the extension and its source bundle.
- Edge credentials: API key, client ID, product ID. Opera: package ID and session ID.
- A real, currently-open gotcha: `wxt-dev/wxt` issue #1462 (https://github.com/wxt-dev/wxt/issues/1462, filed 2025-02-27) reports that `wxt submit init`'s Chrome refresh-token flow is broken — Google deprecated the out-of-band (OOB) OAuth flow it relies on, and the page it sends you to now errors, linking to Google's own OOB-migration doc (developers.google.com/identity/protocols/oauth2/resources/oob-migration). The reported workaround is `npx chrome-webstore-upload-keys` to mint a working refresh token, or move straight to the non-deprecated service-account (API v2) path instead of the OAuth one. **Action for us**: when we actually wire CI, use the v2 service-account auth, not the documented-as-deprecated OAuth flow, and expect to hand-run `chrome-webstore-upload-keys` or the Google Cloud Console service-account setup rather than trusting `wxt submit init` end-to-end.
- `--dry-run` authenticates without uploading/submitting, useful for a first CI smoke test.

### 3. Listing assets required

From https://developer.chrome.com/docs/webstore/images (read 2026-10-02):

- **Icon**: 128×128 px PNG in the package itself (this is the manifest icon Chrome uses on the extensions page and store), with guidance that the actual artwork should read well with ~16 px of padding so it works on light and dark backgrounds.
- **Screenshots**: minimum 1, maximum 5. Preferred size 1280×800; 640×400 is also accepted. "Square corners, no padding (full bleed)" — no rounded corners or browser-chrome framing. Exact file format was not stated on the page as returned (examples shown were JPG); treat PNG/JPG both as safe, UNCONFIRMED whether the dashboard enforces one over the other.
- **Promotional tile images**: a **small tile (440×280)** is effectively required in practice — the page as returned states extensions without one are ranked/shown after ones that have it, i.e. not a hard upload-blocking requirement but a strong de-facto one. A **marquee (1400×560)** is explicitly optional. Promotional images go through their own review with a stated ~1-week SLA, separate from the main listing review.
- Screenshots can be locale-specific; promotional images currently cannot (per the page).

From https://developer.chrome.com/docs/webstore/best-listing and https://developer.chrome.com/docs/webstore/cws-dashboard-listing (read 2026-10-02):

- **Short description** ("item summary"): hard-capped at **132 characters**, plain text, no HTML.
- **Detailed description** ("item description"): no character limit is stated on either page read. Guidance is qualitative only (an overview paragraph plus a short feature list, no keyword stuffing, no superlative/competitor claims). Treat the absence of a number as UNCONFIRMED-as-unlimited, not confirmed-unlimited — the dashboard itself may still truncate or validate at submit time; check the live form.
- A blank description, missing icon, or missing screenshots causes rejection (quality-guidelines language referenced from the images/listing pages).

### 4. Privacy policy and data-use certification

From https://developer.chrome.com/docs/webstore/cws-dashboard-privacy (read 2026-10-02), the Privacy tab has, per the page:

- A **single-purpose description** field: free text stating the extension's one narrow purpose.
- **Permission justifications**: a free-text field per requested permission ("state the justification for each permission"); the page does not enumerate which specific permissions get a box (it does not name `activeTab`, `scripting`, `storage`, `alarms`, or `contextMenus` individually), so treat "every permission in the manifest gets a justification box" as the working assumption and confirm against the live form once the manifest is final. **UNCONFIRMED**: whether host-permission-free manifests (ours, in Phase 1) still trigger a justification box for each of the five listed permissions, or only for ones Google treats as sensitive.
- **Data-use certification**: two checkbox groups — one to disclose which categories of data the extension collects, a second to certify compliance with the disclosure (the "Limited Use" affirmations already captured in section 2 of this doc, from the Limited Use and user-data-FAQ pages). The page as returned did not enumerate the exact category checkboxes (e.g. "personally identifiable information", "web history", "user activity" as labelled in the dashboard); **UNCONFIRMED** verbatim checkbox labels — read the live Privacy tab once the dashboard account exists.
- **Privacy policy**: required as a link ("a link to the privacy policy for your extension"), and the page says the policy "should include how data is collected, used, and disclosed." Nothing on this page requires a specific clause-by-clause template beyond that — a static hosted page describing collection/use/disclosure reads as sufficient per this page's wording, matching what section 2 above already found via the user-data-FAQ and Limited Use pages (prominent in-UI disclosure is required in addition to the policy; the policy alone does not satisfy that separate requirement).
- Remote-code declaration: still required (MV3 forbids remotely hosted code, carried over from section 2 above); not re-verified in this pass beyond the existing citation.

### 5. Extension ID: store-assigned vs. pinned in advance

Precisely, from https://developer.chrome.com/docs/extensions/reference/manifest/key (read 2026-10-02): the manifest `"key"` field "maintains the unique ID of an extension, or theme when it is loaded during development." The documented workflow to get a stable ID _before_ a public submission is:

1. Upload the built ZIP to the Developer Dashboard once (as a new, unpublished item) — this is enough to make Chrome mint a keypair for that item.
2. Open the **Package** tab and click **View public key**; copy the text between the `BEGIN PUBLIC KEY` / `END PUBLIC KEY` markers, join it into one line.
3. Paste that string into `manifest.json`'s `"key"` field. Local unpacked loads (`chrome://extensions`, developer mode) then resolve to the same ID as the dashboard item, and subsequent re-uploads of that same item keep that ID.

So: the ID is not arbitrary and not chosen freely — it is always derived from a public key (an installed extension's ID is the first 32 characters of the SHA-256 hash of its public key, re-coded a–p). What a developer controls is _which_ keypair backs the extension, not the ID string itself. Two valid sequences follow from the docs read:

- Do nothing: Chrome/the Store generates a keypair (and therefore an ID) automatically at first upload.
- Pin it: generate or obtain a keypair up front, embed the public key via `"key"` in the manifest before the first dashboard upload, and the ID is then deterministic from that key on every subsequent build — including the very first Store submission, since the Store derives the ID from whatever key is present rather than minting a new one when the field is already populated. The Chrome Web Store docs (https://developer.chrome.com/docs/extensions/reference/manifest/key) do not explicitly restate "the Store also honors a pre-set key field on first submission" in the fetched extract — this is the standard, widely-documented mechanism (SHA-256 of the DER-encoded public key) rather than something stated verbatim on that page, so flag the "first submission" half as **UNCONFIRMED-on-this-exact-page**, confirm by generating a key pair, setting it in the manifest, uploading as a brand-new dashboard item, and checking that the resulting Item ID matches the locally-computed ID before relying on it for any pre-launch integration work (e.g. hardcoding the ID in OAuth redirect URLs or native-messaging allowlists).

Practical implication for us: if anything (API CORS allowlist, native messaging, `externally_connectable`) needs to know the extension ID before the store listing exists, generate the keypair first and pin it — do not wait for the Store to assign one.

### 6. Review time for a new, narrow-permission extension

From https://developer.chrome.com/docs/webstore/review-process (read 2026-10-02):

- Headline figure, unchanged from section 2 above: "For most extensions, review is completed within a few days, but it can take up to a few weeks." Contact support if it runs past three weeks.
- The page states all submissions "go through the same review system, regardless of the tenure of the developer or number of active users" — i.e. there is no officially stated separate SLA tier for new/unverified developers.
- It does list factors that **can lengthen** review, among them: new developer accounts, new extensions (no track record), and broad host permissions (`*://*/*`, `<all_urls>`) because of the data access they imply.
- Our manifest (`activeTab`, `scripting`, `storage`, `alarms`, `contextMenus`, no `host_permissions`) sits on the favorable side of every named factor except "new developer" / "new extension", which we cannot avoid for a first submission. **UNCONFIRMED**: the page gives no numeric SLA split for "narrow-permission new developer" as a specific bucket — there is no primary-source commitment to, say, "2 days" for this profile. Budget the stated "few days to a few weeks" range and do not promise a client a tighter number.

### Still open after this pass

- Exact current registration fee amount and payment flow (Q1) — only confirmable by opening the live dashboard registration screen, not from any developer.chrome.com page read in this session.
- Verbatim data-use-certification checkbox labels and whether every one of our five permissions gets its own justification box (Q4) — needs a live Privacy tab, not just the docs page.
- Whether the Store honors a manifest `"key"` already present on the very first dashboard upload, verbatim-confirmed on a developer.chrome.com page (Q5) — needs an empirical test (generate key, pin it, upload as new item, compare IDs) since the fetched page describes the mechanism but not that exact sequencing guarantee.
- `publish-browser-extension`'s exact internal HTTP calls to the Chrome Web Store API (Q2) — its README was not readable via WebFetch (403); read it from `node_modules` once installed, or via `npm view publish-browser-extension readme` / the GitHub repo if separate from the npm registry page.
