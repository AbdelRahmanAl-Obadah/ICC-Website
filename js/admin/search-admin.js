/**
 * search-admin.js — admin/search.html
 * -----------------------------------------------------------------------
 * PHASE 6 — one search box across every section of the Admin Panel.
 *
 * THE RULE THAT SHAPES THIS WHOLE FILE
 *   An admin must never receive a result for data they are not authorized
 *   to see. That is enforced three times over, and the order matters:
 *
 *   1. Sections the viewer lacks `view` on are never QUERIED. Not filtered
 *      afterwards — never requested. A result that is fetched and then
 *      hidden has still been delivered to the browser.
 *   2. Records outside their ownership scope are dropped before rendering.
 *   3. firestore.rules rejects the read anyway if either check were wrong,
 *      which is why a failing collection is skipped quietly rather than
 *      breaking the whole search.
 *
 * WHY THE SEARCH IS CLIENT-SIDE
 *   Firestore has no substring or full-text search. The honest options are
 *   a third-party search service or loading the (small, student-club-sized)
 *   collections and matching in memory. Adding an external dependency and a
 *   second copy of the data — with its own access-control surface — to
 *   search a few hundred records would be the wrong trade. Collections are
 *   fetched once per session and cached.
 * ------------------------------------------------------------------------
 */

import { protectAdminPage } from "./admin-guard.js";
import { escapeHTML } from "./resource-ops.js";
import {
  PERMISSIONS,
  can,
  ownsRecord,
  ACTIONS,
  stateOf,
  ownershipEnabled,
} from "../permissions.js";
import { dumpCollection } from "../firestore.js";

const UI = () => window.ICC_ADMIN_UI;
function lang() {
  return (window.ICC_I18N && window.ICC_I18N.getStoredLang()) || "en";
}
const T = (key) => window.ICC_I18N.t(key, lang());

let me = null;
const cache = new Map(); // section -> records
let loaded = false;

/** Sections that hold searchable records (those backed by a collection). */
function searchableSections() {
  return PERMISSIONS.filter(
    (p) => p.collection && p.collection !== "auditLogs" && p.collection !== "versions"
  ).filter((p) => can(me, p.key, ACTIONS.VIEW));
}

/** The text of a record that a person would plausibly search for. */
function haystack(record) {
  const parts = [
    record.name?.en,
    record.name?.ar,
    record.code,
    record.displayName,
    record.email,
    record.college,
    record.title,
    record.id,
  ];
  // siteContent / settings documents are flat bags of strings.
  Object.values(record).forEach((v) => {
    if (typeof v === "string" && v.length < 200) parts.push(v);
  });
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function labelOf(record, section) {
  if (section === "users" || section === "admins") {
    return record.displayName || record.email || record.id;
  }
  return record.name?.[lang()] || record.name?.en || record.code || record.title || record.id;
}

function subtitleOf(record, section) {
  if (section === "users") return record.email || "";
  if (record.code) return record.code;
  if (record.email) return record.email;
  return record.id;
}

/**
 * Where does clicking a result take you? Sections whose page can focus a
 * record get a deep link; the rest open their page.
 */
function linkFor(record, def) {
  if (!def.page) return null;
  return `${def.page}?focus=${encodeURIComponent(record.id)}`;
}

async function loadAll() {
  const mount = document.querySelector("[data-state-mount]");
  mount.innerHTML = UI().stateHTML("loading", { title: "", body: T("admin_gsearch_indexing") });

  const sections = searchableSections();
  await Promise.all(
    sections.map(async (def) => {
      if (cache.has(def.key)) return;
      try {
        const records = await dumpCollection(def.collection);
        // Ownership filter applied at index time, so an out-of-scope record
        // is never even a candidate for a match.
        cache.set(
          def.key,
          records.filter((r) => ownsRecord(me, def.key, r))
        );
      } catch (err) {
        // Almost always a rules rejection: skip the section quietly rather
        // than telling the admin that something they can't see exists.
        console.info(`[ICC] Search skipped ${def.collection}:`, err?.code || err);
        cache.set(def.key, []);
      }
    })
  );
  loaded = true;
  mount.innerHTML = "";
}

function run() {
  const term = (document.querySelector("[data-global-search]").value || "").trim().toLowerCase();
  const typeFilter = document.querySelector("[data-type-filter]").value;
  const results = document.querySelector("[data-results]");

  if (term.length < 2) {
    results.innerHTML = `<p class="hint">${T("admin_gsearch_idle")}</p>`;
    return;
  }

  const groups = [];
  searchableSections().forEach((def) => {
    if (typeFilter && def.key !== typeFilter) return;
    const records = cache.get(def.key) || [];
    const hits = records.filter((r) => haystack(r).includes(term)).slice(0, 12);
    if (hits.length) groups.push({ def, hits });
  });

  if (!groups.length) {
    results.innerHTML = UI().stateHTML("empty", {
      title: T("search_no_results_title"),
      body: T("admin_gsearch_no_results"),
    });
    return;
  }

  results.innerHTML = groups
    .map(
      ({ def, hits }) => `
      <div class="gsearch-group">
        <h3 class="gsearch-group__head">
          <span class="icn" aria-hidden="true">${def.icon}</span>
          ${T(def.labelKey)}
          <span class="tag tag--count">${hits.length}</span>
        </h3>
        ${hits
          .map((r) => {
            const href = linkFor(r, def);
            const state = def.workflow
              ? `<span class="tag">${T(`wf_${stateOf(r)}`)}</span>`
              : "";
            const inner = `
              <span class="gsearch-result__main">
                <strong>${escapeHTML(labelOf(r, def.key))}</strong>
                <em>${escapeHTML(subtitleOf(r, def.key))}</em>
              </span>
              <span class="gsearch-result__meta">${state}</span>`;
            return href
              ? `<a class="gsearch-result" href="${href}">${inner}</a>`
              : `<div class="gsearch-result gsearch-result--flat">${inner}</div>`;
          })
          .join("")}
      </div>`
    )
    .join("");
}

function wire() {
  const typeSel = document.querySelector("[data-type-filter]");
  searchableSections().forEach((def) => {
    const opt = document.createElement("option");
    opt.value = def.key;
    opt.textContent = T(def.labelKey);
    typeSel.appendChild(opt);
  });

  let timer = null;
  document.querySelector("[data-global-search]").addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => loaded && run(), 180);
  });
  typeSel.addEventListener("change", run);

  if (ownershipEnabled(me)) {
    document.querySelector("[data-state-mount]").insertAdjacentHTML(
      "beforebegin",
      `<div class="admin-alert admin-alert--info">${T("ownership_notice")}</div>`
    );
  }
}

document.addEventListener("DOMContentLoaded", () => {
  protectAdminPage("search", async (user, profile) => {
    me = profile;
    wire();
    await loadAll();
    run();

    // Deep-link support: /admin/search.html?q=term
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) {
      document.querySelector("[data-global-search]").value = q;
      run();
    }
  });
});
