/**
 * history-admin.js — admin/history.html
 * -----------------------------------------------------------------------
 * PHASE 7 — the Version History screen.
 *
 * Snapshots have been written on every content change since Phase 6, and
 * any record's ⟲ button opens its own history. What was missing was a way
 * in from the other direction: "something changed yesterday and I don't
 * know which record it was". That question can't be answered by a
 * per-record modal, because you have to already know the record.
 *
 * So this page lists recent snapshots across every collection, and hands
 * off to openVersionHistory() for the actual comparison and rollback. It
 * deliberately does NOT reimplement the restore flow — restoring is a
 * write to live content with its own permission, ownership and audit
 * requirements, and a second implementation of it would be a second set of
 * those checks to keep in agreement.
 * ------------------------------------------------------------------------
 */

import { protectAdminPage } from "./admin-guard.js";
import { getRecentVersions } from "../firestore.js";
import { openVersionHistory } from "./version-history.js";
import { PERMISSIONS, sectionForCollection, can, ACTIONS } from "../permissions.js";
import { CMS_DOC_SECTION } from "../cms-schema.js";
import { T, lang, escapeHTML, showLoading, showError, renderRows } from "./academic-shared.js";
import { icon } from "../icons.js";

const UI = () => window.ICC_ADMIN_UI;

let profile = null;
let versions = [];

/** Firestore timestamp → readable local date, tolerating raw Date values. */
function formatWhen(ts) {
  if (!ts) return "—";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(lang() === "ar" ? "ar" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * The permission section that governs a snapshot's collection.
 *
 * CMS snapshots are a special case. They all live in the `siteConfig`
 * collection, so the collection alone can't tell you whether a change was
 * to Appearance or to the Homepage — the document id does. Resolving by
 * collection only would have labelled every website change with whichever
 * section happens to claim `siteConfig` in the catalog.
 */
function sectionOf(version) {
  if (version.collectionName === "siteConfig") {
    return CMS_DOC_SECTION[version.docId] || null;
  }
  const def = sectionForCollection(version.collectionName);
  return def ? def.key : null;
}

/** CMS documents are restored from their own screen, not the generic modal. */
function isCmsVersion(version) {
  return version.collectionName === "siteConfig";
}

/** The admin page that owns a CMS document's draft/publish controls. */
function cmsPageFor(section) {
  const def = PERMISSIONS.find((p) => p.key === section);
  return def?.page || null;
}

function sectionLabel(version) {
  const key = sectionOf(version);
  return key ? T(`perm_${key}`) : version.collectionName || "—";
}

/**
 * A readable name for the snapshotted record. The snapshot holds the
 * document as it was, so its own name field is the most accurate label
 * available — better than the live record's current name, which may be
 * exactly what the change altered.
 */
function recordLabel(version) {
  if (isCmsVersion(version)) {
    return T(`cms_doc_${version.docId}`) || version.docId;
  }
  const snap = version.snapshot || {};
  return (
    snap.name?.[lang()] ||
    snap.name?.en ||
    snap.name?.ar ||
    snap.title?.[lang()] ||
    snap.title?.en ||
    snap.code ||
    snap.displayName ||
    version.docId ||
    "—"
  );
}

/* ==================================================================== */
/* Filtering                                                            */
/* ==================================================================== */

function currentFilters() {
  return {
    collection: document.querySelector("[data-collection-filter]")?.value || "all",
    search: (document.querySelector("[data-search]")?.value || "").trim().toLowerCase(),
  };
}

function applyFilters(list) {
  const f = currentFilters();
  return list.filter((v) => {
    if (f.collection !== "all" && v.collectionName !== f.collection) return false;
    if (!f.search) return true;
    const hay = `${recordLabel(v)} ${v.actorName || ""} ${v.actorEmail || ""} ${sectionLabel(v)}`.toLowerCase();
    return hay.includes(f.search);
  });
}

/* ==================================================================== */
/* Rendering                                                            */
/* ==================================================================== */

function rowHTML(v) {
  const version = v;
  const section = sectionOf(v);
  // The ⟲ button only appears where the viewer could actually open that
  // record's history — a snapshot of a section they can't read is listed
  // (the log is the log) but not actionable.
  const mayOpen = section && can(profile, section, ACTIONS.VIEW);

  // A CMS document's history is owned by its own screen, which holds the
  // draft/publish state this page has no view of. Sending the admin there
  // is honest; offering a restore button that writes a bare snapshot over
  // a draft/published envelope would corrupt the document.
  if (isCmsVersion(version)) {
    const page = cmsPageFor(section);
    return `
    <tr data-id="${escapeHTML(v.id)}">
      <td>${escapeHTML(formatWhen(v.at))}</td>
      <td class="wrap">${escapeHTML(sectionLabel(v))}</td>
      <td class="wrap">${escapeHTML(recordLabel(v))}</td>
      <td class="wrap">${escapeHTML(v.actorName || v.actorEmail || "—")}</td>
      <td><span class="tag">${escapeHTML(T(`ver_reason_${v.reason || "update"}`))}</span></td>
      <td>
        <div class="admin-table__actions">
          ${
            mayOpen && page
              ? `<a class="icon-btn" href="${page}" title="${T("ver_open_cms")}">${icon("external-link")}</a>`
              : "—"
          }
        </div>
      </td>
    </tr>`;
  }

  return `
    <tr data-id="${escapeHTML(v.id)}">
      <td>${escapeHTML(formatWhen(v.at))}</td>
      <td class="wrap">${escapeHTML(sectionLabel(v))}</td>
      <td class="wrap">${escapeHTML(recordLabel(v))}</td>
      <td class="wrap">${escapeHTML(v.actorName || v.actorEmail || "—")}</td>
      <td><span class="tag">${escapeHTML(T(`ver_reason_${v.reason || "update"}`))}</span></td>
      <td>
        <div class="admin-table__actions">
          ${mayOpen ? `<button class="icon-btn" data-action="history" title="${T("ver_history")}">⟲</button>` : "—"}
        </div>
      </td>
    </tr>`;
}

function render() {
  const rows = applyFilters(versions);
  const f = currentFilters();
  renderRows({
    rows,
    rowHTML,
    filtered: f.collection !== "all" || !!f.search,
    emptyTitleKey: "ver_page_empty_title",
    emptyBodyKey: "ver_page_empty_body",
  });
}

function populateFilters() {
  const select = document.querySelector("[data-collection-filter]");
  if (!select) return;
  const current = select.value || "all";

  // Only collections that actually appear in the loaded snapshots — an
  // empty filter option teaches people the filter is broken.
  const present = [...new Set(versions.map((v) => v.collectionName).filter(Boolean))];
  select.innerHTML =
    `<option value="all">${T("admin_filter_all")}</option>` +
    present
      .map((name) => {
        const def = PERMISSIONS.find((p) => p.collection === name);
        const label = name === "siteConfig" ? T("perm_group_website") : def ? T(def.labelKey) : name;
        return `<option value="${escapeHTML(name)}">${escapeHTML(label)}</option>`;
      })
      .join("");
  select.value = present.includes(current) ? current : "all";
}

async function loadAll() {
  showLoading();
  try {
    versions = await getRecentVersions(100);
    populateFilters();
    render();
  } catch (err) {
    console.error("[ICC Admin] Failed to load version history:", err);
    showError();
  }
}

/* ==================================================================== */
/* Wiring                                                               */
/* ==================================================================== */

function wireTable() {
  document.querySelector("[data-table-body]").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action='history']");
    if (!btn) return;
    const id = btn.closest("tr")?.getAttribute("data-id");
    const version = versions.find((v) => v.id === id);
    if (!version) return;

    const section = sectionOf(version);
    if (!section) {
      UI().errorToast(T("ver_unknown_section"));
      return;
    }

    // Hand off to the shared modal, which owns the diff view, the
    // permission checks on restoring, and the audit entry it writes.
    openVersionHistory({
      profile,
      section,
      collection: version.collectionName,
      record: { id: version.docId, ...(version.snapshot || {}) },
      label: recordLabel(version),
      onRestored: loadAll,
    });
  });
}

function wireToolbar() {
  document.querySelector("[data-refresh-btn]")?.addEventListener("click", loadAll);
  document.querySelector("[data-collection-filter]")?.addEventListener("change", render);
  document.querySelector("[data-search]")?.addEventListener("input", render);
}

document.addEventListener("DOMContentLoaded", () => {
  protectAdminPage("versions", async (_user, adminProfile) => {
    profile = adminProfile;
    wireTable();
    wireToolbar();
    await loadAll();
    document.addEventListener("icc:languagechange", () => {
      populateFilters();
      render();
    });
  });
});
