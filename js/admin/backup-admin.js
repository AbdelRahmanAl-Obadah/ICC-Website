/**
 * backup-admin.js — admin/backup.html
 * -----------------------------------------------------------------------
 * PHASE 6 — backup and recovery, within the honest limits of a static site.
 *
 * WHAT THIS IS
 *   A Super-Admin-only export of the database to a JSON archive downloaded
 *   to the operator's own machine, and a restore that writes an archive
 *   back. Enough to recover from the realistic failure here: somebody
 *   deletes or mangles records and needs yesterday's state back.
 *
 * WHAT THIS IS NOT, AND WHY
 *   It is not automated or scheduled. A static site has no server and no
 *   cron; the only code that runs is code a person opens a browser tab to
 *   run. Anything claiming to be an automatic nightly backup would be a
 *   lie — so this is a deliberate, operator-initiated action, and the page
 *   says when the last one was taken so it's obvious if nobody has.
 *
 *   For genuinely automated backups, Firestore's own scheduled exports
 *   (Cloud Scheduler + the managed export API) are the right tool and run
 *   independently of this panel. That is documented in the README rather
 *   than faked here.
 *
 * SAFETY
 *   Restore goes through the normal security rules, so it can only write
 *   what the operator could write by hand. It is gated behind
 *   backup:create / backup:edit, which are Super-Admin-only, and requires
 *   typing a confirmation phrase — a dropdown of collections plus one
 *   click is too easy to do by accident for an operation this destructive.
 * ------------------------------------------------------------------------
 */

import { protectAdminPage } from "./admin-guard.js";
import { logAction } from "./audit-log.js";
import { escapeHTML } from "./resource-ops.js";
import { can, ACTIONS, isSuperAdmin } from "../permissions.js";
import {
  dumpCollection,
  restoreCollection,
  recordBackupManifest,
  getBackupManifests,
} from "../firestore.js";

const UI = () => window.ICC_ADMIN_UI;
function lang() {
  return (window.ICC_I18N && window.ICC_I18N.getStoredLang()) || "en";
}
const T = (key) => window.ICC_I18N.t(key, lang());

/**
 * Collections included in a backup.
 *
 * `versions` and `auditLogs` are deliberately EXCLUDED from restore even
 * though they're exported: writing old audit records back would corrupt
 * the very history that is supposed to be append-only and trustworthy.
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
let pendingArchive = null;

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

async function runExport() {
  if (!can(me, "backup", ACTIONS.CREATE)) {
    UI().errorToast(T("err_no_backup"));
    return;
  }
  const names = selectedCollections();
  if (!names.length) {
    UI().errorToast(T("backup_pick_one"));
    return;
  }

  const btn = document.querySelector("[data-export-btn]");
  btn.disabled = true;
  try {
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

    const blob = new Blob([JSON.stringify(archive, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `icc-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);

    const total = Object.values(counts).reduce((n, v) => n + v, 0);
    // The manifest records that a backup happened; the archive itself stays
    // on the operator's machine and is never uploaded anywhere.
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
  } catch (err) {
    console.error("[ICC Admin] Backup export failed:", err);
    UI().errorToast(T("admin_error_permission"));
  } finally {
    btn.disabled = false;
  }
}

/* ------------------------------------------------------------------ */
/* Restore                                                             */
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

  // A typed confirmation, not just a click: this overwrites live data and
  // the undo is "restore a different backup".
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
        if (!def || !def.restorable) continue; // never rewrite append-only history
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

document.addEventListener("DOMContentLoaded", () => {
  protectAdminPage("backup", async (user, profile) => {
    me = profile;
    renderPicker();
    document.querySelector("[data-export-btn]").addEventListener("click", runExport);
    document.querySelector("[data-restore-file]").addEventListener("change", (e) => {
      if (e.target.files?.[0]) handleFile(e.target.files[0]);
    });
    document.querySelector("[data-restore-btn]").addEventListener("click", runRestore);
    await loadManifests();
  });
});
