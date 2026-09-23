/**
 * backup-admin.js — admin/backup.html
 * -----------------------------------------------------------------------
 * PHASE 6 — backup and recovery, within the honest limits of a static site.
 *
 * EXPORT
 *   Super-Admin-only snapshot of selected collections to a JSON archive
 *   downloaded to the operator's machine. Optional Preview shows what the
 *   archive would contain before it is written to disk.
 *
 * IMPORT (merge-only)
 *   Loads an archive, scans it against the live database, and reports
 *   exactly what would be ADDED, UPDATED, or is IDENTICAL. Import NEVER
 *   deletes anything. It is a merge (setDoc with merge:true), so records
 *   present in the database but absent from the archive are left alone.
 *
 * RESTORE (replace)
 *   Unchanged from the original: destructive, overwrites live records
 *   with the archive contents, gated behind a typed confirmation. Only
 *   the operator's explicit Restore action clears data.
 *
 * SAFETY
 *   Both Import and Restore go through the normal security rules, so they
 *   can only write what the operator could write by hand. Both are gated
 *   behind backup:create / backup:edit (Super-Admin only).
 * ------------------------------------------------------------------------
 */

import { protectAdminPage } from "./admin-guard.js";
import { logAction } from "./audit-log.js";
import { escapeHTML } from "./resource-ops.js";
import { can, ACTIONS } from "../permissions.js";
import {
  dumpCollection,
  restoreCollection,
  recordBackupManifest,
  getBackupManifests,
  mergeCollection,
  fetchCollectionIds,
} from "../firestore.js";

const UI = () => window.ICC_ADMIN_UI;
function lang() {
  return (window.ICC_I18N && window.ICC_I18N.getStoredLang()) || "en";
}
const T = (key) => window.ICC_I18N.t(key, lang());

/**
 * Collections included in a backup.
 *
 * `versions` and `auditLogs` are deliberately EXCLUDED from restore AND
 * import even though they're exported: writing old audit records back
 * would corrupt the very history that is supposed to be append-only.
 */
const COLLECTIONS = [
  { name: "majors", labelKey: "perm_majors", restorable: true, default: true },
  { name: "semesters", labelKey: "perm_semesters", restorable: true, default: true },
  { name: "subjects", labelKey: "perm_subjects", restorable: true, default: true },
  { name: "requirements", labelKey: "perm_requirements", restorable: true, default: true },
  { name: "prerequisites", labelKey: "perm_prerequisites", restorable: true, default: true },
  { name: "treeNodes", labelKey: "perm_tree", restorable: true, default: true },
  { name: "siteContent", labelKey: "perm_content", restorable: true, default: true },
  { name: "settings", labelKey: "perm_settings", restorable: true, default: true },
  { name: "users", labelKey: "perm_users", restorable: true, default: false },
  { name: "auditLogs", labelKey: "perm_audit", restorable: false, default: false },
  { name: "versions", labelKey: "perm_versions", restorable: false, default: false },
];

let me = null;
let pendingArchive = null;        // archive staged for Restore
let pendingImport = null;         // archive loaded via Import panel
let pendingImportScan = null;     // { added, updated, identical, byCollection }
let pendingExportPreview = null;  // archive built by Preview, not yet downloaded

function fmt(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString(lang() === "ar" ? "ar-JO" : "en-GB");
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

function renderPicker() {
  document.querySelector("[data-collection-picker]").innerHTML = COLLECTIONS.map(
    (c) => `
    <label class="perm-item">
      <input type="checkbox" data-collection="${c.name}" ${c.default ? "checked" : ""}>
      <span>
        <strong>${T(c.labelKey)}</strong>
        <em>${c.restorable ? T("backup_restorable") : T("backup_export_only")}</em>
      </span>
    </label>`
  ).join("");
}

function selectedCollections() {
  return [...document.querySelectorAll("[data-collection]:checked")].map((cb) =>
    cb.getAttribute("data-collection")
  );
}

async function buildExportArchive() {
  const names = selectedCollections();
  if (!names.length) {
    UI().errorToast(T("backup_pick_one"));
    return null;
  }
  const data = {};
  const counts = {};
  for (const name of names) {
    const records = await dumpCollection(name);
    data[name] = records;
    counts[name] = records.length;
  }
  const archive = {
    format: "icc-backup",
    version: 1,
    createdAt: new Date().toISOString(),
    createdBy: me.email || me.uid,
    counts,
    data,
  };
  const total = Object.values(counts).reduce((n, v) => n + v, 0);
  return { archive, counts, total };
}

async function downloadArchive(built) {
  const { archive, counts, total } = built;

  const blob = new Blob([JSON.stringify(archive, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `icc-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
  a.click();
  URL.revokeObjectURL(url);

  const names = Object.keys(archive.data);
  await recordBackupManifest({
    actorUid: me.uid,
    actorEmail: me.email || "",
    collections: names,
    counts,
    total,
  });
  await logAction({
    action: "create",
    section: "backup",
    entityId: null,
    entityLabel: T("backup_export_title"),
    summary: T("backup_exported_summary").replace("{n}", total),
    after: counts,
  });

  UI().successToast(T("backup_exported").replace("{n}", total));
  await loadManifests();
}

async function runExportPreview() {
  if (!can(me, "backup", ACTIONS.CREATE)) {
    UI().errorToast(T("err_no_backup"));
    return;
  }
  const btn = document.querySelector("[data-preview-btn]");
  btn.disabled = true;
  try {
    const built = await buildExportArchive();
    if (!built) return;
    pendingExportPreview = built;

    const { archive, counts, total } = built;
    const body = document.createElement("div");
    body.innerHTML = `
      <p>${T("backup_preview_will_export").replace("{n}", total)}</p>
      <ul class="rel-list">
        ${Object.entries(counts)
          .map(
            ([name, n]) =>
              `<li><strong>${n}</strong> ${T(
                COLLECTIONS.find((c) => c.name === name)?.labelKey || name
              )}</li>`
          )
          .join("")}
      </ul>
      <details>
        <summary>${T("backup_preview_raw")}</summary>
        <pre style="max-height:320px;overflow:auto;font-size:12px;">${escapeHTML(
          JSON.stringify(
            Object.fromEntries(
              Object.entries(archive.data).map(([k, v]) => [k, v.slice(0, 50)])
            ),
            null,
            2
          )
        )}</pre>
        <p class="hint">${T("backup_preview_truncated")}</p>
      </details>
      <div class="admin-form__actions">
        <button type="button" class="btn btn--outline" data-cancel>${T("admin_cancel")}</button>
        <button type="button" class="btn btn--primary" data-download>${T("backup_download_now")}</button>
      </div>`;

    body.querySelector("[data-cancel]").addEventListener("click", () => {
      pendingExportPreview = null;
      UI().closeModal();
    });

    body.querySelector("[data-download]").addEventListener("click", async () => {
      const built2 = pendingExportPreview;
      pendingExportPreview = null;
      UI().closeModal();
      if (!built2) return;
      try {
        await downloadArchive(built2);
      } catch (err) {
        console.error("[ICC Admin] Backup download failed:", err);
        UI().errorToast(T("admin_error_permission"));
      }
    });

    UI().openModal({
      title: T("backup_preview_title"),
      bodyEl: body,
      small: false,
    });
  } catch (err) {
    console.error("[ICC Admin] Export preview failed:", err);
    UI().errorToast(T("admin_error_permission"));
  } finally {
    btn.disabled = false;
  }
}

async function runExport() {
  if (!can(me, "backup", ACTIONS.CREATE)) {
    UI().errorToast(T("err_no_backup"));
    return;
  }
  const btn = document.querySelector("[data-export-btn]");
  btn.disabled = true;
  try {
    const built = await buildExportArchive();
    if (!built) return;
    await downloadArchive(built);
  } catch (err) {
    console.error("[ICC Admin] Backup export failed:", err);
    UI().errorToast(T("admin_error_permission"));
  } finally {
    btn.disabled = false;
  }
}

/* ------------------------------------------------------------------ */
/* Import — MERGE ONLY (adds + updates, never deletes)                 */
/* ------------------------------------------------------------------ */

function handleImportFile(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const archive = JSON.parse(reader.result);
      if (archive.format !== "icc-backup" || !archive.data) {
        throw new Error("not an ICC backup archive");
      }
      pendingImport = archive;
      await scanImport(archive);
    } catch (err) {
      console.error("[ICC Admin] Invalid import file:", err);
      pendingImport = null;
      pendingImportScan = null;
      const mount = document.querySelector("[data-import-preview]");
      if (mount) mount.hidden = true;
      const btn = document.querySelector("[data-import-btn]");
      if (btn) btn.disabled = true;
      UI().errorToast(T("backup_invalid_file"));
    }
  };
  reader.readAsText(file);
}

/**
 * Compare the archive against the live database and classify every record
 * as ADDED (id not in DB), UPDATED (id in DB, content differs), or
 * IDENTICAL (id in DB, content the same). Nothing is written here — this
 * is a pure read-only scan so the operator can see the duplicates first.
 */
async function scanImport(archive) {
  const byCollection = {};
  let added = 0;
  let updated = 0;
  let identical = 0;

  for (const [name, records] of Object.entries(archive.data || {})) {
    const def = COLLECTIONS.find((c) => c.name === name);
    if (!def || !def.restorable) {
      byCollection[name] = { skipped: true, added: 0, updated: 0, identical: 0 };
      continue;
    }

    const live = await fetchCollectionIds(name); // Map<id, plainObject>

    let cAdded = 0;
    let cUpdated = 0;
    let cIdentical = 0;

    for (const rec of records || []) {
      if (!rec || !rec.id) continue;
      const existing = live.get(rec.id);
      if (!existing) {
        cAdded++;
      } else if (shallowEqualIgnoringTimestamps(existing, rec)) {
        cIdentical++;
      } else {
        cUpdated++;
      }
    }

    byCollection[name] = {
      added: cAdded,
      updated: cUpdated,
      identical: cIdentical,
      skipped: false,
      total: (records || []).length,
    };
    added += cAdded;
    updated += cUpdated;
    identical += cIdentical;
  }

  pendingImportScan = { added, updated, identical, byCollection };
  renderImportPreview(archive, pendingImportScan);
}

/**
 * Loose comparison that ignores Firestore metadata (timestamps, internal
 * fields) so a record that is genuinely the same isn't reported as updated
 * just because updatedAt ticked.
 */
function shallowEqualIgnoringTimestamps(a, b) {
  const strip = (o) => {
    if (!o || typeof o !== "object") return o;
    const out = {};
    for (const k of Object.keys(o).sort()) {
      if (k.startsWith("_")) continue;
      if (k === "createdAt" || k === "updatedAt") continue;
      out[k] = o[k];
    }
    return out;
  };
  try {
    return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
  } catch {
    return false;
  }
}

function renderImportPreview(archive, scan) {
  const mount = document.querySelector("[data-import-preview]");
  const entries = Object.entries(archive.data || {});

  const total = scan.added + scan.updated + scan.identical;

  const rows = entries
    .map(([name, arr]) => {
      const c = scan.byCollection[name] || {};
      const label = T(COLLECTIONS.find((x) => x.name === name)?.labelKey || name);
      if (c.skipped) {
        return `<li><strong>${label}</strong> — <em>${T("import_skipped")}</em></li>`;
      }
      return `<li>
        <strong>${label}</strong>
        <span class="import-badge import-badge--add">${T("import_added")} ${c.added}</span>
        <span class="import-badge import-badge--upd">${T("import_updated")} ${c.updated}</span>
        <span class="import-badge import-badge--same">${T("import_identical")} ${c.identical}</span>
      </li>`;
    })
    .join("");

  const dupes = findArchiveDuplicates(archive);

  mount.innerHTML = `
    <div class="rel-warning">
      <strong>${T("backup_import_preview_title")}</strong>
      <p>${T("backup_preview_made")} ${escapeHTML(archive.createdAt || "—")} — ${escapeHTML(
    archive.createdBy || "—"
  )}</p>

      <div class="import-summary">
        <span class="import-badge import-badge--add">${T("import_added")} ${scan.added}</span>
        <span class="import-badge import-badge--upd">${T("import_updated")} ${scan.updated}</span>
        <span class="import-badge import-badge--same">${T("import_identical")} ${scan.identical}</span>
        <span class="import-badge">${T("import_total")} ${total}</span>
      </div>

      <p class="hint">${T("import_merge_explainer")}</p>
      <ul class="rel-list">${rows}</ul>

      ${
        dupes.length
          ? `<div class="admin-alert">
               <strong>${T("import_dupes_title")}</strong>
               <ul class="rel-list">
                 ${dupes
                   .slice(0, 20)
                   .map(
                     (d) =>
                       `<li><code>${escapeHTML(d.collection)}</code> → <code>${escapeHTML(
                         d.id
                       )}</code> (×${d.count})</li>`
                   )
                   .join("")}
               </ul>
               <p class="hint">${T("import_dupes_note")}</p>
             </div>`
          : `<p class="hint">${T("import_no_dupes")}</p>`
      }

      <details>
        <summary>${T("backup_preview_raw")}</summary>
        <pre style="max-height:320px;overflow:auto;font-size:12px;">${escapeHTML(
          JSON.stringify(
            Object.fromEntries(entries.map(([k, v]) => [k, (v || []).slice(0, 50)])),
            null,
            2
          )
        )}</pre>
        <p class="hint">${T("backup_preview_truncated")}</p>
      </details>
    </div>`;

  mount.hidden = false;
  document.querySelector("[data-import-btn]").disabled = total === 0;
}

/**
 * Detect duplicate ids INSIDE the archive (same id appearing more than
 * once in the same collection).
 */
function findArchiveDuplicates(archive) {
  const dupes = [];
  for (const [name, records] of Object.entries(archive.data || {})) {
    const seen = new Map();
    for (const rec of records || []) {
      if (!rec || !rec.id) continue;
      seen.set(rec.id, (seen.get(rec.id) || 0) + 1);
    }
    for (const [id, count] of seen) {
      if (count > 1) dupes.push({ collection: name, id, count });
    }
  }
  return dupes;
}

async function runImport() {
  if (!pendingImport || !pendingImportScan) return;
  if (!can(me, "backup", ACTIONS.CREATE)) {
    UI().errorToast(T("err_no_backup"));
    return;
  }

  const btn = document.querySelector("[data-import-btn]");
  btn.disabled = true;
  const summary = {};
  try {
    for (const [name, records] of Object.entries(pendingImport.data || {})) {
      const def = COLLECTIONS.find((c) => c.name === name);
      if (!def || !def.restorable) continue;
      // mergeCollection uses setDoc(..., { merge: true }) — adds new ids,
      // updates existing ids, and never deletes anything.
      await mergeCollection(name, records);
      summary[name] = (records || []).length;
    }
    const total = Object.values(summary).reduce((n, v) => n + v, 0);

    await logAction({
      action: "import",
      section: "backup",
      entityId: null,
      entityLabel: T("backup_import_title"),
      summary: T("import_done_summary")
        .replace("{n}", total)
        .replace("{when}", pendingImport.createdAt || "—"),
      after: summary,
    });

    UI().successToast(T("import_done").replace("{n}", total));
    pendingImport = null;
    pendingImportScan = null;
    document.querySelector("[data-import-preview]").hidden = true;
  } catch (err) {
    console.error("[ICC Admin] Import failed:", err);
    UI().errorToast(T("import_failed"));
  } finally {
    btn.disabled = false;
  }
}

/* ------------------------------------------------------------------ */
/* Restore — REPLACE (destructive, as originally designed)             */
/* ------------------------------------------------------------------ */

function previewArchive(archive) {
  const mount = document.querySelector("[data-restore-preview]");
  const restorable = Object.keys(archive.data || {}).filter((name) => {
    const def = COLLECTIONS.find((c) => c.name === name);
    return def && def.restorable;
  });
  const skipped = Object.keys(archive.data || {}).filter((n) => !restorable.includes(n));

  mount.innerHTML = `
    <div class="rel-warning">
      <strong>${T("backup_preview_title")}</strong>
      <p>${T("backup_preview_made")} ${escapeHTML(archive.createdAt || "—")} — ${escapeHTML(
    archive.createdBy || "—"
  )}</p>
      <ul class="rel-list">
        ${restorable
          .map(
            (n) =>
              `<li><strong>${(archive.data[n] || []).length}</strong> ${T(
                COLLECTIONS.find((c) => c.name === n).labelKey
              )}</li>`
          )
          .join("")}
      </ul>
      ${
        skipped.length
          ? `<p class="hint">${T("backup_skipped_append_only").replace(
              "{list}",
              skipped.join(", ")
            )}</p>`
          : ""
      }
    </div>`;
  mount.hidden = false;
  document.querySelector("[data-restore-btn]").disabled = false;
}

function handleFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const archive = JSON.parse(reader.result);
      if (archive.format !== "icc-backup" || !archive.data) {
        throw new Error("not an ICC backup archive");
      }
      pendingArchive = archive;
      previewArchive(archive);
    } catch (err) {
      console.error("[ICC Admin] Invalid archive:", err);
      pendingArchive = null;
      document.querySelector("[data-restore-preview]").hidden = true;
      document.querySelector("[data-restore-btn]").disabled = true;
      UI().errorToast(T("backup_invalid_file"));
    }
  };
  reader.readAsText(file);
}

async function runRestore() {
  if (!pendingArchive) return;
  if (!can(me, "backup", ACTIONS.EDIT)) {
    UI().errorToast(T("err_no_backup"));
    return;
  }

  const phrase = T("backup_confirm_phrase");
  const body = document.createElement("div");
  body.innerHTML = `
    <p>${T("backup_confirm_msg")}</p>
    <div class="admin-modal__warning">${T("backup_confirm_warning")}</div>
    <div class="form-field">
      <label for="confirmPhrase">${T("backup_confirm_type").replace("{phrase}", phrase)}</label>
      <input type="text" id="confirmPhrase" autocomplete="off">
    </div>
    <div class="admin-form__actions">
      <button type="button" class="btn btn--outline" data-cancel>${T("admin_cancel")}</button>
      <button type="button" class="btn btn--danger" data-go disabled>${T("backup_restore_run")}</button>
    </div>`;

  const input = body.querySelector("#confirmPhrase");
  const go = body.querySelector("[data-go]");
  input.addEventListener("input", () => {
    go.disabled = input.value.trim().toUpperCase() !== phrase.toUpperCase();
  });
  body.querySelector("[data-cancel]").addEventListener("click", () => UI().closeModal());

  go.addEventListener("click", async () => {
    UI().closeModal();
    const btn = document.querySelector("[data-restore-btn]");
    btn.disabled = true;
    const summary = {};
    try {
      for (const [name, records] of Object.entries(pendingArchive.data)) {
        const def = COLLECTIONS.find((c) => c.name === name);
        if (!def || !def.restorable) continue;
        // restoreCollection is the destructive replace path.
        await restoreCollection(name, records);
        summary[name] = records.length;
      }
      const total = Object.values(summary).reduce((n, v) => n + v, 0);
      await logAction({
        action: "restore",
        section: "backup",
        entityId: null,
        entityLabel: T("backup_restore_title"),
        summary: T("backup_restored_summary")
          .replace("{n}", total)
          .replace("{when}", pendingArchive.createdAt || "—"),
        after: summary,
      });
      UI().successToast(T("backup_restored").replace("{n}", total));
    } catch (err) {
      console.error("[ICC Admin] Restore failed:", err);
      UI().errorToast(T("backup_restore_failed"));
    } finally {
      btn.disabled = false;
    }
  });

  UI().openModal({ title: T("backup_restore_title"), bodyEl: body, small: true });
}

/* ------------------------------------------------------------------ */
/* History                                                             */
/* ------------------------------------------------------------------ */

async function loadManifests() {
  const mount = document.querySelector("[data-manifest-mount]");
  try {
    const rows = await getBackupManifests();
    if (!rows.length) {
      mount.innerHTML = `<p class="hint">${T("backup_none_yet")}</p>`;
      return;
    }
    mount.innerHTML = `<div class="admin-activity">${rows
      .map(
        (r) => `
        <div class="admin-activity__row">
          <span class="admin-activity__when">${fmt(r.at)}</span>
          <span class="admin-activity__text">
            <strong>${escapeHTML(r.actorEmail || "—")}</strong>
            ${T("backup_manifest_line").replace("{n}", r.total ?? 0).replace("{c}", (r.collections || []).length)}
          </span>
        </div>`
      )
      .join("")}</div>`;
  } catch (err) {
    console.error("[ICC Admin] Manifest load failed:", err);
    mount.innerHTML = `<p class="hint">${T("state_error_body")}</p>`;
  }
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

document.addEventListener("DOMContentLoaded", () => {
  protectAdminPage("backup", async (user, profile) => {
    me = profile;
    renderPicker();

    document.querySelector("[data-export-btn]").addEventListener("click", runExport);
    document.querySelector("[data-preview-btn]").addEventListener("click", runExportPreview);

    document.querySelector("[data-import-file]").addEventListener("change", (e) => {
      if (e.target.files?.[0]) handleImportFile(e.target.files[0]);
    });
    document.querySelector("[data-import-btn]").addEventListener("click", runImport);

    document.querySelector("[data-restore-file]").addEventListener("change", (e) => {
      if (e.target.files?.[0]) handleFile(e.target.files[0]);
    });
    document.querySelector("[data-restore-btn]").addEventListener("click", runRestore);

    await loadManifests();
  });
});