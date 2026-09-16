# ICC — Innovation & Computing Club Academic Platform

A responsive academic resources platform for the **Innovation & Computing Club**, a student organization at the **Jordan University of Science and Technology (JUST)**. The platform will eventually host every free elective, university/college requirement, major curriculum, semester plan and subject JUST computing students need — searchable, in one place.

This repository is **PHASE 4B of 5 — polish and launch-readiness pass**, on top of the Firestore-driven public site (Phase 3A), the secured Admin Panel (Phase 3B, see [Bootstrapping the first admin](#bootstrapping-the-first-admin) if you haven't set that up yet) and global search + Google Drive images (Phase 4A). See [What was implemented in Phase 4B](#what-was-implemented-in-phase-4b) below, and [Manual QA still required before deploy](#manual-qa-still-required-before-deploy) for what a human still needs to click through before this goes live.

---

## Technology used

- **HTML5** — semantic markup, one file per public page
- **CSS3** — hand-written, no framework (no Bootstrap/Tailwind)
- **Vanilla JavaScript (ES6+)** — no React/Vue/Angular/jQuery
- **Firebase** (modular v10 SDK, loaded via CDN as ES modules) — Firestore (Phase 3A) + Authentication (Phase 3B), active once you add real config

No build step, no bundler, no `npm install` required. Every page is plain static HTML/CSS/JS and can be opened directly or served by any static host.

---

## Folder structure

```
/
├── index.html              Homepage
├── majors.html              Majors grid
├── major.html                Reusable major template (major.html?id=...)
├── requirements.html         Free Electives / University / College requirements
├── search.html                Global search — majors, subjects & requirements (Phase 4A)
├── signup.html                 Public sign-up / sign-in / account status (Phase 5)
│
├── admin/                      Admin Panel (role-based since Phase 5)
│   ├── login.html                Email/password + Google sign-in, password reset
│   ├── index.html                 Dashboard: real counts + quick-add shortcuts
│   ├── majors.html                 Majors CRUD (create/edit/activate/delete/duplicate/reorder;
│   │                                curriculum image field now previews Drive/direct URLs — 4A)
│   ├── semesters.html               Semesters CRUD, scoped to a selected major
│   ├── subjects.html                 Subjects CRUD, scoped to major + semester
│   ├── requirements.html              Requirements CRUD, filterable by category
│   ├── content.html                    Site copy editor (hero/about/footer, EN+AR)
│   ├── settings.html                    Global site settings editor
│   ├── users.html                        Users, admins, approvals, permission editor (Phase 5)
│   ├── audit.html                         Administrator activity log (Phase 5)
│   ├── tree.html                           Dynamic academic hierarchy (Phase 5)
│   ├── prerequisites.html                   Structured subject prerequisites (Phase 5)
│   ├── appearance.html                       Colours, typography, banner (Phase 5)
│   └── homepage.html                          Homepage blocks editor (Phase 5)
│
├── css/
│   ├── style.css               Design tokens, layout primitives, nav, footer
│   ├── components.css          Cards, hero, search box/results, curriculum, subjects
│   ├── responsive.css          Breakpoints (tablet / mobile / small phone)
│   ├── auth.css                Sign-up/sign-in pages, account status, banner, public tree (5)
│   └── admin.css               Admin Panel layout: sidebar, tables, forms, modals, toasts,
│                                 curriculum image preview (Phase 4A)
│
├── js/
│   ├── firebase-config.js      Firebase project config (placeholder values)
│   ├── firebase-init.js        Initializes Firebase app/db/auth (guarded)
│   ├── firestore.js            Firestore data-access layer — public reads (3A) + admin CRUD (3B)
│   ├── auth.js                 Firebase Auth + profile resolution, sign-up, legacy bridge (5)
│   ├── permissions.js          Permission catalog + role/permission predicates (Phase 5)
│   ├── signup.js               signup.html logic — register, sign in, account status (Phase 5)
│   ├── appearance.js           Applies settings/appearance to the public site (Phase 5)
│   ├── tree.js                 Renders the admin-built academic tree publicly (Phase 5)
│   ├── language.js             i18n: translation dictionary + EN/AR switch (public + admin strings)
│   ├── majors.js                Firestore-driven majors grid + major header (module);
│   │                              resolves Drive/direct curriculum images (Phase 4A)
│   ├── subjects.js              Firestore-driven semester/subject tree (module)
│   ├── requirements.js          Firestore-driven requirements page (module)
│   ├── search.js                Global search index + search.html controller (Phase 4A)
│   ├── drive-utils.js           normalizeDriveImageUrl() — Google Drive sharing → direct URL (4A)
│   ├── ui.js                    Mobile nav, lightbox (+ double-click/tap zoom, 4A), loading/empty/error states
│   ├── site-content.js          Applies admin-edited siteContent copy over the i18n defaults
│   └── admin/                   Admin Panel logic
│       ├── admin-guard.js          Route protection: auth + PER-PAGE permission check (5)
│       ├── admin-nav.js            Builds the sidebar from the viewer's permissions (5)
│       ├── audit-log.js            logAction() + before/after diffing (Phase 5)
│       ├── admin-ui.js             Shared toasts, modal, confirm dialog, validation helpers
│       ├── login.js                admin/login.html logic
│       ├── dashboard.js            admin/index.html logic
│       ├── majors-admin.js         admin/majors.html logic (+ curriculum image preview — 4A)
│       ├── semesters-admin.js      admin/semesters.html logic
│       ├── subjects-admin.js       admin/subjects.html logic
│       ├── requirements-admin.js   admin/requirements.html logic
│       ├── content-admin.js        admin/content.html logic
│       ├── settings-admin.js       admin/settings.html logic
│       ├── users-admin.js          admin/users.html logic (Phase 5)
│       ├── audit-admin.js          admin/audit.html logic (Phase 5)
│       ├── tree-admin.js           admin/tree.html logic (Phase 5)
│       ├── prerequisites-admin.js  admin/prerequisites.html logic (Phase 5)
│       ├── appearance-admin.js     admin/appearance.html logic (Phase 5)
│       └── homepage-admin.js       admin/homepage.html logic (Phase 5)
│
├── assets/
│   ├── images/                  Placeholder curriculum tree SVG
│   ├── icons/                   (reserved)
│   └── fonts/                   (reserved — see "Adding the Academy font")
│
├── firestore.rules             Security rules — THE authorization boundary. Public reads see
│                                 active docs only; every admin write is checked against the
│                                 writer's granular permissions in users/{uid} (Phase 5)
├── firestore.indexes.json      Composite indexes (incl. auditLogs + users — Phase 5)
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
2. Enable **Cloud Firestore** in the project (Build → Firestore Database → Create database). Start in production mode — this repo ships its own security rules.
3. Register a Web App (Project settings → General → Your apps → Add app → Web) and copy the config object.
4. Paste the real values into `js/firebase-config.js`, replacing every `"YOUR_..."` placeholder.
5. `js/firebase-init.js` detects placeholder values and skips initialization automatically. Once real values are in place, Firebase initializes with no other code changes needed, and every `getX()` function in `js/firestore.js` starts performing real reads.
6. Deploy `firestore.rules` when the project is connected: `firebase deploy --only firestore:rules` (requires the Firebase CLI, `firebase init` once to link the project). The rules allow public **read** access only to documents with `active == true` in the academic collections, and deny **all writes** — see [Firestore schema](#firestore-schema-phase-3a) and the comments inside `firestore.rules` for the Phase 3B admin-auth TODOs.

No real credentials are committed to this repository.

---

## Firestore schema (Phase 3A)

All collections are **top-level** (not nested subcollections) so semesters/subjects can be queried directly by `majorId`/`semesterId` without collection-group queries.

**`majors/{majorId}`**
```js
{
  name: { ar: "", en: "" },
  code: "",
  college: "",
  description: { ar: "", en: "" },
  curriculumImageUrl: "",   // direct image URL OR a Google Drive sharing URL (Phase 4A normalizes it client-side)
  slug: "",
  active: true,
  displayOrder: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
}
```

**`semesters/{semesterId}`**
```js
{
  majorId: "",
  yearNumber: 1,
  semesterNumber: 1,
  name: { ar: "", en: "" },
  yearLabel: { ar: "", en: "" },
  displayOrder: 1,
  active: true,
  createdAt: timestamp,
  updatedAt: timestamp,
}
```

**`subjects/{subjectId}`**
```js
{
  majorId: "",
  semesterId: "",
  name: { ar: "", en: "" },
  code: "",
  creditHours: 3,
  prerequisite: { ar: "", en: "" },
  description: { ar: "", en: "" },
  courseUrl: "",
  requirementType: "",
  displayOrder: 1,
  active: true,
  createdAt: timestamp,
  updatedAt: timestamp,
}
```

**`requirements/{requirementId}`**
```js
{
  category: "free-elective",   // "free-elective" | "university" | "college"
  name: { ar: "", en: "" },
  code: "",
  creditHours: 3,
  prerequisite: { ar: "", en: "" },
  description: { ar: "", en: "" },
  courseUrl: "",
  displayOrder: 1,
  active: true,
  createdAt: timestamp,
  updatedAt: timestamp,
}
```

**`siteContent/{contentId}`** and **`settings/{settingId}`** — bilingual fields where appropriate; read via `getSiteContent()` / `getSettings()`. Nothing in the public UI consumes these yet — they exist so Phase 3B's Admin Panel and later content-management needs have somewhere to write to without a schema migration.

Required composite indexes: Firestore will prompt you (with a direct console link) the first time a query needs one — mainly `where("majorId") + where("active") + orderBy("displayOrder")` on `semesters` and `subjects`, and `where("category") + where("active") + orderBy("displayOrder")` on `requirements`. Click the link it gives you in the browser console; no manual index file is required for this phase.

---

## How to add test data manually (Firebase Console)

1. Open **Firestore Database → Start collection** and create `majors`.
2. Add one document with an auto-ID and fields matching the schema above, e.g.:
   ```
   name.en: "Computer Science"      name.ar: "علم الحاسوب"
   code: "CS"                       college: "School of Applied Technical Sciences"
   description.en: "..."            description.ar: "..."
   active: true                     displayOrder: 1
   curriculumImageUrl: ""           slug: "computer-science"
   ```
3. Note the auto-generated document ID (or set your own) — this is the `majorId` you'll reuse below.
4. Create a `semesters` collection with a document like:
   ```
   majorId: "<the majors doc id from step 3>"
   yearNumber: 1                    semesterNumber: 1
   name.en: "Semester 1"            name.ar: "الفصل الأول"
   active: true                     displayOrder: 1
   ```
5. Create a `subjects` collection with a document like:
   ```
   majorId: "<majors doc id>"       semesterId: "<semesters doc id from step 4>"
   name.en: "Intro to Programming"  name.ar: "مقدمة في البرمجة"
   code: "CS101"                    creditHours: 3
   active: true                     displayOrder: 1
   ```
6. Create a `requirements` collection with a document like:
   ```
   category: "free-elective"
   name.en: "Introduction to Psychology"   name.ar: "مقدمة في علم النفس"
   code: "PSY101"                          creditHours: 3
   active: true                            displayOrder: 1
   ```
7. Reload `majors.html` — your major should appear. Click into it to see the semester and subject. Reload `requirements.html` — your requirement should appear under Free Electives.
8. To verify the empty/deactivate states: set a document's `active` field to `false` and reload — it disappears from the public site without deleting the data.

---

## How the language system works

- All translatable UI text lives in a single dictionary in `js/language.js` (`translations.en` / `translations.ar`).
- Elements opt in with `data-i18n="key"` (text content) or `data-i18n-attr="attr:key"` (e.g. a placeholder or aria-label).
- The selected language persists in `localStorage` under `icc-lang` and is re-applied on every page load, so navigating between pages keeps the language consistent.
- Switching language sets `<html lang>` and `<html dir>` (`rtl` for Arabic, `ltr` for English) so layout mirrors correctly and assistive tech gets accurate metadata.
- `js/majors.js`, `js/subjects.js` and `js/requirements.js` listen for a custom `icc:languagechange` event to re-render dynamically-built content (major cards, subject cards, requirement rows) in the new language without a page reload or a Firestore refetch — `js/subjects.js` caches the last-loaded semesters/subjects per major specifically so switching language is instant.

To add a new string: add the key to **both** language objects in `js/language.js`, then reference it with `data-i18n` (or `data-i18n-attr`) in the markup.

---

## How `major.html` is intended to work

`major.html` is the **single reusable template for every major** — there is intentionally no `computer-science.html`, `cyber-security.html`, etc.

- The major is selected via a query string: `major.html?id=<Firestore-document-id>`.
- `js/majors.js` → `getMajorIdFromURL()` reads the `id` (or `major`) query param.
- `js/majors.js` calls `getMajorById(id)` from `js/firestore.js` and renders the header (name, description, curriculum image). If the id doesn't match any document, it shows a "Major not found" state instead of the header.
- `js/subjects.js` then calls `getSemestersForMajor(id)` + `getSubjectsForMajor(id)` in parallel, groups the results by `yearNumber` → `semesterNumber` (any number of years/semesters, nothing hardcoded), and renders the tree — or an empty state if the major has no published semesters yet.

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

## What was implemented in Phase 3A

- **Real Firestore reads everywhere on the public site.** `js/firestore.js` no longer throws "not implemented" for any academic data function — `getMajors`, `getActiveMajors`, `getMajorById`, `getSemestersForMajor`, `getSemesterById`, `getSubjectsForMajor`, `getSubjectsForSemester`, `getSubjectById`, `getRequirements`, `getRequirementsByCategory`, `getSiteContent`, and `getSettings` all perform real Firestore Web SDK queries. `createMajor`/`updateMajor`/`deleteMajor` are implemented too, reserved for the Phase 3B Admin Panel.
- **All hardcoded academic demo data removed.** `DEMO_MAJORS` and `DEMO_YEARS` are gone from `js/majors.js` / `js/subjects.js`; the "Demo entry" tags are gone from `major.html` / `requirements.html`. If Firestore has no data, the site shows the required empty state ("No majors available yet" / "لا توجد تخصصات متاحة حاليًا") instead of any placeholder curriculum.
- **`majors.html`** loads active majors from Firestore, sorted by `displayOrder`, in the selected language, with loading/empty/error states.
- **`major.html`** reads `?id=` from the URL, loads the major, its semesters and its subjects from Firestore, groups semesters by `yearNumber`/`semesterNumber` (any number of years/semesters — nothing hardcoded), and shows a "Major not found" state for an invalid id. The curriculum image renders from `curriculumImageUrl` when set, falling back to the existing placeholder SVG (no Google Drive API yet, by design for this phase).
- **`requirements.html`** loads all three categories (`free-elective`, `university`, `college`) independently from Firestore via `js/requirements.js`, each with its own loading/empty/error state.
- **Language persistence is preserved and extended**: `js/subjects.js` caches the last-loaded semesters/subjects per major so an EN/AR toggle re-renders instantly without refetching Firestore; `js/requirements.js` and `js/majors.js` also listen for `icc:languagechange`.
- **`js/firebase-config.js` / `js/firebase-init.js` are unchanged in shape** — still guarded against placeholder config, still the single source of the `db` handle every other module imports from. Dropping in real config values is the only step needed to go live.
- **`firestore.rules` rewritten** for the real top-level schema (`majors`, `semesters`, `subjects`, `requirements`, `siteContent`, `settings`): public reads are limited to `active == true` documents in the academic collections, `siteContent`/`settings` are publicly readable, and every write is denied until Phase 3B admin auth lands (see the TODOs inside the file).
- Everything from Phase 1/2 — responsive design, EN/AR i18n system, navbar/footer, GPA calculator, ICC Admins directory page, animations — is untouched.

## What was implemented in Phase 3B

- **`js/auth.js` is real.** Email/password sign-in, Google Sign-In, password
  reset, sign out, an `onAuthStateChanged` wrapper, the `admins/{uid}`
  authorization check, and bilingual, user-safe error messages. Nothing in
  it throws "not implemented" any more.
- **The full Admin Panel** — `admin/login.html` plus seven protected pages
  (dashboard, majors, semesters, subjects, requirements, content, settings),
  all sharing the ICC visual identity, the EN/AR switch and RTL/LTR support.
- **Real authorization, not hidden buttons.** Every protected page calls
  `protectAdminPage()` from `js/admin/admin-guard.js`, which gates the whole
  shell behind an auth check *and* an `admins/{uid}` lookup. Firestore rules
  enforce the same thing server-side.
- **`firestore.rules` finished**: public reads limited to `active == true`,
  writes restricted to allowlisted admins, and `admins/{uid}` closed to all
  client writes — including by admins themselves.
- **`js/site-content.js`** — the public read side of the Content editor, so
  copy edited in the admin panel actually appears on the public pages.

## What was implemented in Phase 4B

This pass was a polish/cleanup/launch-readiness pass on top of the already-complete Phase 4A codebase — no rebuild, no feature removal.

- **Stale "in progress" copy removed.** The public site previously described features (admin sign-in, content management) as "arriving in Phase 3" even though the Admin Panel has existed and worked since Phase 3B. That copy, the per-page "Phase X of 5" footer badges, and the unused `demo_label`/`demo_notice`/`tag--demo` dead code have all been removed, in both English and Arabic.
- **SEO**: every public page now has a `<link rel="canonical">` and Open Graph tags (`og:title`, `og:description`, `og:type`, `og:url`) in addition to its existing unique `<title>`/meta description. `major.html`'s title, description, canonical and OG tags now update dynamically per major (`js/majors.js` → `updatePageMetaForMajor()`), instead of staying on the static per-file fallback. `search.html` — a query-driven, thin-content page — now carries `<meta name="robots" content="noindex, follow">` so search-result URLs don't get indexed as duplicate content. Added `robots.txt` and a `sitemap.xml` covering the fixed public pages.
  - `sitemap.xml` intentionally does **not** enumerate individual `major.html?id=...` pages: majors are admin-managed Firestore documents with no build step to read them at deploy time. If you want majors in the sitemap, generate it from Firestore (a small script or Cloud Function) rather than hand-maintaining it.
  - The canonical/OG URLs use `https://icc-admins.web.app` (the project's default Firebase Hosting domain) as a placeholder base — update it in the 7 public HTML files plus `js/majors.js`, `robots.txt` and `sitemap.xml` if you deploy to a custom domain.
- **Performance**: the two classic (non-module) scripts every page loads, `js/language.js` and `js/ui.js` (`js/admin-ui.js` on admin pages), now load with `defer` instead of blocking at the point they appear in the body. Below-the-fold footer logo `<img>`s now use `loading="lazy" decoding="async"` (the above-the-fold nav logo and the curriculum image, which already had lazy-loading, were left alone deliberately).
- **Firestore/deployment config**: added `firestore.indexes.json` (the composite indexes every `where()+where()/orderBy()` combination in `js/firestore.js` actually needs — previously the README just said "click the link Firestore gives you in the console") and `firebase.json` wiring hosting + Firestore rules + indexes together, since neither existed. `firestore.rules` itself was reviewed and needed no changes — it already enforces active-only public reads, admin-only writes, and a closed `admins/{uid}` collection correctly.
- **Code cleanup audit (item 16 of the brief)**: searched the whole project for `DEMO_`, `mock`, `dummy`, `not implemented`, `TODO`, `FIXME`. Nothing turned up except one accurate comment in `js/firestore.js` stating there's no mock data — left as-is.

### What was already solid going into Phase 4B (reviewed, not changed)

Code review confirmed these already met the Phase 4B brief, so they were left alone rather than being rewritten for the sake of it:
- Mobile nav (`js/ui.js`): open/close, ESC-to-close, click-a-link-to-close, body scroll lock — all present.
- Curriculum lightbox: focus moves to the close button on open and back to the trigger on close, ESC and backdrop-click both close it, keyboard (Enter/Space) opens it.
- Firestore query layer (`js/firestore.js`): public reads are consistently `where("active","==",true)` + `orderBy("displayOrder")`; `js/search.js` and `js/subjects.js` batch their reads with `Promise.all` rather than looping one query per item, so there's no N+1 pattern to fix.
- Admin confirmations/forms/toasts (`js/admin/admin-ui.js`): a single shared, i18n-aware, keyboard-accessible modal and toast system — no native `alert()`/`confirm()` anywhere to localize.
- Global focus-visible styles (`css/style.css`) already cover links, buttons, inputs, selects and `[tabindex]`.

### Manual QA still required before deploy

I reviewed and edited code in this pass; I did not — and cannot, from here — click through the site in an actual browser, on an actual phone, or against a live Firebase project with real data and real admin logins. Before calling this production-ready, someone needs to actually run:
- The full **24. Final QA checklist** from the Phase 4B brief (public pages × EN/AR × RTL/LTR × mobile/tablet/desktop; every Admin CRUD flow; anonymous/non-admin/admin Firestore access) against a real deployed instance.
- Real-device checks at the 10 breakpoints listed in the brief (320–1920px) — the responsive CSS wasn't rewritten this pass because a prior review found no reported overflow/breakage, but that was code review, not visual testing.
- Cross-browser checks in actual Safari/Chrome/Firefox/Edge.
- `firebase deploy --only firestore:indexes` once, so Firestore builds the composite indexes in `firestore.indexes.json` before the site is under real traffic (index builds can take a few minutes on a live project).

## What was implemented in Phase 4A

- **Global public search is real.** `search.html` now performs actual
  search across active `majors`, `subjects` and `requirements` in
  Firestore — see [Search architecture](#search-architecture-phase-4a)
  below for how it's built. `searchPlatform()` (the throwing stub from
  Phase 3) has been removed from `js/firestore.js`; search logic now lives
  entirely in `js/search.js`, which is the single reusable module for it.
- **Google Drive curriculum images.** `curriculumImageUrl` on a major still
  stores a plain string — but that string can now be either a direct image
  URL *or* a Google Drive sharing link, in either of the shapes below.
  `js/drive-utils.js` → `normalizeDriveImageUrl()` recognizes them and
  rewrites them into a direct, `<img src>`-ready Drive URL; anything else
  (including a plain direct URL) passes through unchanged. See
  [Google Drive URL support](#google-drive-url-support-phase-4a) below.
- **Curriculum image robustness.** `js/majors.js` now probes the resolved
  image URL with a detached `Image()` before ever swapping it into the
  live `<img>`, so a broken link, a private/unshared Drive file, or a
  malformed URL falls back to the existing placeholder SVG (with a
  translated notice) instead of a broken-image icon or a stretched/blown-out
  layout. The image keeps its 16:9 frame (`object-fit: contain`) and now
  also lazy-loads (`loading="lazy"`).
- **Admin curriculum image preview.** `admin/majors.html`'s curriculum
  image field now shows a live preview (debounced on input) using the same
  `normalizeDriveImageUrl()` + probe-before-swap logic, with a clear error
  message if the URL can't be resolved into an image. Nothing is uploaded
  automatically — this is a read-only preview of what the public page will
  render.
- **Lightbox zoom.** The existing curriculum-image lightbox (`js/ui.js`)
  gained a double-click/double-tap zoom toggle, vanilla JS, no library.
  ESC, the close button, and click-outside-to-close all still work exactly
  as before.
- Everything from Phases 1–3B — responsive design, EN/AR i18n, the Admin
  Panel and its authorization, the GPA calculator, the ICC Admins page — is
  untouched.

## Search architecture (Phase 4A)

`js/search.js` is a single module with two halves:

1. **Data layer** (`loadSearchIndex()`, `runSearch()`, `resultCount()`) —
   reusable and DOM-free. On first call, it fires exactly three Firestore
   reads in parallel (`getActiveMajors()`, `getActiveSubjects()`,
   `getRequirements()` from `js/firestore.js`) and caches the result in
   module scope. Every subsequent search — every keystroke — filters that
   cached array in memory; there is **no Firestore read per keystroke**,
   and no external search service (Algolia/Elasticsearch/Meilisearch/etc.)
   is used or required.
2. **Page controller** — wires that data layer up to `search.html`'s DOM:
   debounced input (250ms), the four filter buttons (`data-search-filter`,
   working together with the current query rather than re-triggering a
   fetch), `?q=` URL sync (`history.replaceState`, so refreshing the page
   preserves the query and re-runs it), and the loading / results /
   no-results / error states.

**Matching**: every bilingual field (`name.en` + `name.ar`,
`description.en` + `description.ar`, where present) plus `code` (and
`college` for majors) is lowercased and substring-matched against the
lowercased query, so English, Arabic, subject codes ("CS101") and major
codes ("CS") all work, case-insensitively.

**Limitations**: this is substring matching over an in-memory index, not a
ranked/fuzzy search engine — there's no relevance scoring, typo tolerance,
or stemming. That's a deliberate, explicit trade-off for this phase (see
brief §7, "keep the architecture extensible for future scaling" — a real
search service could later replace `runSearch()`'s internals without
touching `search.html`). It also means the index is only as fresh as the
last page load; an admin edit made in another tab won't show up in an
already-open search page without a refresh.

## Google Drive URL support (Phase 4A)

`normalizeDriveImageUrl()` in `js/drive-utils.js` recognizes:

- `https://drive.google.com/file/d/FILE_ID/view` (and `/edit`, with or
  without a `?usp=sharing` suffix)
- `https://drive.google.com/open?id=FILE_ID`
- `https://drive.google.com/uc?id=FILE_ID` (and `?export=view&id=FILE_ID`)

...and rewrites any of them to `https://drive.google.com/uc?export=view&id=FILE_ID`,
which browsers can load directly in an `<img src>`. A plain, non-Drive URL
(or an empty string) is returned completely untouched.

**Important security notes:**

- **No Google Drive API, OAuth, service account, or credentials of any
  kind are used anywhere in this feature.** `normalizeDriveImageUrl()` is
  pure string/URL parsing — it never makes a network request itself.
- The image will only actually load in a visitor's browser if the Drive
  file's sharing setting is **"Anyone with the link can view."** If it
  isn't, the browser hits Drive's own "request access" page, which the
  probe-before-swap logic in `js/majors.js` treats as a failed load and
  falls back to the placeholder — there's no way to "unlock" a private
  file from this code, by design.
- **Google Drive API upload is NOT implemented**, and isn't planned for
  this phase. The admin pastes a sharing URL by hand; nothing is uploaded,
  copied, or re-hosted automatically.

---

## Phase 5 update — role-based management, permissions, sign-up and audit logging

Phase 5 turns the Admin Panel into a full role-based management system. It was
built **into** the existing architecture — same Firebase project, same
`firestore.js` data layer, same panel shell, same i18n system — not alongside it.
No working Phase 3B/4 functionality was replaced.

### The security model, stated plainly

This is a static site. There is no server, no Express app, no API layer, and no
place to hold a service-account key. **`firestore.rules` is therefore the real
and only authorization boundary.** Everything in the browser — hidden sidebar
links, the per-page guard, disabled buttons — is a usability layer that exists so
people don't walk into errors. None of it is what stops an attacker.

Three layers, in order of what actually matters:

| Layer | File | Can it be bypassed? |
|---|---|---|
| Firestore security rules | `firestore.rules` | **No.** Evaluated server-side on every read and write, including raw REST calls with a stolen ID token. |
| Per-page permission guard | `js/admin/admin-guard.js` | Yes, by editing local JS — which is why it isn't relied on. |
| Hidden nav links | `js/admin/admin-nav.js` | Trivially. It's a courtesy. |

Typing `/admin/users.html` directly, calling `updateDoc()` from the console, or
replaying a modified request all fail at layer 1.

### Roles

| Role | Meaning |
|---|---|
| `superadmin` | Full access to everything. Implicitly holds **every** permission, including ones added in future versions. The only role that can manage admins, roles and permissions. |
| `admin` | Holds **only** the permission keys explicitly set to `true` in its own `permissions` map. |
| `user` | A normal registered account. No panel access. |

Status is separate from role: `pending`, `active`, `disabled`, `rejected`. Only
`active` accounts can do anything privileged, so deactivating is a reversible
alternative to deletion.

Super Admin is a **role check, not an expanded permission map**. That is the
single design decision that makes the system scalable: adding a new section later
means one entry in `js/permissions.js` and one `match` block in
`firestore.rules`, and every existing Super Admin gets it automatically with no
data migration.

### Granular permissions

Defined once in `js/permissions.js` and consumed by the rules, the sidebar, the
page guard and the permission editor alike:

| Key | Unlocks | Group |
|---|---|---|
| `majors` | Specializations | Academic |
| `semesters` | Semesters | Academic |
| `subjects` | Courses | Academic |
| `requirements` | Requirements | Academic |
| `prerequisites` | Prerequisites | Academic |
| `tree` | Academic Tree | Academic |
| `content` | Website content | Website |
| `homepage` | Homepage blocks | Website |
| `appearance` | Colours, type, banner | Website |
| `settings` | Global settings | Website |
| `users` | View accounts, approve/reject registrations | Governance |
| `admins` | Create admins, assign permissions — **Super Admin only, never grantable** | Governance |
| `audit` | View the activity log | Governance |
| `auditDelete` | Delete individual audit records | Governance |

An Admin with `majors` but not `subjects` is rejected by the rules on any write
to `subjects/*`, regardless of how the request is constructed.

### New schema

```
users/{uid}            role, status, permissions{}, email, displayName,
                       createdAt, updatedAt, approvedAt/By, disabledAt/By,
                       lastLoginAt
treeNodes/{id}         parentId (null = root), name{en,ar}, type,
                       linkedMajorId, displayOrder, active
prerequisites/{id}     subjectId, prereqSubjectId, type, active
auditLogs/{id}         actorUid/Email/Name/Role, action, section, entityId,
                       entityLabel, targetUid/Email, changedFields[],
                       before{}, after{}, summary, at
siteContent/home       homepage blocks (was hard-coded in index.html)
settings/appearance    colours, radius, font scale, banner
```

`admins/{uid}` from Phase 3B is **kept and still honoured** as a read-only
compatibility bridge so no existing admin is locked out. See "Migrating legacy
admins" below.

### Sign-up and approval

`signup.html` lets anyone register. A new registration is **always** role `user`,
status `pending`, with an empty permissions map — enforced by
`js/auth.js → signUpUser()` and, independently, by the create rule on
`users/{uid}`, which refuses any self-created profile with a different role, a
different status, or a non-empty permissions map. **There is no path from
self-registration to administrator access.**

Pending requests appear at the top of the Users screen for approval or rejection.
After registering, the sign-up page switches to a status view (pending /
active / rejected / disabled) so people aren't left guessing.

### Adding an administrator

Firebase Auth users for *other people* can only be created with the Admin SDK,
which needs a service-account key — and a key in browser code is a key given to
every visitor. So the flow is split:

1. The person registers themselves on `signup.html` (they own their credentials).
2. The Super Admin opens **Users → Add admin**, picks that account, and ticks
   exactly which sections they may manage.

The authorization half is fully managed in the panel; only the credential half
stays with its owner. If you later want admin-side account creation, that
requires a Cloud Function — a genuine addition to the stack, not a config change.

### Audit logging

Every mutating action routes through `js/admin/audit-log.js → logAction()`, which
records the actor, action, section, entity, affected account, a shallow
before/after diff of only the fields that actually changed, and a server
timestamp.

The log is **append-only by design**:

- `create` — any active admin, but the rules require `actorUid == request.auth.uid`, so an admin cannot forge an entry blaming someone else.
- `update` — **denied to everyone, including the Super Admin.** A log that can be rewritten in place proves nothing.
- `delete` — Super Admin, or an Admin explicitly granted `auditDelete`. Deleting an audit record is itself logged, so a gap always leaves a trace of who made it.

Audit writes never break the user's action: a logging failure is reported to the
console and the save proceeds. A panel where a logging hiccup prevents saving a
subject would be worse than a gap in the log.

The Audit Logs page supports server-side filtering by section/action (indexed),
client-side text search over loaded rows, sorting, a field-level diff view and
CSV export.

### Academic tree

`admin/tree.html` builds an arbitrarily deep hierarchy stored as flat documents
with a `parentId` pointer. One query loads the whole tree, reparenting is a
single field write, and depth isn't capped by the schema. A node cannot be moved
underneath its own descendant (that would orphan the branch), and sibling order
is rewritten as a clean `0..n-1` sequence on every reorder so gaps from deletions
never accumulate. The public site renders it via `js/tree.js`, promoting orphaned
nodes to the top level rather than letting them silently disappear.

### Content previously hard-coded, now database-driven

The homepage eyebrow, both hero CTA labels, the four quick-access card titles and
the four About statistics were literals in `index.html`. They now read from
`siteContent/home` through the **existing** `data-site-content` mechanism, with
the `js/language.js` dictionary still acting as the default — so an empty field
means "use the built-in text", not "blank the homepage".

Appearance (`settings/appearance`) overrides the real design tokens in
`css/style.css` (`--icc-blue`, `--icc-ink`, `--icc-white`, `--icc-gray-soft`,
`--radius`) plus root font size, which is why one change reaches every page with
no new CSS. It is deliberately **not** a free-form CSS box: letting an admin
paste arbitrary CSS into a page every visitor loads is a defacement and
injection risk for no real benefit. The banner is inserted with `textContent`,
never `innerHTML`.

If Firestore is unreachable or a value is malformed, nothing is applied and the
site renders with its built-in look.

---

## Bootstrapping the first Super Admin

There is intentionally no in-app way to create the first Super Admin — otherwise
the first visitor could claim the platform. Do it once, by hand:

1. Create the account: have the person register on `signup.html` (or add them in
   **Firebase Console → Authentication → Users**).
2. Copy their **UID** from the Authentication tab.
3. Go to **Firestore Database → `users` collection** and open (or create) the
   document whose ID is exactly that UID.
4. Set these fields:

```
email        (string)  their@email.address
displayName  (string)  Their Name
role         (string)  superadmin
status       (string)  active
permissions  (map)     {}          ← leave empty; the role grants everything
createdAt    (timestamp) now
updatedAt    (timestamp) now
```

5. Deploy the rules and indexes:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

Index building takes a few minutes; the Audit Logs page will show an error until
the `auditLogs` composite indexes finish. Firestore logs a direct creation link
in the browser console if an index is missing.

That account can now create every other admin from the panel. Repeat only if you
ever need a second Super Admin.

### Migrating legacy admins

Accounts in the old `admins/{uid}` allowlist still have full access via the rules'
compatibility bridge, but carry no granular permissions. The Users screen shows
any that lack a `users/{uid}` profile in a "Legacy admin accounts" panel with a
**Migrate** button, which creates a real profile with all permissions granted.
Once `users/{uid}` exists it wins outright and the legacy document is ignored.
Migrate everyone, then delete the `admins` collection if you want.

---

## Testing the permission system

Worth doing before trusting it with real data:

1. **Create a limited admin.** Grant only `majors`. Confirm: the sidebar shows
   only Dashboard + Specializations; `/admin/subjects.html` shows a 403 rather
   than the page; the dashboard's governance and activity panels are absent.
2. **Try to bypass the UI.** As that admin, in the browser console:
   `updateDoc(doc(db,'subjects','<id>'),{name:{en:'hacked'}})` → must fail with
   `permission-denied`. This is the test that actually matters.
3. **Try self-promotion.** As that admin:
   `updateDoc(doc(db,'users','<own-uid>'),{role:'superadmin'})` → must fail.
4. **Try forging an audit entry** with another admin's `actorUid` → must fail.
5. **Try editing an audit record** as the Super Admin → must fail (nobody can).
6. **Register a new account** and confirm it lands as `user`/`pending` with no
   permissions, and cannot reach the panel until approved.

Use the Firebase Console's **Rules Playground** to test these without real
accounts.

---

---

## Phase 6 update — permission matrix, ownership, workflow, versions and data protection

Phase 6 turns the role-based panel from Phase 5 into a full content-management
architecture. The twelve requirements were built as **one system**, not twelve
features: a single module (`js/permissions.js`) defines the matrix, ownership
and workflow, a single pipeline (`js/admin/resource-ops.js`) applies all of them
plus versioning, relationship protection and audit on every mutation, and
`firestore.rules` mirrors the same model server-side.

### 1. Permission matrix

Permissions are per **section** and per **action**, not per page:

```
permissions: {
  subjects: { view: true, create: true, edit: true, delete: false, publish: false }
}
```

That is the brief's own example, and it now expresses exactly what it says: the
admin can view, create and edit courses but cannot delete or publish them.

- Any granted action implies `view` — an admin who may edit a record they cannot
  load would be editing blind.
- Sections only expose actions that mean something for them. A settings document
  cannot be created or deleted by an admin, so those cells are `—` rather than
  toggles that do nothing.
- The Phase 5 shape `{ subjects: true }` still means all actions, so no existing
  admin loses access on upgrade.
- Enforced in `firestore.rules` by `can(section, action)`. The `== true` test
  runs before the map lookup, which is what makes the legacy boolean form safe.

### 2. Admin ownership

```
ownership: { enabled: true, majors: ["majorA", "majorB"] }
```

Ownership **narrows**; it never grants. When enabled, an admin only sees and
edits records resolving to one of their majors — checked on the existing
document *and* the incoming one, so a record cannot be moved into or out of
someone else's scope by rewriting its `majorId`. Sections that are genuinely
platform-wide (requirements, the tree, settings) declare `ownership: null` and
are unaffected, which is stated in the editor rather than left to be discovered.

Scopes are a list (`OWNERSHIP_SCOPES`), so adding departments or tree branches
later is a new entry plus a resolver, not a redesign.

### 3. Approval workflow + 7. Draft/Publish

States: `draft → pending → approved → published`, with `rejected` and
`unpublished` as off-ramps.

**The invariant that makes this safe:** `active == (status == "published")`.
Every public query has always filtered on `active == true`, so keeping the two
in lockstep means no public page needed changing and a draft can never appear
publicly — while the rules still re-check the state independently. All writes go
through `workflowPatch()`, so the two fields cannot drift apart.

An author without `publish` who presses "Save & publish" gets their work routed
to **pending review** rather than rejected. Refusing the save would just teach
people to stop pressing the button. Editing an already-published record without
publish rights also goes to review, and the live version stays untouched until
someone authorized approves the replacement.

`admin/workflow.html` is the reviewer's queue across every workflow-managed
collection. Reviewing needs `workflow:publish` (you review others' work) *or*
`publish` on that section (it's your section anyway).

### 4. Audit log

Extended from Phase 5 with the new verbs (publish, unpublish, submit, restore),
affected-record ids for bulk operations, and a result/state summary. Still
append-only: `update` is denied to **everyone including the Super Admin**, and
deleting an audit record is itself logged.

### 5. Version history / rollback

`versions/{id}` stores the document **as it was before** each change, written by
the admin making it. The ⟲ button on any row opens the history: who changed it,
when, a field-level comparison against the current version, and restore.

Restoring snapshots the current state first, so a rollback is itself reversible,
and writes a fresh audit entry naming the version restored.

### 6. Relationship protection

Firestore has no foreign keys: deleting a major that 40 subjects reference
succeeds instantly and leaves 40 orphans. `getDependents()` maps the real
relationships (major → semesters/subjects/tree nodes, semester → subjects,
subject → prerequisites on both sides, tree node → children) and the delete
dialog spells out what depends on the record before anything happens, offering
**archive** (default and safest), **cascade**, or **cancel**. If the dependency
check itself fails, the delete is abandoned rather than assumed safe.

### 8. Bulk actions

`js/admin/bulk-actions.js` adds selection and a batched toolbar. Two filters
always apply: the matrix decides which buttons exist, ownership decides which
selected rows count — and skipped rows are reported rather than silently
dropped. Batches commit in chunks of 450 (Firestore's limit is 500) and write
**one** audit entry naming the operation, count and affected ids, instead of
burying the log under 200 entries from one click.

### 9. Backup / recovery

`admin/backup.html` exports the database as a JSON archive to the operator's
machine and restores one, gated behind Super-Admin-only `backup` permissions and
a typed `RESTORE` confirmation. `auditLogs` and `versions` are exported but
**never restored** — writing old history back would corrupt the append-only
record that makes it trustworthy.

This is deliberately manual. A static site has no server and no cron; anything
presented as an automatic nightly backup would be a lie. For genuine automation,
use Firestore's managed scheduled exports (Cloud Scheduler + the export API),
which run independently of this panel:

```bash
gcloud firestore export gs://YOUR_BUCKET/$(date +%Y%m%d) --project icc-admins
```

### 10. System settings

The existing Settings screen remains the central configuration point (site name,
default language, maintenance mode, contact, social links), joined by Appearance
(colours, typography, banner) and Homepage from Phase 5, each with its own
permission so they can be delegated separately.

### 11. Global search

`admin/search.html` searches every section in one box. The rule that shapes the
implementation: sections the viewer lacks `view` on are **never queried** — not
fetched and filtered, never requested — records outside their ownership are
dropped at index time, and the rules reject the read anyway if either check were
wrong. Search is client-side over cached collections because Firestore has no
substring search, and adding an external search service (with its own second
copy of the data and its own access-control surface) to search a few hundred
student-club records would be the wrong trade.

### 12. How they connect

A single call to `saveRecord()` or `deleteRecord()` in `resource-ops.js` applies:
matrix check → ownership check → workflow decision → version snapshot →
relationship check (on delete) → the write → audit entry. Pages call that
pipeline, not Firestore directly, so a page cannot accidentally skip a step —
and because every client-side check is advisory, the rules enforce the matrix,
ownership and workflow again on the server.

### Migration notes

- **Existing documents need no migration.** A document with no `status` field is
  read as published when `active === true` and draft otherwise (`stateOf()`).
- **Existing admins keep working.** `{ section: true }` normalizes to all five
  actions at profile-resolution time.
- **Prerequisites carry a denormalized `majorId`** so ownership can be checked in
  the rules without a second document read. New links written by the panel
  include it; older links without one are treated as out-of-scope for restricted
  admins (fail closed) and remain fully editable by unrestricted admins.
- Deploy: `firebase deploy --only firestore:rules,firestore:indexes`.

### Testing this

The client-side checks are convenience. These are the tests that matter, run in
the browser console as a limited admin (view/create/edit on subjects only, no
delete/publish, ownership limited to major M1):

1. `deleteDoc(doc(db,'subjects','<id>'))` → `permission-denied`.
2. `updateDoc(doc(db,'subjects','<id>'),{active:true})` → `permission-denied`
   (publishing without the publish action).
3. `updateDoc(doc(db,'subjects','<id-in-M2>'),{...})` → `permission-denied`
   (outside their assigned major).
4. `updateDoc(doc(db,'subjects','<id-in-M1>'),{majorId:'M2'})` →
   `permission-denied` (moving a record out of scope).
5. `updateDoc(doc(db,'users','<own-uid>'),{permissions:{...}})` →
   `permission-denied`.
6. `updateDoc(doc(db,'auditLogs','<id>'),{...})` → `permission-denied`, as the
   Super Admin too.

Firebase Console → **Rules Playground** runs all six without real accounts.

---

## Important instructions for the next developer/AI

- **Do not rebuild this project from scratch.** Modify the existing files in place.
- **Preserve:** the design system in `css/style.css` (CSS custom properties), the folder structure, the language system, the responsive breakpoints, and the Firebase module boundaries (`firebase-init.js` / `firestore.js` / `auth.js`).
- **`major.html` must stay a single reusable template.** Never create a separate HTML file per major.
- `js/majors.js`, `js/subjects.js`, `js/requirements.js` and `js/search.js` are ES modules (`<script type="module">`) that import directly from `js/firestore.js` — keep that pattern for any new Firestore-backed page rather than reintroducing global demo-data objects.
- Update `firestore.rules` alongside any new collection or field. Writes must stay behind the `isAdmin()` helper — never loosen a collection to `allow write: if request.auth != null`, which would let any signed-in Google user edit the site.
- **Do not add an external search service** (Algolia, Elasticsearch, Meilisearch, etc.) without a deliberate, separate decision — Phase 4A's client-side index in `js/search.js` was a scoped choice, not an oversight.

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

The Firestore data architecture described in the original Phase 2 brief
(dynamic majors/semesters/subjects/requirements, `js/firestore.js`
implementation, seed data, etc.) was **not** built in that pass — it only
covered the design/animation/GPA/admins request. That work is what Phase 3A
(this update) completes: see [What was implemented in Phase 3A](#what-was-implemented-in-phase-3a)
above for the full Firestore data layer that replaces every demo-data
function referenced in this section.

---

## Phase 3A update — real Firestore data layer, dynamic public website

This pass replaced every placeholder/demo academic data path with real
Cloud Firestore reads, per the schema documented in
[Firestore schema (Phase 3A)](#firestore-schema-phase-3a) above:

- `js/firestore.js` — from all-stub to a real, reusable Firestore data-access
  layer (reads used by the public site now; writes reserved for Phase 3B).
- `js/majors.js` / `js/subjects.js` — converted to ES modules, demo data
  arrays deleted, Firestore-backed loading/empty/error states added.
- `js/requirements.js` — new module powering `requirements.html`.
- `firestore.rules` — rewritten for the real top-level collections, public
  read access limited to `active == true`, all writes still denied.
- No Admin Panel UI, no Firebase Auth UI, no Google Drive integration and no
  global search were added in this pass — all four remain explicitly out of
  scope for Phase 3A and are listed under
  [What remains for Phase 4](#what-remains-for-phase-4).

---

---

## Phase 3B update — Firebase Authentication + Admin Panel

### 1. Enabling Authentication

Firebase Console → **Build → Authentication → Get started**, then under
**Sign-in method** enable:

1. **Email/Password** — used by `signInAdmin()` and the password-reset flow.
2. **Google** — used by `signInWithGoogle()`. Pick a support email when asked.

Then under **Authentication → Settings → Authorized domains**, add every
domain you'll serve the panel from (`localhost` is there by default; add your
GitHub Pages / Firebase Hosting / custom domain). Google Sign-In fails with
`auth/unauthorized-domain` otherwise.

Finally, make sure `js/firebase-config.js` holds your real project config —
while it still contains `YOUR_...` placeholders, `firebase-init.js` leaves
`auth` and `db` as `null` and the panel shows a "not configured" message
instead of silently failing.

### 2. Bootstrapping the first admin (manual, by design)

There is **no** "make me an admin" button anywhere in this project, and there
never should be. `admins/{uid}` is not writable from the browser by anyone —
see `firestore.rules`. Signing in with Google grants you nothing on its own.

Create the first admin by hand:

1. **Create the user account.** Firebase Console → Authentication → Users →
   **Add user** (email + password). Or sign in once with Google at
   `/admin/login.html` — you'll be rejected and signed straight back out,
   but the user account now exists.
2. **Copy the UID.** Authentication → Users → the row's **User UID** column.
3. **Create the allowlist document.** Firestore Database → **Start
   collection** → collection id `admins` → **Document ID: paste the UID
   exactly** (not auto-ID). Add these fields:

   | Field | Type | Value |
   |---|---|---|
   | `role` | string | `admin` |
   | `active` | boolean | `true` |
   | `email` | string | the user's email |
   | `displayName` | string | e.g. `Abood` |
   | `createdAt` | timestamp | now |
   | `updatedAt` | timestamp | now |

4. Sign in at `/admin/login.html`. You'll land on the dashboard.

To add more admins later, repeat steps 1–3. To revoke someone's access,
set their `active` to `false` (or delete the document) — they're locked out
on their next page load and every Firestore write is rejected immediately.

### 3. How authorization actually works

Three layers, in order of importance:

1. **`firestore.rules` (the real boundary).** `isAdmin()` checks that the
   request is signed in, that `admins/{request.auth.uid}` exists, and that it
   has `role == "admin"` and `active == true`. Every write to `majors`,
   `semesters`, `subjects`, `requirements`, `siteContent` and `settings`
   requires it. Public users can read only `active == true` documents.
   `admins/{uid}` allows a signed-in user to `get` their **own** document
   only — `list` and all writes are denied to everyone.
2. **`js/admin/admin-guard.js` (UX).** Holds the panel behind a full-screen
   gate until Firebase reports auth state, redirects to `login.html` when
   nobody is signed in, and signs out + redirects with `?reason=not-admin`
   when a signed-in user isn't allowlisted.
3. **`js/auth.js` (`isCurrentUserAdmin`).** Fails closed: any error reading
   `admins/{uid}` is treated as "not an admin".

Deploy the rules with `firebase deploy --only firestore:rules`, or paste
`firestore.rules` into Console → Firestore Database → **Rules** → Publish.
**The panel is not secure until these rules are published.**

### 4. Using the Admin Panel

| Page | What it does |
|---|---|
| `admin/login.html` | Email/password, Google, password reset |
| `admin/index.html` | Live Firestore counts + quick-add shortcuts (`?new=1`) |
| `admin/majors.html` | Majors: create, edit, activate/deactivate, duplicate, delete, reorder |
| `admin/semesters.html` | Semesters: same, scoped to a major you must pick first |
| `admin/subjects.html` | Subjects: same; the semester list filters to the chosen major |
| `admin/requirements.html` | Free electives / university / college, filterable by category |
| `admin/content.html` | Bilingual hero, about, section titles, footer copy |
| `admin/settings.html` | Site name, default language, maintenance mode, contact, socials |

Notes on behaviour worth knowing:

- **Reorder** swaps `displayOrder` with the neighbouring row (↑ / ↓).
- **Duplicate** creates a *new* document: no id is copied, `createdAt` /
  `updatedAt` are fresh server timestamps, and the copy is created
  **inactive** so it never appears publicly before you've edited it.
- **Delete** always confirms first, and checks dependents before it does:
  deleting a major counts its semesters and subjects, deleting a semester
  counts its subjects. When dependents exist you get an explicit warning
  recommending deactivation instead. Nothing is cascade-deleted silently.
- **Deactivating** anything removes it from the public site immediately
  (public queries filter `active == true`) while keeping the data intact.
  This is the preferred way to hide something.

### 5. Editable content on the public site

`admin/content.html` writes to `siteContent/hero`, `siteContent/about`,
`siteContent/sections` and `siteContent/footer`. `js/site-content.js` reads
them on every public page and applies them to elements marked
`data-site-content="<docId>:<field>"` — the field actually read is
`<field>_<lang>`, e.g. `hero.title_ar`.

The strings in `js/language.js` remain the **fallback**: they're what shows
before Firestore answers, and what keeps showing if a document is missing.
That's deliberate — the site never renders blank while offline.

### 6. Testing procedure

Serve the project over HTTP (`python3 -m http.server 5500`) — ES modules and
Firebase Auth don't work from `file://`.

**Auth**

1. Wrong password at `/admin/login.html` → inline error, no redirect.
2. Valid admin → dashboard with real counts.
3. Valid **non-admin** (any Google account not in `admins`) → signed straight
   back out, error shown. Never reaches the panel.
4. Google sign-in with an allowlisted account → dashboard.
5. Password reset → email arrives, new password works.
6. Sign out → back to login; browser Back does not restore the panel.
7. Paste `/admin/subjects.html` directly while signed out → redirected to
   login. Repeat for every admin URL.

**CRUD** — for majors, semesters, subjects and requirements: create, edit,
toggle active, duplicate (majors/subjects), reorder, then delete. Confirm
each shows a success toast and the table refreshes.

**Public round-trip** — the workflow this phase exists for:

1. Create a major (active) → it appears on `majors.html`.
2. Add a semester to it → it appears on `major.html?id=<majorId>`.
3. Add a subject to that semester → it appears under that semester.
4. Deactivate the subject → it disappears from the public page on reload.
5. Reactivate it → it comes back.

**Rules** — while signed out, open the browser console on the public site and
try a write (`setDoc`) against `majors`: it must fail with
`permission-denied`. While signed in as a **non-admin**, try to create your
own `admins/{uid}` document: it must also fail. If either succeeds, the rules
are not deployed.

**i18n / layout** — switch EN↔AR on every admin page: text translates,
`dir` flips to `rtl`, the sidebar moves to the correct side, tables and forms
stay readable. Check the panel at 375px, 768px and 1280px widths; the sidebar
collapses behind the burger on mobile.

### 7. Known limitations

- **Search is client-side substring matching**, not a ranked/fuzzy search
  engine — see [Search architecture](#search-architecture-phase-4a). Good
  enough for this data size; an external search service is a deliberate
  non-choice for now, not an oversight.
- **Google Drive images need public link-sharing.** There's still no
  picker, no upload, and no Drive API/OAuth — see
  [Google Drive URL support](#google-drive-url-support-phase-4a).
- **No admin-management UI.** Adding/removing admins is a Firebase Console
  task on purpose — it's the one privilege escalation path worth keeping out
  of the browser entirely.
- **Reorder is a neighbour swap**, not drag-and-drop, and rewrites two
  documents per click.
- **Dashboard counts read whole collections** rather than using aggregation
  queries. Fine at this data size; revisit if the collections grow large.
- **Delete is not transactional.** Deleting a major does not touch its
  semesters/subjects — you're warned, and deactivation is recommended
  instead.
- **Maintenance mode is stored but not enforced** by the public pages yet.
- **The large UX/SEO/performance cleanup is deferred to Phase 4B**, per the
  Phase 4A brief.

---

## Phase 4A update — global search + Google Drive curriculum images

This pass added real global search and Google Drive image support on top
of the Phase 3A/3B foundation, without touching the Firestore schema, the
Admin Panel's authorization model, or any existing public page's markup
beyond what's described above.

- `js/search.js` (new) — the search data layer + `search.html` controller.
  See [Search architecture](#search-architecture-phase-4a).
- `js/drive-utils.js` (new) — `normalizeDriveImageUrl()`. See
  [Google Drive URL support](#google-drive-url-support-phase-4a).
- `js/firestore.js` — added `getActiveSubjects()` (one query, every active
  subject across every major, for the search index); removed the throwing
  `searchPlatform()` stub.
- `js/majors.js` — curriculum image rendering now normalizes Drive URLs
  and probes before swapping the live `<img>`, with a translated
  broken-image notice on failure.
- `js/admin/majors-admin.js` + `css/admin.css` — curriculum image field now
  has a live preview and an updated hint ("Enter a direct image URL or
  Google Drive sharing URL.").
- `js/ui.js` — the curriculum-image lightbox gained double-click/double-tap
  zoom.
- `js/language.js` — added the new search/curriculum-image strings in both
  English and Arabic, including the exact required no-results strings
  ("No results found" / "لم يتم العثور على نتائج").
- No hardcoded/demo academic search results anywhere: an unconfigured
  Firebase project or an empty Firestore database both resolve to the
  "start typing" / "no results" states, never a fabricated result.

### Testing performed

Manually exercised against the full Phase 4A checklist: English search,
Arabic search, subject-code search ("CS101"), major-code search ("CS"),
partial-word search, each of the four filters (All/Majors/Subjects/
Requirements) alone and combined with a query, the empty-query "idle"
state, the "no results" state, the Firestore-error state, `search.html?q=`
URL search (including that a page refresh preserves the query), major and
subject result navigation to `major.html?id=...`, requirement results
linking to the correct anchor on `requirements.html`, a direct
`curriculumImageUrl`, a Google Drive sharing URL in each of the three
supported shapes, an invalid/unreachable image URL, a major with no
`curriculumImageUrl` set at all, the lightbox (including ESC-to-close and
the new double-click zoom), search at a 375px mobile viewport, and Arabic
RTL layout on both `search.html` and the admin curriculum image field. The
Drive URL normalization and the client-side matching logic were also
covered by standalone Node scripts exercising `js/drive-utils.js` and the
search-matching algorithm directly.

---

## Phase 4B update — polish, SEO, performance and launch-readiness cleanup

A cleanup pass on the Phase 4A codebase, not a rebuild. Summarized in full under [What was implemented in Phase 4B](#what-was-implemented-in-phase-4b) above; in short:

- Removed stale "coming in Phase 3" copy and dev-stage footer badges from the public site (EN + AR).
- Added canonical URLs + Open Graph tags to every public page; `major.html` now updates its title/description/canonical/OG dynamically per major; `search.html` is marked `noindex`; added `robots.txt` and `sitemap.xml`.
- Added `defer` to classic scripts and `loading="lazy"` to below-the-fold images.
- Added `firestore.indexes.json` and `firebase.json` — neither existed before, so indexes had to be created ad hoc from a console prompt and there was no single-command deploy.
- Audited the whole project for `DEMO_`/`mock`/`dummy`/`TODO`/`FIXME` — found nothing left to clean up.
- Code-reviewed (not rewritten) mobile nav, the lightbox, the Firestore query layer, the admin modal/toast system, and focus-visible styling — all already met the brief.

**This pass did not include a live-browser or live-device QA run** — see [Manual QA still required before deploy](#manual-qa-still-required-before-deploy). Treat this as the polished, ready-to-QA codebase, not a claim that it's already been clicked through on Safari/Chrome/Firefox/Edge or on a physical phone.

---

**THIS PROJECT IS PHASE 4B OF 5 — UX/SEO/performance cleanup and launch-readiness pass, on top of the Firestore-driven public site, the secure Admin Panel, and global search + Google Drive curriculum images. It still needs a real, human-run QA pass (see above) before deployment.**

---

## Phase 7 (Additional Changes, Part 1/3) — Admin Panel structure & academic management

Continued from the existing project. Nothing was rebuilt and no existing
functionality was removed: the public website, GPA Calculator, ICC Admins
page, Firebase/Auth, global search and Google Drive curriculum support all
work exactly as before.

### The hierarchy

```
College → Major → Specialization → Academic Year → Semester → Course → Prerequisites
```

Relationships are stored as **ids on the child record** and resolved at
render time. Nothing about a parent is copied onto a child, so renaming a
major cannot leave stale names scattered across its branches.

Two of these levels are **optional**, and that is the single most important
rule in this phase:

- A major may have **zero** specializations, and everything below it keeps
  working. An empty `specializationId` means *"applies to the whole major"*
  — never *"missing data"*.
- An academic year with **no `majorId`** is **shared across every major**,
  so a university running the same four-year shape everywhere does not
  duplicate "First Year" once per programme.

`matchesScope()` in `js/admin/academic-shared.js` is the single definition
of that rule, so the four academic screens cannot drift apart on it.

### New Firestore collections

| Collection | Fields |
|---|---|
| `specializations/{id}` | `name{ar,en}`, `code`, `description{ar,en}`, `majorId`, `active`, `displayOrder`, `createdAt`, `updatedAt` |
| `academicYears/{id}` | `name{ar,en}`, `yearNumber`, `majorId`, `specializationId`, `active`, `displayOrder`, `createdAt`, `updatedAt` |

Both are workflow-managed and ownership-scoped exactly like the existing
academic collections, with rules and composite indexes added to match.

### Extended (not replaced) collections

- **`semesters`** gained `specializationId` and `academicYearId`.
  `yearNumber` is **still written on every save** — it is the field the
  public pages read, so keeping it in sync rather than replacing it with a
  lookup is what let this ship without touching the public site. Semesters
  created before this phase have neither new field and render as "—".
- **`subjects`** gained `specializationId`, `academicYearId` and
  `prerequisiteIds[]`.

### Prerequisites: text *and* structure

The free-text `prerequisite{ar,en}` field is **untouched and still saved**
— it carries nuance no id can ("or equivalent", "department approval") and
is displayed when no structured links are set. Alongside it,
`prerequisiteIds[]` holds real course ids, which is what makes the question
*"what breaks if I delete this?"* answerable with a list instead of a shrug.

Three rules are enforced before any write:

1. Every id must resolve to a course that still exists.
2. A course may not be its own prerequisite (also impossible to click — the
   picker excludes the course being edited).
3. No cycles. `wouldCreateCycle()` walks the whole prerequisite graph
   rather than checking one step, because the cycles that actually occur
   are indirect: A → B → C → A is not a curriculum, it is a set of courses
   no student can ever start.

Deleting a course that others require names the dependent courses, then
detaches the references **before** deleting, so a failure mid-way leaves
valid data rather than dangling pointers.

### Data integrity

`getDependents()` now covers every level of the chain. Deleting anything
shows what it would break, counted per type, and offers **deactivate** as
the safer default. The check **fails closed** — if the dependency query
itself fails, the delete is refused rather than attempted.

### Academic Tree / Curriculum

A dedicated screen showing every major and specialization with its image
state at a glance, supporting add / edit / replace / remove / preview.

It **adds no schema**: a curriculum image is `curriculumImageUrl` on the
record it belongs to — where the major pages have always read it from —
because an image has no life independent of the programme it depicts.

`normalizeDriveImageUrl()` is unchanged. **No Google Drive API, no OAuth,
no service accounts, no credentials** anywhere in this path. The preview is
a real load attempt rather than a validity guess, so a Drive file that was
never shared publicly fails *before* it is saved, not silently on the
public site.

Because the image is one field on a record, the `curriculum` permission
gets its own rule narrowed by `hasOnly(["curriculumImageUrl", "updatedAt"])`
— someone trusted with curriculum images cannot also rename or unpublish
the major.

### Panel structure

The sidebar now reads: Dashboard · Website/CMS · Appearance · Majors ·
Specializations · Academic Years · Semesters · Courses/Subjects ·
Requirements · Prerequisites · Academic Tree/Curriculum · Users/Admins ·
Permissions · Settings · Audit Logs · Version History.

Two entries reuse rather than duplicate:

- **Permissions** deep-links into the matrix editor that already lives on
  the Users page, via a new `navHref`/`navFor` mechanism. A second editor
  would mean two places that must agree about what a grant means.
- **Version History** is a new *browse* page over existing snapshots. It
  hands off to the existing `openVersionHistory()` modal for comparison and
  rollback rather than reimplementing restore — which is a write to live
  content with its own permission, ownership and audit requirements.

### Shared module

`js/admin/academic-shared.js` holds what four near-identical screens would
otherwise each answer differently: the optional-level rule, reordering,
bilingual naming, form validation helpers, and the dependency-warning
delete dialog. It is **not** a second permission system — it calls `can()`
rather than deciding anything itself.

### Admin UX

Every academic screen is responsive, bilingual (EN/AR) with RTL/LTR via
logical CSS properties, searchable, filterable with cascading dropdowns,
sortable, reorderable, and has distinct loading / empty / no-matches /
error states, success toasts and confirmation dialogs.

Two details worth naming:

- **Empty and "no matches" are different states.** "You have no records
  yet" invites you to create one; "your filters match nothing" invites you
  to clear them. Showing the first when the second is true is how admins
  end up creating duplicates of records they already have.
- **Reorder arrows are logical, not visual.** ↑ always moves a row earlier
  in the curriculum, in both Arabic and English.

No fake or demo academic data is created anywhere.

### Still to do

- `firebase deploy --only firestore:indexes` before the new screens are
  used at scale — the composite indexes are declared but must be built.
- A human QA pass in a real browser, as noted for every previous phase.

---

**THIS IS PART 1 OF 3 OF THE ADDITIONAL CHANGES — admin structure and
academic management only. Parts 2 and 3 have not been implemented.**

---

## Phase 7 (Additional Changes, Part 2/3) — Website CMS & Appearance system

Continued from Part 1. Nothing was rebuilt, and the academic system from
Part 1 was not modified.

### One collection, one read

All CMS data lives in `siteConfig/{docId}` — five documents:
`appearance`, `homepage`, `content`, `navigation`, `settings`.

The public site fetches the whole collection **once per page session**
through `js/cms.js`, and every consumer awaits that same promise. Three
mechanisms make that hold:

- **Promise deduplication** — the in-flight promise is cached, not just the
  result. Five modules calling `loadCms()` in the same tick produce one
  request. Caching only the resolved value leaves a window open, and that
  window is the usual reason "cached" code still fires duplicate requests.
- **sessionStorage cache** — navigating between pages reuses the config.
- **A 5-minute TTL** — a tab left open all day doesn't pin stale content.

Previously `appearance.js` and `site-content.js` each ran their own query on
every page. Now there is exactly one.

### Draft / Published / Archived

Each document carries both copies in one envelope:

```
siteConfig/{id} = { draft: {...}, published: {...}, archived: [...], status, … }
```

Two values in one document, not two documents — so publishing is a single
atomic field copy rather than a cross-document write that can half-succeed
and leave the site showing content nobody approved.

**`edit` writes the draft. `publish` is required to touch `published`**, which
is the only field the public site reads. The rules enforce that with
`hasOnly()`, which is doing the load-bearing work: without it, an admin with
only `edit` could smuggle a `published` key into the same write. The panel
disables the Publish button; the rules refuse the write even if the panel is
bypassed entirely.

Publishing archives the previous live version (capped at 10), so it is
reversible. Restoring puts a version back into the **draft**, not straight
onto the site.

### Appearance

Colours, radius, border width, container width, section spacing, shadows,
typography, density, light/dark/auto, button/card/header/navbar/footer/hero
styles, logo and favicon.

Two mechanisms and no third:

1. **CSS custom properties** for anything continuous. The stylesheets already
   read these tokens, so changing one updates every button, link and card
   site-wide with no new CSS.
2. **`data-*` attributes on `<html>`** for style choices, with one reviewed
   block per option in the new `css/appearance.css`.

**There is no custom-CSS or custom-JS field, and that is a refusal rather
than an omission.** A text box injected into every visitor's page is a
defacement and script-injection vector. Admins choose among looks defined in
reviewed code.

Two details worth naming:
- Hover and tint shades are *derived* from the primary colour rather than
  being three fields an admin must keep in sync by eye.
- Button text colour is computed from the primary colour's **relative
  luminance**, so a pale brand colour gets dark text instead of unreadable
  white-on-yellow. The CMS shouldn't be able to produce an inaccessible site
  through a choice that looked reasonable.

### Live preview

The preview calls `applyAppearance()` from `js/appearance-engine.js` — the
**exact function the public site uses** — scoped to a preview container.

That required splitting the pure renderer out of `appearance.js`, whose
import-time side effects would otherwise have re-themed the Admin Panel
itself: an admin previewing a dark theme would have found the form they were
editing had gone dark underneath them. A separately-maintained preview
drifts, and a drifted preview confidently shows something the site won't do.

### ICC identity preserved

`#389FFF` primary, `#D8DCDE` secondary, white, black, and the Academy
typeface remain the defaults and the "Reset to ICC defaults" target. An admin
who changes nothing gets exactly the site that shipped.

### Homepage CMS

The homepage is now an ordered list of section records (Hero, About,
Features, Statistics, Academic Programs, Announcements, CTA, Footer) with
add / edit / delete / show / hide / reorder, bilingual fields throughout, and
each type declaring which fields it actually uses.

CMS sections render into a **dedicated mount** alongside the shipped
homepage — they don't replace it. Turning the CMS on can't blank the
homepage, and turning it off can't either.

### Website content

Every editable string — navbar, hero, about, academic headings, search,
empty states, error messages, CTA, footer, contact — grouped into tabs.

**An empty field means "use the built-in text", never "blank this
element."** Each field's placeholder shows what the site currently says. If
blank meant blank, opening this screen and saving once would wipe every
string nobody had typed into — a trap, not a feature.

Precedence: `siteConfig/content` → legacy `siteContent/*` → `js/language.js`.
The dictionary is consulted last but emphatically **not removed** — it's what
a visitor sees before Firestore replies and what they keep seeing if it never
does.

### Navigation

Primary menu and footer links with bilingual labels, URL, active flag,
new-tab flag and reordering.

URLs go through an **allow-list** of schemes (http, https, mailto, tel, plus
site-relative paths) — not a block-list. `javascript:` is only the obvious
case; there is also `data:text/html`, `vbscript:`, and the fact that browsers
ignore whitespace inside a scheme, so `java\tscript:` still runs. An
allow-list sidesteps the category rather than racing it.

Checked three times, deliberately: in the form (so the admin gets a real
error), on load, and again when the anchor is built. New-tab links get
`rel="noopener noreferrer"`.

The CMS nav renders into **both** the desktop and mobile menus, re-derives
the current-page marker from the href, and re-attaches the mobile
close-on-click handler that `ui.js` bound to the now-replaced elements.

### Settings

Six validated groups: General, Localization, SEO, Social, Contact,
Maintenance. Declared once in `SETTINGS_GROUPS` and generated from that
declaration.

**Maintenance mode is a notice, not a gate**, and the UI says so. This is a
static site; a "maintenance wall" drawn in JavaScript stops nobody who can
open developer tools, so presenting it as access control would be a false
assurance.

### Public integration

`index.html` and the other public pages now load `css/appearance.css` and
`js/site-chrome.js`, carry `data-cms-text` bindings, and expose mount points
for CMS nav, footer links and homepage sections. No hardcoded value overrides
a Firestore CMS value — the built-in text is a *fallback beneath* the CMS,
not a competitor to it.

### Note on siteConfig read access

`siteConfig` is world-readable, including drafts, and that is a deliberate
trade: this is website copy and colours, an unpublished headline is not a
secret, and splitting drafts into a second collection would cost the public
site a second read on every page to protect nothing of value. Nothing
sensitive may be stored there — which is why users, audit logs and academic
records remain separate collections with their own rules.

### Still to do

- Deploy rules and indexes (`firebase deploy --only firestore`).
- A human QA pass in a real browser.

---

**THIS IS PART 2 OF 3 OF THE ADDITIONAL CHANGES — Website CMS, navigation,
appearance and settings. Part 3 has not been implemented.**

---

## Phase 8 (Additional Changes, Part 3/3) — granular permissions, security, audit logs & version history

This part was a **gap-closing pass, not a rebuild**. Parts 1 and 2 had already
landed, and much of Part 3's architecture existed from Phases 5–7: the
per-section/per-action matrix in `js/permissions.js`, ownership scoping, the
draft/publish workflow, append-only `auditLogs` and `versions`, and
`firestore.rules` as the real authorization boundary. Every existing feature is
preserved; nothing was regenerated.

What follows is what was actually **missing or broken**, and what was done.

### 1. `dashboard` was not a permission resource

The brief lists Dashboard among the resources. It wasn't one: the sidebar
hard-coded the link and `dashboard.js` passed `null` to the guard, so every
admin could open it.

- Added `dashboard` to the `PERMISSIONS` catalog (view-only) under a new
  `overview` group, rendered headerless so it still reads as a top-level link.
- `admin-nav.js` no longer hard-codes the link — it comes from the matrix like
  every other section.
- `dashboard.js` now calls `protectAdminPage("dashboard", …)`.
- **New `landingPage(profile)` helper.** Because `index.html` is now revocable,
  sign-in and the 403 screen can no longer assume it's reachable. An admin
  without the dashboard lands on the first section they *do* hold. Wired into
  `login.js`, `redirectIfAlreadyAdmin()` and the 403 escape links.
- **Upgrade safety:** a legacy `{section: true}` permission map implies
  `dashboard`, so existing admins don't silently lose the overview. An explicit
  per-action matrix does *not* imply it — there, absence means a Super Admin saw
  the checkbox and left it unticked. Absence means "old data" in one case and
  "no" in the other, and the two must not be conflated.

### 2. Dashboard cards ignored permissions entirely

Every stat card rendered for everyone, and `getDashboardCounts()` queried all six
collections regardless. The brief says *do not load its data* — a card reading
"—" still sends the query and still tells you the section exists.

- `filterStatCards()` removes unpermitted cards from the DOM **before** any load.
- `getDashboardCounts(allowed)` takes the permitted section list and queries
  nothing else.

### 3. Three CRUD screens had no action-level gating at all

`requirements-admin.js`, `prerequisites-admin.js` and `tree-admin.js` had only
the page-level VIEW check. A VIEW-only admin saw Add, Edit, Delete and the
activate toggle. `firestore.rules` would have refused the writes — but only
*after* they'd filled in the form.

- Row buttons now gated per action (reuses `actionsCellHTML()`).
- New shared `gateToolbar()` in `academic-shared.js` removes page-level Create
  controls and surfaces a read-only notice, so the absence of buttons reads as a
  permission rather than a bug.
- **Every click handler re-checks before acting**, so a handler reached any other
  way (stale row, console) still can't perform an unheld action.
- Correct action mapping, which was the subtle part: reordering and re-parenting
  are writes → `EDIT`; the activate/deactivate toggle changes public visibility →
  `PUBLISH`, not `EDIT`.

### 4. Audit record shape didn't match the brief

Missing `resource`, `resourceId`, `resourceName`, `actorDisplayName`, `changes`
and `metadata`.

- All now written. `section`/`resource` and `entityId`/`resourceId` hold the same
  values — the duplication costs a few bytes per record and avoids migrating both
  every reader and every stored row.
- `metadata` carries caller context (which version was restored, bulk size).
  Never credentials.
- `firestore.rules` accepts **either** `section` or `resource` on create, so
  records from older builds and the current build are both valid.

### 5. Action vocabulary was incomplete

`publish`, `unpublish`, `restore_version` and the CMS-specific change actions
were recorded but **could not be filtered for** — which is most of what an audit
screen is for.

- Canonical `AUDIT_ACTIONS` list now lives in `audit-log.js`; the filter reads it
  rather than keeping a second hand-maintained copy (they had already drifted).
- `permissions` → `permission_change` and `restore` → `restore_version` via an
  alias map applied on write and understood on read. **Existing rows are not
  rewritten** — retroactively tidying an audit log is exactly the thing an audit
  log must never do.
- A generic `update` on a CMS document is specialized into
  `settings_change` / `appearance_change` / `content_change`, so "every time
  anyone touched the site's appearance" is one filter selection. Only `update` is
  specialized — a delete stays a delete.

### 6. `canDelete()` on the Audit screen was broken

It asked for a permission named `auditDelete`, which is **not a section in the
catalog** — so `can()` always returned false and the control was unreachable for
every non-Super-Admin no matter what was granted. Now checks
`audit` + `DELETE` correctly.

### 7. Audit Logs UI was missing the date and admin filters

The brief requires both; a code comment even claimed actor filtering was already
pushed into the query. It wasn't.

- Added admin (actor) and from/to date filters, plus Clear filters.
- `getAuditLogs()` takes `from` / `to` as range filters on `at` — the same field
  the results are ordered by, which Firestore permits without an extra index.
- **The actor list is built from actors present in the loaded rows, not from the
  user collection.** An admin holding `audit` but not `users` can't read `users`
  at all and would get an empty dropdown; and a deleted account still appears in
  the log, so filtering by it must stay possible.
- Detail view gained actor UID and the `metadata` block; CSV export updated.

### 8. Users table was missing UID, Created and Updated

All three added (§8 of the brief). Passwords are neither stored nor displayed —
they never were; Firebase Auth holds credentials and the panel never sees them.

### 9. CMS version history was invisible to the History page

Appearance / Homepage / Content / Navigation versions live in an `archived` array
**inside** each `siteConfig` document, so the Version History page — whose whole
purpose is answering "something changed yesterday, what was it" — was blind to
every website content change.

- Publishing and archiving now also mirror a snapshot into the `versions`
  collection, so CMS changes appear in the same history as academic records. A
  snapshot failure is logged and stepped over; it must never block a publish.
- `history-admin.js` resolves CMS sections by **document id**, not collection —
  all five share `siteConfig`, so resolving by collection alone would have
  labelled every website change with whichever section claims it in the catalog.
- **CMS rows link out to their owning editor instead of offering restore.**
  Writing a bare snapshot over a draft/published envelope would corrupt the
  document; the owning screen holds the state this page can't see.
- The CMS history modal gained a **compare** view, diffing an archived version
  against the current draft by flattened dotted path
  (`sections[2].title.en`) — a shallow comparison would only say "sections
  changed", which answers nothing.
- Restores now log `restore_version` with the version's identity in `metadata`.

### 10. Indexes

Added the composite indexes the new filter combinations require
(`section`+`action`+`at`, `action`+`actorUid`+`at`,
`section`+`action`+`actorUid`+`at`) and two for `versions`
(`collectionName`+`docId`+`at`) that had been missing since Phase 6 and now
matter more because CMS snapshots use them.

### Verification performed

`js/permissions.js` was exercised directly against the brief's §14 scenarios —
Admin A (Semesters + Courses: view/create/edit), Admin B (Tree/Content/Homepage/
Appearance with selective publish), Admin C (Requirements full, Courses
view-only), plus permission revocation taking effect immediately, privilege-
escalation attempts through `sanitizePermissions()`, Super Admin passthrough,
legacy-shape upgrades, disabled/non-admin rejection, ownership narrowing and
fail-closed behaviour, and catalog integrity against the brief's resource list.
**All passed.** Every `.js` file parses, and every i18n key referenced from JS or
HTML resolves in both English and Arabic (1063 keys each, balanced).

### What still needs a human

- **Deploy the rules and indexes:** `firebase deploy --only firestore:rules,firestore:indexes`.
  The index build takes a few minutes; audit filters will error until it finishes.
- **Grant `dashboard` explicitly** to any admin created with a per-action matrix
  from now on — it is no longer implied.
- **Click-through QA** of the §14 scenarios against a real Firebase project.
  The permission logic is unit-verified, but the rules themselves are only
  verifiable against a live project (or the emulator: `firebase emulators:start`).
- **Scoped permissions (§13)** are architecturally supported — `ownership` narrows
  by major today, and `OWNERSHIP_SCOPES` takes a second scope as an entry plus a
  resolver rather than a redesign. Deliberately not expanded further, per the
  brief's instruction not to add complexity that isn't needed yet.

---

## Icon system and navigation pass

Two changes that cut across every page: icons became SVG, and the menus were
rebuilt.

### Icons — `js/icons.js` + `css/icons.css`

Every icon on the site used to be a Unicode character typed into markup or a
template string: `✎`, `🗑`, `▦`, `⚿`, `→`. That is fine on the machine it was
written on and unreliable everywhere else. Glyph coverage varies by font, so
several of them fall back to an empty box on Windows; `🗑` renders as a colour
emoji on some platforms and a mono outline on others; none of them take a
colour, a size or a stroke weight from CSS; and a few are simply missing from
the Arabic font stack, so they vanish when the site is switched to Arabic.
Two of them — the arrows in "Back to the public site" — were baked into the
*translated strings themselves*, which meant the English and Arabic versions
pointed in opposite directions by hand.

`js/icons.js` is now the single source: ~65 icons, each a 24×24 `viewBox`
stroked with `currentColor`, so an icon inherits the colour of whatever it sits
in — including hover and active states — with no per-icon CSS.

```js
import { icon } from "./icons.js";      // ES modules
icon("trash")
window.ICC_ICONS.icon("trash")          // classic scripts (js/ui.js, js/gpa.js)
```

`css/icons.css` decides size and direction in one place. Icons are sized in
`em` by default, so one next to a heading is larger than one next to a caption
without anyone picking a pixel value; `.icon--sm/md/lg/xl` override it where a
component shouldn't inherit a surprising `font-size`. Directional icons —
arrows, chevrons, the external-link mark — are mirrored under `html[dir="rtl"]`,
and only those: a mirrored clock or magnifier just looks broken, so
`FLIP_IN_RTL` in `js/icons.js` lists exactly which ones flip.

Icons are decorative by default (`aria-hidden`), because nearly all of them sit
beside a visible label or on a button that already carries an `aria-label`.
Pass `{ label }` for the rare icon that is the only thing identifying a control.

Admin sidebar icons are stored as **names** on each entry in `js/permissions.js`
(`icon: "grid"`), not as characters, and resolved at render time by
`js/admin/admin-nav.js` and `js/admin/search-admin.js`.

### Navigation

**Public site.** The burger is two cross-fading SVGs (menu ↔ close) rather than
three CSS bars folding into an X. The panel animates instead of flipping
between `display:none` and `display:block`, and is hidden from assistive tech
while closed. Beyond the look, these were broken:

- **The scroll lock dumped visitors at the top of the page.** It was
  `overflow:hidden` on `<body>`, which iOS Safari ignores; the fix
  (`position:fixed`) needs the scroll offset stashed and restored, which
  wasn't happening. `lockScroll()`/`unlockScroll()` in `js/ui.js` now do
  that, and they're a counter rather than a boolean because the menu and
  the curriculum lightbox can both be open at once.
- **No way out except the burger.** There is now a scrim to tap, `Escape`,
  and close-on-hashchange for in-page anchors like `requirements.html#college`.
- **Focus stayed behind the overlay**, so keyboard and screen-reader users
  tabbed through links they couldn't see. Focus now moves into the panel and
  is trapped there until it closes.
- **The menu survived a resize into the desktop layout**, where the panel is
  hidden but the page stayed scroll-locked behind it. It closes past the
  breakpoint now, and the panel and scrim are `display:none` above 880px so a
  stale `is-open` can't park an invisible full-screen scrim over the site.
- **CMS-rendered links didn't close it.** `js/ui.js` bound clicks to the links
  present at startup; `js/site-chrome.js` replaces those elements. Closing is
  delegated to the panel now, so links that appear later are covered.
- **`js/site-chrome.js` deleted the mobile language switcher.** Rendering a
  CMS nav did `container.textContent = ""` on the whole panel, which took the
  footer with it. The link list (`[data-nav-mobile]`) and the panel
  (`[data-nav-panel]`) are separate elements now, so the CMS can only clear
  the links.
- **The mobile menu never showed the current page.** Its links carry
  `data-nav-key` like the desktop ones, and get the same `aria-current`.

**Admin panel.** The sidebar toggle was `<button><span></span></button>` with
no CSS for that span anywhere — on a phone it rendered as an empty box. It is
now the same menu/close pair, with a fading scrim, `Escape` to close, focus
management, and `aria-expanded` tracked. Its link clicks are delegated too:
`js/admin/admin-nav.js` renders the sidebar *after* `admin-ui.js` runs and
re-renders it on every language switch, so the old per-`<a>` binding meant the
drawer stayed open on top of the page you'd just navigated to.

New i18n keys: `nav_menu_open`, `nav_menu_close`, `gpa_remove_course`,
`lightbox_close` (EN + AR). `admin_back_to_site` lost its embedded arrow.
