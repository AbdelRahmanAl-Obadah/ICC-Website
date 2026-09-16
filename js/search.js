/**
 * search.js
 * -----------------------------------------------------------------------
 * PHASE 4A: real global public search across active majors, subjects and
 * requirements — powers search.html.
 *
 * SEARCH PERFORMANCE (see brief §7):
 * Firestore is read exactly once per page load (three parallel queries —
 * active majors, active subjects, active requirements), cached in module
 * scope, and every keystroke afterwards filters that in-memory array.
 * There is no per-keystroke Firestore call, and no external search
 * service (Algolia/Elasticsearch/Meilisearch/etc.) — just plain
 * client-side string matching, kept in its own module so it's easy to
 * swap for something bigger later without touching search.html.
 *
 * SEARCH LANGUAGE SUPPORT (see brief §2):
 * Matching is done against every bilingual field (name.en + name.ar,
 * description.en + description.ar, etc.) plus code fields, lower-cased on
 * both sides, so "CS", "cs", "Computer Science" and "علوم الحاسوب" all
 * work as expected regardless of the site's currently selected language.
 *
 * NO FAKE DATA (see brief §15):
 * Every record here comes straight from Firestore via firestore.js. If
 * Firestore isn't configured yet (FirestoreNotConfiguredError) or has no
 * data, search simply returns zero results — nothing here ever fabricates
 * a placeholder result.
 * ------------------------------------------------------------------------
 */

import {
  getActiveMajors,
  getActiveSubjects,
  getRequirements,
  FirestoreNotConfiguredError,
} from "./firestore.js";

/* ==========================================================================
   DATA LAYER — index build + matching. Exported so it can be reused by
   anything else that wants "search the platform" later without needing a
   search.html-shaped DOM (e.g. a future search-as-you-type widget in nav).
   ========================================================================== */

let indexCache = null;
let indexPromise = null;

function norm(value) {
  return (value ?? "").toString().toLowerCase().trim();
}

/**
 * Load (and cache) the searchable index: active majors, active subjects
 * (across every major), and active requirements. Safe to call many times —
 * only the first call actually hits Firestore.
 */
export async function loadSearchIndex() {
  if (indexCache) return indexCache;
  if (!indexPromise) {
    indexPromise = Promise.all([getActiveMajors(), getActiveSubjects(), getRequirements()])
      .then(([majors, subjects, requirements]) => {
        indexCache = {
          majors,
          subjects,
          requirements,
          majorsById: new Map(majors.map((m) => [m.id, m])),
        };
        return indexCache;
      })
      .catch((err) => {
        indexPromise = null; // allow retrying (e.g. after Firebase config is fixed)
        throw err;
      });
  }
  return indexPromise;
}

function majorHaystack(m) {
  return [m.name?.en, m.name?.ar, m.code, m.college, m.description?.en, m.description?.ar].map(norm);
}
function subjectHaystack(s) {
  return [s.name?.en, s.name?.ar, s.code, s.description?.en, s.description?.ar].map(norm);
}
function requirementHaystack(r) {
  return [r.name?.en, r.name?.ar, r.code, r.description?.en, r.description?.ar].map(norm);
}

function anyIncludes(haystack, needle) {
  return haystack.some((field) => field && field.includes(needle));
}

/**
 * Search the cached index. `filter` is one of "all" | "majors" | "subjects"
 * | "requirements". Returns { majors, subjects, requirements } — subjects
 * are annotated with `.major` (the resolved parent major doc, or null) so
 * result rendering never has to look it up separately.
 */
export async function runSearch(queryText, filter = "all") {
  const needle = norm(queryText);
  const out = { majors: [], subjects: [], requirements: [] };
  if (!needle) return out;

  const { majors, subjects, requirements, majorsById } = await loadSearchIndex();

  if (filter === "all" || filter === "majors") {
    out.majors = majors.filter((m) => anyIncludes(majorHaystack(m), needle));
  }
  if (filter === "all" || filter === "subjects") {
    out.subjects = subjects
      .filter((s) => anyIncludes(subjectHaystack(s), needle))
      .map((s) => ({ ...s, major: majorsById.get(s.majorId) || null }));
  }
  if (filter === "all" || filter === "requirements") {
    out.requirements = requirements.filter((r) => anyIncludes(requirementHaystack(r), needle));
  }
  return out;
}

export function resultCount(results) {
  return results.majors.length + results.subjects.length + results.requirements.length;
}

/* ==========================================================================
   PAGE CONTROLLER — everything below only runs on search.html (guarded by
   the presence of #searchInput), so importing this module elsewhere for
   its search functions alone is safe and side-effect-free at import time.
   ========================================================================== */

const CATEGORY_ANCHOR = { "free-elective": "electives", university: "university", college: "college" };
const CATEGORY_LABEL_KEY = {
  "free-elective": "admin_cat_free_elective",
  university: "admin_cat_university",
  college: "admin_cat_college",
};

function escapeHTML(str) {
  return (str ?? "").toString().replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function debounce(fn, wait) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function majorResultHTML(m, lang, t) {
  const name = escapeHTML(m.name?.[lang] || m.name?.en || m.code || m.id);
  const meta = [m.code, m.college].filter(Boolean).map(escapeHTML).join(" · ");
  return `
    <a class="search-result" href="major.html?id=${encodeURIComponent(m.id)}">
      <div>
        <div class="search-result__title">${name}</div>
        <div class="search-result__meta">${meta}</div>
      </div>
      <span class="tag">${escapeHTML(t("filter_majors", lang))}</span>
    </a>
  `;
}

function subjectResultHTML(s, lang, t) {
  const name = escapeHTML(s.name?.[lang] || s.name?.en || s.code || s.id);
  const majorName = s.major ? escapeHTML(s.major.name?.[lang] || s.major.name?.en || "") : "";
  const meta = [s.code, s.creditHours != null ? `${s.creditHours} ${t("credit_hours", lang)}` : null, majorName]
    .filter(Boolean)
    .join(" · ");
  const href = s.major ? `major.html?id=${encodeURIComponent(s.major.id)}` : "majors.html";
  return `
    <a class="search-result" href="${href}">
      <div>
        <div class="search-result__title">${name}</div>
        <div class="search-result__meta">${meta}</div>
      </div>
      <span class="tag">${escapeHTML(t("filter_subjects", lang))}</span>
    </a>
  `;
}

function requirementResultHTML(r, lang, t) {
  const name = escapeHTML(r.name?.[lang] || r.name?.en || r.code || r.id);
  const catLabel = t(CATEGORY_LABEL_KEY[r.category] || "filter_requirements", lang);
  const meta = [r.code, r.creditHours != null ? `${r.creditHours} ${t("credit_hours", lang)}` : null, catLabel]
    .filter(Boolean)
    .map(escapeHTML)
    .join(" · ");
  const anchor = CATEGORY_ANCHOR[r.category];
  const href = anchor ? `requirements.html#${anchor}` : "requirements.html";
  return `
    <a class="search-result" href="${href}">
      <div>
        <div class="search-result__title">${name}</div>
        <div class="search-result__meta">${meta}</div>
      </div>
      <span class="tag">${escapeHTML(t("filter_requirements", lang))}</span>
    </a>
  `;
}

function groupHTML(titleKey, rowsHTML, count, lang, t) {
  if (!count) return "";
  return `
    <div class="search-group">
      <h3 class="search-group__title">${escapeHTML(t(titleKey, lang))} <span class="search-group__count">(${count})</span></h3>
      <div class="search-results">${rowsHTML}</div>
    </div>
  `;
}

function renderResultsHTML(results, lang, t) {
  return [
    groupHTML("filter_majors", results.majors.map((m) => majorResultHTML(m, lang, t)).join(""), results.majors.length, lang, t),
    groupHTML(
      "filter_subjects",
      results.subjects.map((s) => subjectResultHTML(s, lang, t)).join(""),
      results.subjects.length,
      lang,
      t
    ),
    groupHTML(
      "filter_requirements",
      results.requirements.map((r) => requirementResultHTML(r, lang, t)).join(""),
      results.requirements.length,
      lang,
      t
    ),
  ].join("");
}

function initSearchPage() {
  const input = document.getElementById("searchInput");
  const btn = document.getElementById("searchBtn");
  const container = document.querySelector("[data-state-container]");
  if (!input || !btn || !container) return; // not on search.html

  const resultsMount = container.querySelector("[data-results-mount]");
  const filterButtons = Array.from(document.querySelectorAll("[data-search-filter]"));

  let currentFilter = "all";

  function setState(state) {
    container.querySelectorAll("[data-state]").forEach((el) => {
      el.hidden = el.getAttribute("data-state") !== state;
    });
  }

  function syncURL(q) {
    const url = new URL(window.location.href);
    if (q) url.searchParams.set("q", q);
    else url.searchParams.delete("q");
    window.history.replaceState({}, "", url);
  }

  async function performSearch({ updateURL = true } = {}) {
    const q = input.value.trim();
    if (updateURL) syncURL(q);

    if (!q) {
      setState("idle");
      return;
    }

    setState("loading");
    const lang = window.ICC_I18N.getStoredLang();
    const t = window.ICC_I18N.t;

    try {
      const results = await runSearch(q, currentFilter);
      if (!resultCount(results)) {
        setState("no-results");
        return;
      }
      resultsMount.innerHTML = renderResultsHTML(results, lang, t);
      setState("results");
    } catch (err) {
      console.error("[ICC] Search failed:", err);
      if (err instanceof FirestoreNotConfiguredError) {
        setState("idle");
      } else {
        setState("error");
      }
    }
  }

  const debouncedSearch = debounce(() => performSearch({ updateURL: true }), 250);

  filterButtons.forEach((f) => {
    f.addEventListener("click", () => {
      filterButtons.forEach((b) => b.classList.remove("is-active"));
      f.classList.add("is-active");
      currentFilter = f.getAttribute("data-search-filter") || "all";
      if (input.value.trim()) performSearch({ updateURL: false });
    });
  });

  btn.addEventListener("click", () => performSearch({ updateURL: true }));
  input.addEventListener("input", debouncedSearch);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      performSearch({ updateURL: true });
    }
  });

  // Re-render (from the already-cached index — no refetch) on language switch.
  document.addEventListener("icc:languagechange", () => {
    if (input.value.trim()) performSearch({ updateURL: false });
  });

  // URL SEARCH (brief §5): ?q= populates the field and runs automatically;
  // refreshing the page preserves the query because it's read from the URL
  // again here on every load.
  const initialQuery = new URLSearchParams(window.location.search).get("q");
  if (initialQuery) {
    input.value = initialQuery;
    performSearch({ updateURL: false });
  } else {
    setState("idle");
  }

  // Warm the index in the background so the first real search feels instant.
  loadSearchIndex().catch(() => {
    /* surfaced on first actual search instead */
  });
}

document.addEventListener("DOMContentLoaded", initSearchPage);
