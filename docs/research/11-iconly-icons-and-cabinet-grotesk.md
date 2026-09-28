# Iconly free Bulk icons and Cabinet Grotesk: licences and how to ship them

Researched 2026-09-29 against primary sources: iconly.pro (licensing guide, terms, help centre, home page), the Iconly web app bundle and its public REST API (`https://prod.iconly.pro/api/v1`), github.com/jrgarciadev/react-iconly (cloned at `5cebf6e`), the npm registry (`react-iconly`, `@iconly/react`, `@iconly/api-client`), github.com/Iconly-Pro/iconly-react, help.figma.com, react.dev, the Next.js 16.3.3 docs in `node_modules/next/dist/docs`, the Fontshare API, and the Fontshare download zip for Cabinet Grotesk (unzipped in scratch space, not in the repo). This is input for discussion, not a decision. Anything inferred rather than read is marked **[inference]**.

Repo context: `gh repo view Divy97/second-brain --json visibility` returns `PRIVATE` today. Both questions depend on whether the repo stays private.

---

## Q1. Iconly free icons, Bulk style

### 1a. Licence terms for the free icons

There is no separate licence for the free tier. The relevant text is spread across three iconly.pro pages, and those pages do not fully agree.

**Terms of service** (https://iconly.pro/pages/terms, "Last update: Nov 23, 2023"):

- "Use of Iconly Pro: You may use Iconly Pro for personal or commercial projects, subject to the license agreement included with your purchase. You may not resell or distribute Iconly Pro or any part of it without our express permission."
- "Iconly Web App and Figma Plugin: Iconly Pro is completely free and you do not need to pay for using it. In the free version you have access to a limited number of icons …"
- "Intellectual Property: All icons included in Iconly Pro are the intellectual property of Iconly Pro. You may not copy, modify, or redistribute the icons without our express permission."

**Licensing guide** (https://iconly.pro/pages/licensing-guide):

- Personal and Team subscriptions are "not intended for commercial use". Only the Lifetime License covers "commercial products, websites, apps, and client projects". The guide does not say which tier the free icons fall under.
- "No attribution is required for paid subscriptions, but if you're using free assets, a proper credit is appreciated."
- "Direct reselling or redistribution of Iconly assets is not allowed. This includes: Selling or sharing the original files …"
- It does not mention open source or public repositories.

**Help-centre FAQ** (https://iconly.pro/help, and the same entry on https://iconly.pro/): "Can I use the icons for commercial projects? Absolutely. All icons can be used in personal and commercial projects". This contradicts the licensing guide's tiers.

What this means for the questions asked:

| Question                                | Answer from the sources                                                                                                                                                                                                                                                                               |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Free icons in a commercial web app?     | **Ambiguous.** The FAQ says yes. The licensing guide ties commercial use to the Lifetime License and says nothing explicit about free assets.                                                                                                                                                         |
| Free icons in an open-source app?       | **Not addressed** anywhere.                                                                                                                                                                                                                                                                           |
| Vendor the SVGs into a **public** repo? | **Not permitted without express permission.** The terms forbid "copy, modify, or redistribute", and the guide forbids "sharing the original files". A public repo shares the files. Recolouring to `currentColor` is also "modify".                                                                   |
| Vendor them into a **private** repo?    | **[inference]** Nothing is shared with third parties, so the redistribution clause is not triggered. The "copy, modify" wording is still literally broader than that, so it remains a grey area. The built app serves the SVGs to browsers either way, which is ordinary use of an icon in a website. |

### 1b. Downloading free icons without logging in

- The home page links "Free icons" to `https://web.iconly.pro/?is_free=1` and advertises "2,500+ high-quality icons" (https://iconly.pro/).
- The web app's public API answers without authentication. `GET https://prod.iconly.pro/api/v1/icons?is_free=1` returned HTTP 200 with `total_count: 2037`. Each icon carries a signed `svg_url` and a `png_url`, both fetchable with no token (observed 2026-09-29). The endpoint shape comes from the web-app bundle `https://web.iconly.pro/assets/index-edaf9e21.js` (`Request$1.call(\`/icons?${…is_free…}\`)`).
- Styles from `GET /icons/styles`: Bold (1), **Bulk (3)**, Light (4), Outline (5), Two-Tone (6), Broken (9). Types from `GET /icons/types`: regular (1), sharp (2), curved (3).
- Free **Bulk** counts: regular 100, sharp 125, curved 99, so 324 in total (`/icons?is_free=1&style_id=3&type_id=N`).
- Formats: the API returns SVG and PNG. The web app's code panel also offers **JSX** and **TSX** tabs (bundle: `name:"jsx",children:"JSX"`, `name:"tsx",children:"TSX"`). The help centre lists "SVG, PNG, Lottie, etc." for plans (https://iconly.pro/help).
- **Not verified:** whether the web-app UI puts a sign-in prompt in front of the download button. The browser tool was unavailable. The bundle has `/login` and `/register` routes but no string that obviously gates free downloads. The owner should confirm this by clicking through once.

SVG shape as served (Bulk regular "Search"): `fill="#000000"` on the group, with the secondary path at `opacity="0.400000006"`. Replacing the fill with `currentColor` yields a Bulk icon that follows text colour. "Home" in Bulk is a single path with no 40% layer, so it looks the same as Bold. react-iconly reflects this too (see 1c).

**Free Bulk (regular) icon names**, as returned by the API (`/icons?is_free=1&style_id=3&type_id=1&page_size=100`):

Activity, Add User, Arrow - Down, Arrow - Down 2, Arrow - Down Circle, Arrow - Down Square, Arrow - Left, Arrow - Left 2, Arrow - Left Circle, Arrow - Left Square, Arrow - Right, Arrow - Right 2, Arrow - Right Circle, Arrow - Right Square, Arrow - Up, Arrow - Up 2, Arrow - Up Circle, Arrow - Up Square, Arrow Down, Arrow Left, Arrow Right, Arrow Up, Bag, Bag 2, Bookmark, Buy, Calendar, Call, Call Missed, Call Silent, Calling, Camera, Category, Chart, Chat, Close Square, Danger, Delete, Discount, Discovery, Document, Download, Edit, Edit Square, Filter, Filter 2, Folder, Game, Graph, Heart, Hide, Home, Image, Image 2, Info Circle, Info Square, Location, Lock, Login, Logout, Message, More Circle, More Square, Notification, Paper, Paper Download, Paper Fail, Paper Negative, Paper Plus, Paper Upload, Password, Play, Plus, Profile, Scan, Search, Send, Setting, Shield Done, Shield Fail, Show, Star, Swap, Tick Square, Ticket, Ticket Star, Time Circle, Time Square, Unlock, Upload, User, Video, Voice, Voice 2, Volume Down, Volume Off, Volume Up, Wallet, Work, user.

This is the Iconly 2 "essential" set. It matches react-iconly's component list almost one-to-one.

### 1c. `react-iconly` (jrgarciadev)

| Item              | Finding                                                                                                                                                                                                                           | Source                                                                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Set wrapped       | "Based on Iconly Essential Icons Iconly v2" (links to ui8.net/piqodesign)                                                                                                                                                         | [README](https://github.com/jrgarciadev/react-iconly#readme)                                                                                 |
| Icon count        | 101 components in `src/Icons/`: Activity … Work                                                                                                                                                                                   | [src/Icons](https://github.com/jrgarciadev/react-iconly/tree/master/src/Icons)                                                               |
| Styles            | Bold, **Bulk**, Light Border, Broken, Two Tone, Curved. The `set` prop is `'light' \| 'bold' \| 'two-tone' \| 'bulk' \| 'broken' \| 'curved'`                                                                                     | README; `dist/react-iconly.d.ts`                                                                                                             |
| Bulk coverage     | 99 of 101 icons have their own `Bulk` drawing. `Home` and `Call` fall back to `<Bold />` for `case 'bulk'`                                                                                                                        | `src/Icons/Home.js:81-82`, `src/Icons/Call.js`                                                                                               |
| `currentColor`    | Yes. `primaryColor` defaults to `'currentColor'`, secondary defaults to primary, and secondary opacity is `0.4` when the colours match                                                                                            | [`src/lib/withIcon.js`](https://github.com/jrgarciadev/react-iconly/blob/master/src/lib/withIcon.js), `src/lib/utils.js` (`getOpacity`)      |
| Licence           | MIT, "Copyright (c) 2017 Junior García". This covers the wrapper code. **Nothing in the repo grants rights to the Iconly artwork**, whose path data is embedded in every component. Iconly's terms claim the icons as its IP (1a) | [LICENSE](https://github.com/jrgarciadev/react-iconly/blob/master/LICENSE)                                                                   |
| Last release      | `2.2.10`, published 2023-04-12T00:36:16Z (npm). GitHub release `v2.2.10` 2023-04-12                                                                                                                                               | `npm view react-iconly time`; [releases](https://github.com/jrgarciadev/react-iconly/releases)                                               |
| React 19 peer     | `"react": ">=16.8.0"`, so installation accepts 19                                                                                                                                                                                 | `npm view react-iconly@2.2.10 peerDependencies`                                                                                              |
| React 19 runtime  | `withIcon` is a **class component** that uses `static contextType`, which React 19 still supports. `propTypes` are "silently ignored" in React 19                                                                                 | `src/lib/withIcon.js`; [React 19 upgrade guide](https://react.dev/blog/2024/04/25/react-19-upgrade-guide)                                    |
| Server Components | The dist has **no `"use client"`** and calls `createContext` at module top level. Next.js documents that such a package errors when used directly in a Server Component and must be wrapped in your own Client Component          | `dist/index.modern.js`; `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` §"Third-party components" |
| Tree-shaking      | Issue #31 "Improve build scripts to allow for tree-shaking" is open                                                                                                                                                               | [issues](https://github.com/jrgarciadev/react-iconly/issues/31)                                                                              |
| Maintained        | **No.** The repo is **archived** (`archived: true`) and was last pushed 2023-04-12                                                                                                                                                | `gh api repos/jrgarciadev/react-iconly`                                                                                                      |

### 1d. Official Iconly distributions

- **`@iconly/react` + `@iconly/api-client`**, v1.0.1, published 2026-07-12 by npm user `iconlypro <info@iconly.pro>`, from github.com/Iconly-Pro/iconly-react (the only repo in the `Iconly-Pro` org). Both packages are MIT. The GitHub repo has no licence file (`license: null`).
  - It is a **runtime API client**, not a bundled icon set. You "Create an API key at Iconly Settings → Developer" and render `<IconlyIcon id={123} />`. For Server Components it provides `getIconSvg` from `@iconly/react/server`.
  - "Free assets work without a subscription." Premium gating happens server-side.
  - Peers: `react >=18`, `@tanstack/react-query >=4`, `lottie-web >=5`. Dependency: `isomorphic-dompurify`.
  - It still needs an Iconly account to issue the API key. **Not verified:** whether a free account can create a key.
  - Source: https://github.com/Iconly-Pro/iconly-react#readme and `npm view @iconly/react`.
- **Figma plugin:** https://www.figma.com/community/plugin/861001888228800074/iconly-pro (linked from iconly.pro).
- **Figma Community file** "Iconly V3.0 Free + Iconly Pro", https://www.figma.com/community/file/876509330914541878. It returned HTTP 403 to automated fetches, so its publisher and licence badge were **not verified**. Figma's own rule: "Free files are published under an Attribution 4.0 International (CC BY 4.0) license", and "Creators may choose to license a file under additional license types in addition to CC by 4.0" (https://help.figma.com/hc/en-us/articles/360042296374-Figma-Community-copyright-and-licensing). The Iconly help centre separately says "we don't provide the original Figma source file" for the subscription library (https://iconly.pro/help).
- **Official GitHub icon repo or official static-SVG npm package:** none found. The `Iconly-Pro` org has only `iconly-react`. All other npm `*iconly*` packages (`react-iconly`, `vue-iconly`, `iconly-unofficial-json`, …) come from third parties (`npm search iconly`).

### Q1 recommendation

No route both vendors Iconly SVGs into a **public** repo and is clearly licence-safe today. Iconly's terms forbid copying, modifying or redistributing without express permission, and react-iconly's MIT licence does not cover the artwork.

Ranked options:

1. **Get written permission, then own the components.** Email Iconly (npm lists `info@iconly.pro` as the maintainer). Ask for express permission to include the ~100 free Bulk SVGs, recoloured to `currentColor`, in this repo, and ask whether it may be public. With a yes:
   - Fetch the SVGs from the free API (1b).
   - Generate one small typed `.tsx` component per icon: a `SVGProps<SVGSVGElement>` spread, `fill="currentColor"` on the primary path, `opacity={0.4}` on the secondary path, and `aria-hidden` by default.
   - Keep a `LICENSE-ICONS` note that records the permission and credit.

   No runtime dependency, works in Server Components, fully tree-shaken. **[inference]** This is the cleanest technical shape.

2. **If the Figma Community file is confirmed as published by Iconly/Piqo with CC BY 4.0**, export the free Bulk icons from it. CC BY allows adaptation and commercial redistribution with attribution, so the same generated components could live in a public repo, with credit. The owner must open the file, confirm its publisher and licence badge, and screenshot the licence for the ADR. **[inference]** A CC BY grant on that file would govern its contents despite the site-wide ToS, but that tension is worth raising with Iconly anyway.
3. **Official `@iconly/react`** with an API key, fetched server-side. It is licence-clean because it is Iconly's own channel and nothing is vendored. However, it adds a runtime network dependency, react-query and lottie-web peers, and a secret, and it identifies icons by numeric id rather than typed named components. Not recommended for UI chrome.
4. **Do not use `react-iconly`.** It is archived, not RSC-safe without a wrapper, has no tree-shaking, and does not resolve the artwork licence.

---

## Q2. Cabinet Grotesk (Indian Type Foundry, Fontshare)

### Licence

- The Fontshare API reports `"license_type": "itf_ffl"`, publisher "Indian Type Foundry", version `"1.0"` (`GET https://api.fontshare.com/v2/fonts?q=cabinet`).
- The zip from https://api.fontshare.com/v2/fonts/download/cabinet-grotesk (HTTP 200, 1,261,849 bytes, `application/zip`) contains `CabinetGrotesk_Complete/License/FFL.txt`: **"ITF Free Font License (FFL) Version 2.0 - 17 Aug 2026"**.

Key clauses (FFL.txt):

- **01 Grant:** use is allowed "for personal or commercial purposes, free of charge and for an unlimited period of time", in any media including websites and apps.
- **01 Self-hosting, explicitly allowed:** "You may self-host the Font Software on your own servers or infrastructure for use on your own websites and applications, including through standard webfont technologies such as CSS @font-face. Self-hosting by end users is permitted and recommended … Use of the Fontshare API is optional …"
- **01 Credit** is optional: "You may, but are not required to, identify or credit Indian Type Foundry or Fontshare …"
- **02 Redistribution is forbidden.** The files may not be "distributed … given away or otherwise made available to any other person or entity … This includes distributing the Font Software through another font website, font library, marketplace, **repository**, download service … **publicly accessible servers**, file-sharing services …". It ends: "nothing in this Section 02 restricts the self-hosting, embedding or other use of the Font Software by the Licensee for the Licensee's own websites, applications …"
- **02 Modification is forbidden**, including "subsetting, format conversion, or altering font names … or other metadata". **05** forbids derivative works without written consent.
- **02** also forbids offering the font as a selectable font for third-party users to create their own content. That does not apply here.

What this means:

| Question                                      | Answer                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Self-host woff2 in the web app?               | **Yes**, explicitly permitted (§01).                                                                                                                                                                                                                                                                                                                                                    |
| Commit the woff2 to a **public** GitHub repo? | **No.** A public repo is a "repository" or "publicly accessible server" that makes the files downloadable by anyone (§02).                                                                                                                                                                                                                                                              |
| Commit to a **private** repo?                 | **[inference]** Permitted. It is storage for the licensee's own use (§01 allows installing, storing, copying, and "a reasonable number of backup copies"). Nothing is made available to third parties.                                                                                                                                                                                  |
| Use the files as-is with `next/font/local`?   | Yes, provided they are not subset or converted. `next/font/local` has no `subsets` option ("font/local … ✗" for `subsets` in `node_modules/next/dist/docs/01-app/03-api-reference/02-components/font.md`). **[inference]** It serves the supplied file unchanged under a hashed URL, which is self-hosting, not modification. Do not run a subsetter or woff2 converter over the files. |

### Weights and files

- Fontshare lists these styles (API `styles`): Thin 100, Extralight 200, Light 300, Regular 400, Medium 500, Bold 700, Extrabold 800, Black 900, plus **Variable**. There is **no static 600 and no italics**.
- The variable axis is `wght` 100–900, default 580 (API `axes`). The bundled `Fonts/WEB/README.md` says the same: "'wght' (range from 100.0 to 900.0".
- **The zip includes a variable font.** `Fonts/WEB/fonts/CabinetGrotesk-Variable.woff2` (41,860 B), plus `.woff`, `.ttf`, `.eot`, and `Fonts/TTF/CabinetGrotesk-Variable.ttf`. The supplied CSS declares it with `font-weight: 100 900`.
- Each static woff2 is about 20 KB. The rest of the zip: `Fonts/OTF/*.otf` (8 statics), `Fonts/WEB/css/cabinet-grotesk.css`, `Fonts/WEB/README.md`, `License/FFL.txt`.

### Q2 recommendation

Self-host only `CabinetGrotesk-Variable.woff2`, one file covering 100–900, including the 600 that has no static file. Load it through `next/font/local` with `weight: '100 900'` and a CSS variable.

- **While the repo is private**, commit the file together with `FFL.txt`. **[inference]** This is permitted.
- **If the repo will ever be public**, do not commit it. Instead, fetch the zip from the official download URL during CI/build and extract that one file. Fontshare's CSS API is also allowed but "at its own risk" (§06), and it adds a third-party request.

---

## Blockers for the owner

1. **Iconly permission.** Email Iconly for express written permission to vendor and recolour the free Bulk SVGs, and to make the repo public. Alternatively, open the Figma Community file 876509330914541878 and confirm that its publisher is Iconly/Piqo and that it carries CC BY 4.0. Without one of these, vendoring is not clearly allowed by Iconly's terms.
2. **Free-tier commercial use.** Iconly's FAQ ("All icons can be used in personal and commercial projects") contradicts the licensing guide. Ask the same email to confirm.
3. **Web-app download without login.** The free API needs no login. The UI's behaviour is unverified: click a free icon's download button once while logged out.
4. **Repo visibility.** The repo is private today. If it goes public, both the Cabinet Grotesk woff2 and any Iconly SVGs must leave the repo (fetch at build instead) unless permission is granted.
