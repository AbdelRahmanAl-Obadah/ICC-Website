/**
 * cms.js
 * -----------------------------------------------------------------------
 * PHASE 7 (Part 2) — the public site's single entry point to CMS data.
 *
 * ==========================================================================
 * ONE READ, SHARED BY EVERYTHING
 * ==========================================================================
 * Before this module, appearance.js and site-content.js each ran their own
 * Firestore query on every page, and anything else that wanted CMS data
 * would have added a third. The brief is explicit that a Firestore request
 * per UI element is not acceptable, and it is right: each query is a round
 * trip that happens before the page can finish painting.
 *
 * So there is exactly ONE query — `getPublishedConfig()`, which returns all
 * five CMS documents — and everything else awaits the same promise.
 *
 * Three layers make that work:
 *
 *   1. PROMISE DEDUPLICATION. `load()` caches the in-flight promise, not
 *      just the result. Five modules calling load() during the same tick
 *      produce one network request, because the four that arrive while the
 *      first is still open get handed the same promise. Caching only the
 *      resolved value would leave that window open and is the usual reason
 *      "cached" code still fires duplicate requests.
 *
 *   2. SESSION CACHE. The result is kept in sessionStorage, so navigating
 *      from the homepage to a major page reuses the config instead of
 *      re-fetching it. Session rather than local storage: a CMS change
 *      should reach visitors on their next visit without anyone clearing
 *      anything, and a session is a short enough window for that to be
 *      true while still covering a browsing session's worth of navigation.
 *
 *   3. TTL. Even within a session the cache expires, so a tab left open
 *      all day doesn't pin yesterday's content forever.
 *
 * ==========================================================================
 * FAIL-SOFT, ALWAYS
 * ==========================================================================
 * If Firestore is unreachable, unconfigured, or the collection is empty,
 * every getter returns the schema defaults and the site renders exactly as
 * it shipped. A CMS that can take the public site down by being offline is
 * not an improvement over hard-coded values, and this one cannot: nothing
 * here throws into a caller, and nothing removes existing content — it
 * only ever overrides what it successfully read and validated.
 * ------------------------------------------------------------------------ */

import { getPublishedConfig } from "./firestore.js";
import {
  CMS_DOCS,
  normalizeAppearance,
  normalizeHomepage,
  normalizeContent,
  normalizeNavigation,
  normalizeSettings,
  pickLang,
} from "./cms-schema.js";

const CACHE_KEY = "icc-cms-cache-v1";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** The in-flight or completed load. Shared by every caller — see (1) above. */
let loadPromise = null;

/** The validated config, or null before the first successful load. */
let config = null;

export function currentLang() {
  return (window.ICC_I18N && window.ICC_I18N.getStoredLang()) || "en";
}

/* ==========================================================================
   SESSION CACHE
   ========================================================================== */

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || Date.now() - parsed.at > CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    // Private mode, quota, or corrupt entry — just skip the cache.
    return null;
  }
}

function writeCache(data) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* storage unavailable — caching is an optimization, not a requirement */
  }
}

/** Drop the cache. Used by the admin preview so it never sees stale data. */
export function invalidateCache() {
  loadPromise = null;
  config = null;
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    /* nothing to do */
  }
}

/* ==========================================================================
   NORMALIZATION
   ========================================================================== */

/**
 * Run every raw document through its validator once, at load time, rather
 * than at each point of use. Consumers then never have to ask whether a
 * value is trustworthy — by the time they see it, it is.
 */
function normalizeAll(raw) {
  return {
    appearance: normalizeAppearance(raw?.[CMS_DOCS.APPEARANCE]),
    homepage: { sections: normalizeHomepage(raw?.[CMS_DOCS.HOMEPAGE]) },
    content: normalizeContent(raw?.[CMS_DOCS.CONTENT]),
    navigation: normalizeNavigation(raw?.[CMS_DOCS.NAVIGATION]),
    settings: normalizeSettings(raw?.[CMS_DOCS.SETTINGS]),
    // Distinguishes "the CMS answered and had nothing" from "the CMS never
    // answered". Consumers that want to leave the shipped markup alone
    // when Firestore is down check this.
    loaded: !!raw,
  };
}

/* ==========================================================================
   LOADING
   ========================================================================== */

/**
 * Load the published CMS config. Safe to call from anywhere, any number of
 * times — the work happens once.
 */
export function loadCms() {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const cached = readCache();
    if (cached) {
      config = normalizeAll(cached);
      return config;
    }

    try {
      const raw = await getPublishedConfig();
      writeCache(raw);
      config = normalizeAll(raw);
    } catch (err) {
      // Not configured, offline, or no permission — defaults it is.
      console.info("[ICC] CMS not loaded; using built-in defaults.", err?.message || err);
      config = normalizeAll(null);
    }
    return config;
  })();

  return loadPromise;
}

/**
 * The config as it stands right now, without waiting.
 * Returns validated defaults before the first load resolves, so a caller
 * that runs early gets a complete object rather than null — no consumer
 * needs a "not ready yet" branch.
 */
export function getCms() {
  if (!config) config = normalizeAll(null);
  return config;
}

/* ==========================================================================
   ACCESSORS
   ========================================================================== */

export function getAppearance() {
  return getCms().appearance;
}

export function getHomepageSections() {
  return getCms().homepage.sections.filter((s) => s.visible);
}

export function getNavigation(which = "primary") {
  const nav = getCms().navigation;
  return (nav[which] || []).filter((item) => item.active);
}

export function getSettings(group) {
  const settings = getCms().settings;
  return group ? settings[group] || {} : settings;
}

/**
 * A CMS text value for the current language.
 *
 * Returns "" when the CMS has nothing for this key, which every caller
 * treats as "keep whatever is already on the page". That is what makes the
 * CMS additive: an empty field means "use the built-in text", never "blank
 * this element". A half-filled CMS degrades to the shipped site rather
 * than to a page of empty headings.
 */
export function getText(key, language = currentLang()) {
  const value = getCms().content[key];
  return value ? pickLang(value, language) : "";
}

/** Bilingual value → string, for section fields already loaded from the CMS. */
export function localize(value, language = currentLang()) {
  return pickLang(value, language);
}

/* ==========================================================================
   MAINTENANCE MODE
   ========================================================================== */

/**
 * Whether the site is flagged for maintenance, and the message to show.
 *
 * Deliberately reported rather than acted on here: this module's job is to
 * supply data. What a page does about maintenance mode — and crucially,
 * that the Admin Panel must stay reachable so someone can turn it back
 * off — is the page's decision, not a side effect of loading config.
 */
export function getMaintenance(language = currentLang()) {
  const m = getSettings("maintenance");
  return {
    active: m.maintenance_mode === true,
    message:
      (language === "ar" ? m.maintenance_message_ar : m.maintenance_message_en) ||
      m.maintenance_message_en ||
      "",
  };
}

// Kick the load off as soon as this module is evaluated rather than on
// DOMContentLoaded: the request can be in flight while the browser is
// still parsing the rest of the page.
loadCms();
