/**
 * version-history.js
 * -----------------------------------------------------------------------
 * PHASE 6 — the version history and rollback UI.
 *
 * Opens as a modal from any record's ⟲ button. Lists the stored snapshots
 * newest-first, shows who made each change and when, compares any snapshot
 * against the record as it stands now, and restores one.
 *
 * WHAT "RESTORE" MEANS HERE
 *   Writing the snapshot back over the live document — through the normal
 *   collection rules, so it is subject to the same matrix, ownership and
 *   workflow checks as any other edit. Two consequences worth stating:
 *
 *   - Restoring takes a snapshot of the CURRENT state first, so the
 *     rollback is itself reversible. A rollback you can't undo is just a
 *     second way to lose data.
 *   - Restoring writes a fresh audit entry marked as a restore, naming the
 *     version it came from — which the brief requires and which is also
 *     the only way the log stays a truthful account of how the record
 *     reached its present state.
 * ------------------------------------------------------------------------
 */

import { getVersions, saveVersion, restoreVersion } from "../firestore.js";
import { can, ownsRecord, ACTIONS } from "../permissions.js";
import { logAction } from "./audit-log.js";

const UI = () => window.ICC_ADMIN_UI;
function lang() {
  return (window.ICC_I18N && window.ICC_I18N.getStoredLang()) || "en";
}
const T = (key) => window.ICC_I18N.t(key, lang());

function escapeHTML(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function fmt(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(lang() === "ar" ? "ar-JO" : "en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function display(value) {
  if (value === undefined || value === null) return "—";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch (err) {
      return String(value);
    }
  }
  return String(value);
}

/**
 * Compare a snapshot with the live record, field by field.
 * Metadata fields are skipped — nobody needs a diff row telling them that
 * updatedAt is different, which it always is.
 */
function diff(snapshot, current) {
  const SKIP = new Set(["id", "createdAt", "updatedAt"]);
  const keys = [...new Set([...Object.keys(snapshot || {}), ...Object.keys(current || {})])]
    .filter((k) => !SKIP.has(k))
    .sort();

  return keys
    .map((k) => ({ key: k, before: snapshot?.[k], after: current?.[k] }))
    .filter((r) => display(r.before) !== display(r.after));
}

/**
 * @param {object} opts
 *   profile, section, collection, record
 *   label        — record name for headings and audit
 *   onRestored() — reload callback
 */
export async function openVersionHistory(opts) {
  const { profile, section, collection, record, label = "", onRestored } = opts;

  if (!can(profile, "versions", ACTIONS.VIEW)) {
    UI().errorToast(T("err_no_versions"));
    return;
  }

  const body = document.createElement("div");
  body.innerHTML = `<div class="admin-state"><div class="admin-state__icon">…</div><p>${T(
    "state_loading"
  )}</p></div>`;
  UI().openModal({ title: `${T("ver_history")} — ${escapeHTML(label)}`, bodyEl: body });

  let versions = [];
  try {
    versions = await getVersions(collection, record.id);
  } catch (err) {
    console.error("[ICC] Failed to load versions:", err);
    body.innerHTML = `<p class="hint">${T("state_error_body")}</p>`;
    return;
  }

  if (!versions.length) {
    body.innerHTML = `<p class="hint">${T("ver_empty")}</p>`;
    return;
  }

  // Restoring is a write to live content, so it needs the versions:edit
  // capability AND ownership of this record — not merely the right to read
  // the history.
  const mayRestore =
    can(profile, "versions", ACTIONS.EDIT) &&
    can(profile, section, ACTIONS.EDIT) &&
    ownsRecord(profile, section, record);

  function render() {
    body.innerHTML = `
      <p class="hint">${T("ver_lede")}</p>
      <div class="ver-list">
        ${versions
          .map(
            (v, i) => `
          <div class="ver-item" data-version="${v.id}">
            <div class="ver-item__meta">
              <strong>${fmt(v.at)}</strong>
              <span>${escapeHTML(v.actorName || v.actorEmail || "—")}</span>
              <span class="tag">${T(`ver_reason_${v.reason || "update"}`)}</span>
              ${i === 0 ? `<span class="tag tag--you">${T("ver_latest")}</span>` : ""}
            </div>
            <div class="ver-item__actions">
              <button type="button" class="btn btn--outline btn--xs" data-ver-action="compare">${T(
                "ver_compare"
              )}</button>
              ${
                mayRestore
                  ? `<button type="button" class="btn btn--primary btn--xs" data-ver-action="restore">${T(
                      "ver_restore"
                    )}</button>`
                  : ""
              }
            </div>
            <div class="ver-item__diff" hidden></div>
          </div>`
          )
          .join("")}
      </div>
      ${mayRestore ? "" : `<p class="hint">${T("ver_readonly")}</p>`}`;
  }

  render();

  body.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-ver-action]");
    if (!btn) return;
    const item = btn.closest("[data-version]");
    const version = versions.find((v) => v.id === item.getAttribute("data-version"));
    if (!version) return;

    if (btn.getAttribute("data-ver-action") === "compare") {
      const mount = item.querySelector(".ver-item__diff");
      if (!mount.hidden) {
        mount.hidden = true;
        return;
      }
      const rows = diff(version.snapshot, record);
      mount.innerHTML = rows.length
        ? `<table class="admin-table admin-table--diff">
             <thead><tr>
               <th>${T("admin_field_field")}</th>
               <th>${T("ver_this_version")}</th>
               <th>${T("ver_current")}</th>
             </tr></thead>
             <tbody>${rows
               .map(
                 (r) => `<tr>
                   <td><code>${escapeHTML(r.key)}</code></td>
                   <td class="wrap diff-before">${escapeHTML(display(r.before))}</td>
                   <td class="wrap diff-after">${escapeHTML(display(r.after))}</td>
                 </tr>`
               )
               .join("")}</tbody>
           </table>`
        : `<p class="hint">${T("ver_identical")}</p>`;
      mount.hidden = false;
      return;
    }

    // --- restore -------------------------------------------------------
    const ok = await UI().confirmDialog({
      title: T("ver_restore"),
      message: T("ver_restore_msg").replace("{when}", fmt(version.at)),
      warning: T("ver_restore_warning"),
      danger: true,
    });
    if (!ok) return;

    try {
      // Snapshot the present state first, so the rollback is reversible.
      await saveVersion(collection, record.id, record, {
        actorUid: profile.uid,
        actorName: profile.displayName,
        actorEmail: profile.email,
        reason: "restore",
      });
      await restoreVersion(collection, record.id, version.snapshot);
      await logAction({
        action: "restore_version",
        section,
        entityId: record.id,
        entityLabel: label,
        summary: T("ver_restored_summary").replace("{when}", fmt(version.at)),
        before: record,
        after: version.snapshot,
        metadata: {
          versionId: version.id,
          versionTakenAt: version.at?.toDate ? version.at.toDate().toISOString() : null,
        },
      });
      UI().successToast(T("ver_restored"));
      UI().closeModal();
      if (onRestored) await onRestored();
    } catch (err) {
      console.error("[ICC] Restore failed:", err);
      UI().errorToast(T("err_restore_failed"));
    }
  });
}
