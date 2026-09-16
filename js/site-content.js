/**
 * site-content.js
 * -----------------------------------------------------------------------
 * PHASE 7 (Part 2) — applies CMS-managed text to the public site.
 *
 * ==========================================================================
 * THE PRECEDENCE RULE
 * ==========================================================================
 * Three sources can supply a string, and they are consulted in this order:
 *
 *   1. siteConfig/content  — the CMS. Wins whenever it has a non-empty
 *                            value for the key.
 *   2. siteContent/*       — the Phase 5 documents. Still honoured, so
 *                            text entered before this phase is not lost.
 *   3. js/language.js      — the built-in dictionary. The final fallback.
 *
 * The brief asks that no hardcoded value override a Firestore CMS value,
 * and this ordering is that requirement: the dictionary is consulted last
 * and only when nothing above it answered. It is emphatically NOT removed,
 * because it is what a visitor sees in the moment before Firestore replies
 * and what they keep seeing if it never does. Deleting the defaults
 * wouldn't make the CMS more authoritative — it would make an offline
 * Firestore render a page of empty headings.
 *
 * An EMPTY CMS field therefore means "use the built-in text", never "blank
 * this element". That is what lets an admin fill the CMS in gradually.
 *
 * ==========================================================================
 * WIRING CONTRACT
 * ==========================================================================
 *   <h1 data-cms-text="hero_title">…</h1>          CMS content key
 *   <h1 data-site-content="hero:title">…</h1>      legacy, still supported
 *
 * Text is written with textContent, never innerHTML: an admin-editable
 * string that reaches every visitor must not be able to carry markup.
 * ------------------------------------------------------------------------ */

import { loadCms, getText, currentLang } from "./cms.js";
import { getSiteContent } from "./firestore.js";

/** Legacy siteContent documents, loaded lazily and only if the page needs them. */
let legacyCache = null;

function legacyValue(docId, fieldBase, language) {
  if (!legacyCache) return "";
  const doc = legacyCache[docId];
  if (!doc) return "";
  const value = doc[`${fieldBase}_${language}`];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Apply every binding on the page.
 *
 * Runs again on each language switch, because language.js resets
 * data-i18n elements back to their dictionary text when the language
 * flips — so without a re-apply, switching language would silently revert
 * CMS-managed strings to the built-in ones.
 */
function apply() {
  const language = currentLang();

  // --- New CMS bindings -------------------------------------------------
  document.querySelectorAll("[data-cms-text]").forEach((el) => {
    const key = el.getAttribute("data-cms-text");
    if (!key) return;
    const value = getText(key, language);
    if (value) el.textContent = value;
  });

  // --- Legacy bindings --------------------------------------------------
  document.querySelectorAll("[data-site-content]").forEach((el) => {
    const [docId, fieldBase] = (el.getAttribute("data-site-content") || "").split(":");
    if (!docId || !fieldBase) return;

    // The CMS wins when it has something to say. An element carrying both
    // attributes has already been handled above; this only fills the gap
    // where the CMS is silent.
    if (el.hasAttribute("data-cms-text") && getText(el.getAttribute("data-cms-text"), language)) {
      return;
    }

    const value = legacyValue(docId, fieldBase, language);
    if (value) el.textContent = value;
  });
}

/** Attribute bindings — placeholders, alt text, aria-labels. */
function applyAttributes() {
  const language = currentLang();
  document.querySelectorAll("[data-cms-attr]").forEach((el) => {
    // format: "attr:contentKey, attr2:contentKey2"
    el.getAttribute("data-cms-attr")
      .split(",")
      .forEach((pair) => {
        const [attr, key] = pair.split(":").map((s) => s.trim());
        if (!attr || !key) return;
        const value = getText(key, language);
        if (value) el.setAttribute(attr, value);
      });
  });
}

async function init() {
  const needsCms = document.querySelector("[data-cms-text], [data-cms-attr]");
  const needsLegacy = document.querySelector("[data-site-content]");
  if (!needsCms && !needsLegacy) return;

  // Shares the single CMS read with appearance.js and site-chrome.js.
  await loadCms();

  if (needsLegacy) {
    try {
      const docs = await getSiteContent();
      legacyCache = Object.fromEntries(docs.map((d) => [d.id, d]));
    } catch (err) {
      console.info("[ICC] Legacy site content unavailable; using CMS and defaults.", err?.message || err);
    }
  }

  apply();
  applyAttributes();
}

document.addEventListener("DOMContentLoaded", init);

// language.js rewrites data-i18n text on every switch, so re-apply after it.
document.addEventListener("icc:languagechange", () =>
  setTimeout(() => {
    apply();
    applyAttributes();
  }, 0)
);
