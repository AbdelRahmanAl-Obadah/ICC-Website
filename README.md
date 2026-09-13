# ICC — Innovation & Computing Club Academic Platform

A responsive academic resources platform for the **Innovation & Computing Club**, a student organization at the **German Jordanian University (GJU)**. The platform will eventually host every free elective, university/college requirement, major curriculum, semester plan and subject GJU computing students need — searchable, in one place.

This repository is **PHASE 1 of 5**. See [What was implemented](#what-was-implemented-in-phase-1) and [What's next](#what-intentionally-remains-for-phase-2) below.

---

## Technology used

- **HTML5** — semantic markup, one file per public page
- **CSS3** — hand-written, no framework (no Bootstrap/Tailwind)
- **Vanilla JavaScript (ES6+)** — no React/Vue/Angular/jQuery
- **Firebase** (modular v10 SDK, loaded via CDN as ES modules) — scaffolded, not yet active

No build step, no bundler, no `npm install` required. Every page is plain static HTML/CSS/JS and can be opened directly or served by any static host.

---

## Folder structure

```
/
├── index.html              Homepage
├── majors.html              Majors grid
├── major.html                Reusable major template (major.html?id=...)
├── requirements.html         Free Electives / University / College requirements
├── search.html                Search interface (not yet wired to real data)
│
├── admin/                     Reserved for the Phase 3 Admin Panel (empty)
│
├── css/
│   ├── style.css               Design tokens, layout primitives, nav, footer
│   ├── components.css          Cards, hero, search box, curriculum, subjects
│   └── responsive.css          Breakpoints (tablet / mobile / small phone)
│
├── js/
│   ├── firebase-config.js      Firebase project config (placeholder values)
│   ├── firebase-init.js        Initializes Firebase app/db/auth (guarded)
│   ├── firestore.js            Firestore data-access layer (stubs, Phase 2+)
│   ├── auth.js                 Auth layer (stubs, Phase 3)
│   ├── language.js             i18n: translation dictionary + EN/AR switch
│   ├── majors.js                Demo major data + rendering
│   ├── subjects.js              Demo semester/subject data + rendering
│   └── ui.js                    Mobile nav, lightbox, loading/empty/error states
│
├── assets/
│   ├── images/                  Placeholder curriculum tree SVG
│   ├── icons/                   (reserved)
│   └── fonts/                   (reserved — see "Adding the Academy font")
│
├── firestore.rules             Baseline security rules (read-only public data)
├── .gitignore
└── README.md
```

---

## How to run locally

This is a static site — any static file server works. For example, from the project root:

```bash
# Python
python3 -m http.server 5500

# or Node
npx serve .
```

Then open `http://localhost:5500`. Opening `index.html` directly by double-clicking also works for browsing, though `type="module"` Firebase imports and `fetch`-based features generally behave better served over HTTP.

---

## How to configure Firebase

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com).
2. Register a Web App and copy the config object.
3. Paste the real values into `js/firebase-config.js`, replacing every `"YOUR_..."` placeholder.
4. `js/firebase-init.js` detects placeholder values and skips initialization automatically — once real values are in place, Firebase initializes with no other code changes needed.
5. Deploy `firestore.rules` when the project is connected: `firebase deploy --only firestore:rules` (requires the Firebase CLI). The current rules are a **safe, read-only-for-public-data baseline** — they intentionally deny all writes until Phase 3 adds admin authorization. See the comments inside `firestore.rules` for the exact TODOs.

No real credentials are committed to this repository.

---

## How the language system works

- All translatable UI text lives in a single dictionary in `js/language.js` (`translations.en` / `translations.ar`).
- Elements opt in with `data-i18n="key"` (text content) or `data-i18n-attr="attr:key"` (e.g. a placeholder or aria-label).
- The selected language persists in `localStorage` under `icc-lang` and is re-applied on every page load, so navigating between pages keeps the language consistent.
- Switching language sets `<html lang>` and `<html dir>` (`rtl` for Arabic, `ltr` for English) so layout mirrors correctly and assistive tech gets accurate metadata.
- `js/majors.js` and `js/subjects.js` listen for a custom `icc:languagechange` event to re-render dynamically-built content (major cards, subject cards) in the new language without a page reload.

To add a new string: add the key to **both** language objects in `js/language.js`, then reference it with `data-i18n` (or `data-i18n-attr`) in the markup.

---

## How `major.html` is intended to work

`major.html` is the **single reusable template for every major** — there is intentionally no `computer-science.html`, `cyber-security.html`, etc.

- The major is selected via a query string: `major.html?id=computer-science`.
- `js/majors.js` → `getMajorIdFromURL()` reads the `id` (or `major`) query param.
- In Phase 1, `js/majors.js` resolves that id against local demo data (`DEMO_MAJORS`) and `js/subjects.js` renders a demo semester/subject tree (`DEMO_YEARS`) — the same demo curriculum is shown for every id, clearly labeled as demo data.
- **Phase 2+ integration point:** replace the demo lookups (`getDemoMajorById`, `getDemoYears`) with real calls to `fetchMajorById(id)` / `fetchSemestersForMajor(id)` from `js/firestore.js`. The render functions (`renderMajorHeader`, `renderSemesterPlan`) already accept the same data shape, so the HTML and CSS do not need to change — only the data source.

---

## Brand assets used

- **Logo:** `assets/images/icc-logo-lockup.png` (light background, used in the navbar) and `icc-logo-lockup-dark.png` (used in the black footer), both cropped from the club's official brand sheet. `icc-logo-icon.png` is the mark alone, used as the favicon.
- **Colors:** taken directly from the brand sheet — Primary Blue `#389FFF`, Light Gray `#D8DCDE`, White `#FFFFFF`, Black `#000000` — set as CSS custom properties in `css/style.css` (`--icc-blue`, `--icc-gray`, etc.).

## Adding the Academy font

The design uses `Academy` — the club's real brand typeface — as the primary display font (`--font-display` in `css/style.css`). The actual Academy font file isn't included in this project (it's a licensed/purchased typeface, not something to bundle without a license), so until it's added, headings render in **Orbitron** (loaded from Google Fonts in every page's `<head>`) as the closest freely-licensed stand-in — a squared-off, geometric display face in the same visual family as Academy.

To swap in the real font once you have a licensed copy:

1. Drop the font files (e.g. `.woff2`) into `assets/fonts/`.
2. Add an `@font-face` block at the top of `css/style.css` pointing at those files, with `font-family: 'Academy'`.
3. No other CSS changes are needed — every heading, nav item and button already references `var(--font-display)`, which lists `'Academy'` first; the browser will use it automatically the moment the `@font-face` resolves, and Orbitron simply stops being used.
4. Optional: once Academy is in place, you can remove the Orbitron `<link>` tags from each page's `<head>` to save a request.

Arabic text automatically falls back to `--font-arabic` (`IBM Plex Sans Arabic`, loaded from Google Fonts, with `Tahoma` as a last-resort system fallback) via `html[dir="rtl"] body`, independent of the Academy/Orbitron fallback chain.

---

## What was implemented in Phase 1

- Full responsive public site: `index.html`, `majors.html`, `requirements.html`, `search.html`, and the reusable `major.html` template
- Mobile-first responsive design (mobile / tablet / laptop / desktop), tested breakpoints in `css/responsive.css`
- Complete EN/AR language system with persisted preference, RTL/LTR switching, and a reusable translation dictionary
- Reusable, accessible navbar (desktop links + animated mobile hamburger menu) and footer, consistent across all pages
- Homepage: hero, quick-access cards, featured majors (rendered from demo data), search entry point, about section
- Requirements page with three clearly separated sections (Free Electives / University / College), structured so Firestore data can replace placeholders without markup changes
- Majors grid, all cards routing through the single `major.html` template
- Major template: header, curriculum image area (responsive, click-to-enlarge lightbox modal), and a full semester/subject tree UI driven by demo data
- Firebase foundation: modular SDK wiring (`firebase-config.js`, `firebase-init.js`), with `firestore.js` and `auth.js` stubbed out to the exact function signatures later phases will implement
- Baseline `firestore.rules`: public data readable, all writes denied until Phase 3 admin auth lands
- Accessibility: semantic HTML, labeled controls, alt text, visible focus states, keyboard-operable mobile menu and lightbox, `prefers-reduced-motion` support
- Basic SEO: per-page `<title>`/meta description, semantic structure, dynamic title handling in `major.html`
- Reusable loading / empty / error state components (see `search.html` and `.state` classes in `components.css`)

## What intentionally remains for Phase 2

- Firebase Authentication (email/password, Google Sign-In) — `js/auth.js` is stubbed
- Admin authorization and the Admin Panel UI (`admin/` is reserved and empty)
- Complete Firestore CRUD for Majors, Semesters, Subjects and Requirements — `js/firestore.js` functions currently `throw` with a clear "not implemented until Phase X" message
- Real global search across majors/subjects/requirements — `search.html` UI exists, `searchPlatform()` is stubbed
- Google Drive integration for curriculum tree images (currently a placeholder SVG)
- Final Firestore schema and production security rules (current rules are a safe read-only baseline, not final)
- Real GJU academic data — everything currently shown is explicitly labeled demo/placeholder content

## Important instructions for the next developer/AI

- **Do not rebuild this project from scratch.** Modify the existing files in place.
- **Preserve:** the design system in `css/style.css` (CSS custom properties), the folder structure, the language system, the responsive breakpoints, and the Firebase module boundaries (`firebase-init.js` / `firestore.js` / `auth.js`).
- **`major.html` must stay a single reusable template.** Never create a separate HTML file per major.
- When wiring real Firestore data, swap the demo-data functions in `js/majors.js` / `js/subjects.js` for the corresponding functions in `js/firestore.js` — the rendering functions and markup are already shaped to accept that data.
- Update `firestore.rules` alongside any new collection, and keep writes denied until admin authorization exists.

---

## Phase 2 update — design polish, GPA calculator, ICC Admins page

This pass focused on three additive changes on top of the Phase 1 foundation.
No existing HTML structure, branding, colors, language system, or Firebase
setup was removed or redesigned — everything below is new files plus small,
targeted insertions (a nav link, a footer link, a stylesheet `<link>`).

**1. Visual polish + animations (`css/animations.css`, addition to `js/ui.js`)**
- Reveal-on-scroll for sections marked `data-reveal` (IntersectionObserver in
  `initRevealOnScroll()`), with a graceful fallback and full respect for
  `prefers-reduced-motion`.
- Hover lift + shadow on cards, an animated nav underline, a subtle shine
  sweep on primary buttons, and a soft animated gradient wash behind the hero.
- Purely additive: no existing selectors were overridden, only extended.

**2. GPA Calculator (`gpa-calculator.html`, `css/gpa.css`, `js/gpa.js`)**
- Client-side only, no Firestore dependency, uses ICC's local 4.2 grading
  scale (A+ = 4.2 down to F = 0.0 — see the `GPA_SCALE` table in `js/gpa.js`).
- Add/remove course rows, live-calculated semester GPA, and an optional
  "include previous GPA" toggle to estimate a new cumulative GPA.
- Fully bilingual via the existing `data-i18n` system; clearly labeled as an
  unofficial, student-built estimate.

**3. ICC Admins page (`admins.html`, `css/admins.css`)**
- A public directory of the students who maintain the platform. This is
  display-only demo content — it is **not** an authentication system.
  Real admin accounts, roles and permissions are still planned for Phase 3
  (Firebase Authentication + authorization), as originally scoped.

Both new pages were added to the desktop nav, mobile nav, and footer across
every existing page, and follow the same header/footer/language markup
pattern as the rest of the site so they inherit RTL/LTR and i18n for free.

The full Phase 2 Firestore data architecture described in the original
Phase 2 brief (dynamic majors/semesters/subjects/requirements, `js/firestore.js`
implementation, `firestore.indexes.json`, seed data, etc.) has **not** been
built in this pass — this update only covers the design/animation/GPA/admins
request. That Firestore work is still open and can be picked up next using
the architecture already documented above.

---

## Phase 3 — Admin panel and authentication

**THIS PROJECT IS PHASE 3 OF 5.** Phase 3 retains every public page and adds a protected, responsive admin workspace at `/admin/login.html`.

- Firebase Email/Password and Google sign-in are implemented in `js/auth.js`.
- Access requires an authenticated account **and** `admins/{uid}` with `role: "admin"` and `active: true`. Unauthorized users are immediately signed out.
- The admin area includes dashboard metrics, CRUD management for majors, semesters, subjects and requirements, duplicate/status/delete safeguards, content forms, and safe public settings.
- `firestore.rules` enforces the same authorization on the server. The `admins` collection is not client-writable, preventing self-escalation.
- `firestore.indexes.json` documents the composite indexes used by ordered major-semester and requirement views.

### Secure first-admin bootstrap

There is intentionally no public “make me admin” flow. In Firebase Console, first create the user in **Authentication**, copy their UID, then manually create `admins/{UID}` in Firestore:

```json
{ "email": "admin@example.com", "displayName": "Admin", "role": "admin", "active": true }
```

Add `createdAt` and `updatedAt` using Firestore server timestamps. Deploy the included rules before using production data. Enable Email/Password and Google providers in Firebase Authentication, then test an authorized user and a normal account (which must be rejected).

### Phase 4 handoff

Not implemented yet: public global search, advanced public filtering, Google Drive upload/integration workflow, and final public UX/optimization refinements. Phase 4 must start from `ICC-Website-Phase-3.zip` and preserve the existing application.
