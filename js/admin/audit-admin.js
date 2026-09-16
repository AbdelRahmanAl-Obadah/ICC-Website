/**
 * audit-admin.js — admin/audit.html
 * -----------------------------------------------------------------------
 * PHASE 5 — the read side of the administrator activity log.
 *
 * Search, filter, sort and inspect every recorded action: who did it, what
 * they did, which section and record it touched, what the value was before
 * and what it became.
 *
 * SERVER-SIDE VS CLIENT-SIDE FILTERING
 *   Resource / action / actor / date filters are pushed into the Firestore
 *   query (indexed — see firestore.indexes.json), so narrowing by them
 *   fetches less rather than fetching everything and hiding rows. The free
 *   text box filters the loaded page client-side, because Firestore has no
 *   substring search and adding a search service for an internal audit
 *   screen would be disproportionate. That distinction is visible to the
 *   user: the hint under the box says text search covers loaded rows.
 *
 * DELETION
 *   The delete control appears only for someone holding the `delete` action
 *   on the `audit` section (Super Admins hold everything). Editing is
 *   offered to nobody at all — the rules deny update on auditLogs
 *   unconditionally, because a log that can be rewritten in place proves
 *   nothing.
 * ------------------------------------------------------------------------
 */

import { protectAdminPage } from "./admin-guard.js";
import { getAuditLogs, deleteAuditLog } from "../firestore.js";
import { PERMISSIONS, can, ACTIONS as PERM_ACTIONS } from "../permissions.js";
import { logAction, AUDIT_ACTIONS, normalizeAction } from "./audit-log.js";

const UI = () => window.ICC_ADMIN_UI;
function lang() {
  return (window.ICC_I18N && window.ICC_I18N.getStoredLang()) || "en";
}
const T = (key) => window.ICC_I18N.t(key, lang());

/**
 * The filter list is the canonical vocabulary from audit-log.js rather
 * than a second hand-maintained copy. It was previously missing publish,
 * unpublish, restore and the CMS change actions entirely — so those events
 * were recorded but could not be filtered for, which is most of what an
 * audit screen is for.
 */
const ACTIONS = AUDIT_ACTIONS;

const PAGE_SIZE = 50;

let rows = [];
let cursor = null;
let exhausted = false;
let me = null;

function escapeHTML(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function fmtDateTime(ts) {
  if (!ts) return "—";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(lang() === "ar" ? "ar-JO" : "en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function actionBadge(rawAction) {
  const action = normalizeAction(rawAction);
  const danger = action === "delete" || action === "reject";
  const warn =
    action === "permission_change" ||
    action === "deactivate" ||
    action === "unpublish" ||
    action === "restore_version";
  const cls = danger ? "badge--danger" : warn ? "badge--pending" : "badge--active";
  return `<span class="badge ${cls}">${T(`audit_action_${action}`)}</span>`;
}

function sectionLabel(section) {
  const known = PERMISSIONS.find((p) => p.key === section);
  return known ? T(known.labelKey) : section;
}

/** Rows written before Phase 8 carry `section`; newer ones carry both. */
function resourceOf(r) {
  return r.resource || r.section || "unknown";
}
function actorOf(r) {
  return r.actorDisplayName || r.actorName || r.actorEmail || "—";
}
function recordOf(r) {
  return r.resourceName || r.entityLabel || r.targetEmail || r.resourceId || r.entityId || "";
}

/**
 * Deleting an audit record is the `delete` action on the `audit` section.
 *
 * This previously asked for a permission named "auditDelete", which is not
 * a section in the catalog — so can() always returned false and the
 * control was unreachable for every non-Super-Admin no matter what the
 * Super Admin had granted them.
 */
function canDelete() {
  return can(me, "audit", PERM_ACTIONS.DELETE);
}

/* ------------------------------------------------------------------ */
/* Filters                                                             */
/* ------------------------------------------------------------------ */

function populateFilters() {
  const sectionSel = document.querySelector("[data-section-filter]");
  PERMISSIONS.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.key;
    opt.textContent = T(p.labelKey);
    sectionSel.appendChild(opt);
  });

  const actionSel = document.querySelector("[data-action-filter]");
  ACTIONS.forEach((a) => {
    const opt = document.createElement("option");
    opt.value = a;
    opt.textContent = T(`audit_action_${a}`);
    actionSel.appendChild(opt);
  });
}

/**
 * The actor filter is built from the actors present in the LOADED rows,
 * not from the user list.
 *
 * Two reasons. An admin holding `audit` but not `users` cannot read the
 * user collection at all, so sourcing the list from there would leave them
 * with an empty dropdown. And an account that has since been deleted still
 * appears in the log — filtering by it has to stay possible, which it
 * wouldn't be if the options came from accounts that currently exist.
 */
function populateActorFilter() {
  const sel = document.querySelector("[data-actor-filter]");
  if (!sel) return;
  const current = sel.value;

  const seen = new Map();
  rows.forEach((r) => {
    if (r.actorUid && !seen.has(r.actorUid)) seen.set(r.actorUid, actorOf(r));
  });

  sel.innerHTML =
    `<option value="">${T("admin_filter_all_admins")}</option>` +
    [...seen.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([uid, name]) => `<option value="${escapeHTML(uid)}">${escapeHTML(name)}</option>`)
      .join("");

  if (current && seen.has(current)) sel.value = current;
}

/** Parse a date input into a Date, or null when blank/invalid. */
function dateInput(selector, endOfDay = false) {
  const raw = document.querySelector(selector)?.value;
  if (!raw) return null;
  const d = new Date(raw + (endOfDay ? "T23:59:59.999" : "T00:00:00"));
  return Number.isNaN(d.getTime()) ? null : d;
}

function currentQuery() {
  return {
    section: document.querySelector("[data-section-filter]").value || undefined,
    action: document.querySelector("[data-action-filter]").value || undefined,
    actorUid: document.querySelector("[data-actor-filter]")?.value || undefined,
    from: dateInput("[data-date-from]"),
    to: dateInput("[data-date-to]", true),
    pageSize: PAGE_SIZE,
  };
}

function visibleRows() {
  const search = (document.querySelector("[data-search]").value || "").trim().toLowerCase();
  const sort = document.querySelector("[data-sort]").value;

  let list = rows;
  if (search) {
    list = list.filter((r) =>
      `${actorOf(r)} ${r.actorEmail || ""} ${recordOf(r)} ${r.targetEmail || ""} ${
        r.summary || ""
      } ${sectionLabel(resourceOf(r))} ${(r.changedFields || []).join(" ")}`
        .toLowerCase()
        .includes(search)
    );
  }
  if (sort === "asc") list = [...list].reverse();
  return list;
}

/* ------------------------------------------------------------------ */
/* Render                                                              */
/* ------------------------------------------------------------------ */

function rowHTML(r) {
  return `
    <tr data-id="${r.id}">
      <td class="nowrap">${fmtDateTime(r.at)}</td>
      <td class="wrap">
        <strong>${escapeHTML(actorOf(r))}</strong><br>
        <span class="muted">${escapeHTML(r.actorEmail || "")}</span>
      </td>
      <td>${actionBadge(r.action)}</td>
      <td>${escapeHTML(sectionLabel(resourceOf(r)))}</td>
      <td class="wrap">${escapeHTML(recordOf(r) || "—")}</td>
      <td>
        <div class="admin-table__actions">
          <button class="icon-btn" data-action="details" title="${T("admin_view_details")}">⋯</button>
          ${
            canDelete()
              ? `<button class="icon-btn icon-btn--danger" data-action="delete" title="${T(
                  "admin_delete"
                )}">🗑</button>`
              : ""
          }
        </div>
      </td>
    </tr>`;
}

function render() {
  const table = document.querySelector("[data-table]");
  const body = document.querySelector("[data-table-body]");
  const mount = document.querySelector("[data-state-mount]");
  const list = visibleRows();

  if (!list.length) {
    table.hidden = true;
    mount.innerHTML = UI().stateHTML("empty", {
      title: T("admin_audit_empty_title"),
      body: T("admin_audit_empty_body"),
    });
  } else {
    mount.innerHTML = "";
    table.hidden = false;
    body.innerHTML = list.map(rowHTML).join("");
  }

  document.querySelector("[data-load-more]").hidden = exhausted;
}

async function load(reset = true) {
  const mount = document.querySelector("[data-state-mount]");
  if (reset) {
    rows = [];
    cursor = null;
    exhausted = false;
    mount.innerHTML = UI().stateHTML("loading", { title: "", body: T("state_loading") });
  }
  try {
    const result = await getAuditLogs({ ...currentQuery(), cursor });
    rows = reset ? result.rows : rows.concat(result.rows);
    cursor = result.cursor;
    exhausted = result.exhausted;
    populateActorFilter();
    render();
  } catch (err) {
    console.error("[ICC Admin] Failed to load audit logs:", err);
    mount.innerHTML = UI().stateHTML("error", {
      title: T("state_error_title"),
      body: T("state_error_body"),
    });
  }
}

/* ------------------------------------------------------------------ */
/* Detail view                                                         */
/* ------------------------------------------------------------------ */

function changeTableHTML(r) {
  const fields = r.changedFields || [];
  if (!fields.length) {
    return `<p class="hint">${T("admin_audit_no_diff")}</p>`;
  }
  return `
    <div class="admin-table-wrap">
      <table class="admin-table admin-table--diff">
        <thead>
          <tr>
            <th>${T("admin_field_field")}</th>
            <th>${T("admin_field_before")}</th>
            <th>${T("admin_field_after")}</th>
          </tr>
        </thead>
        <tbody>
          ${fields
            .map(
              (f) => `
            <tr>
              <td><code>${escapeHTML(f)}</code></td>
              <td class="wrap diff-before">${escapeHTML(
                (r.before && r.before[f]) ?? "—"
              )}</td>
              <td class="wrap diff-after">${escapeHTML((r.after && r.after[f]) ?? "—")}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}

function openDetails(r) {
  const body = document.createElement("div");
  body.innerHTML = `
    <dl class="audit-detail">
      <div><dt>${T("admin_field_when")}</dt><dd>${fmtDateTime(r.at)}</dd></div>
      <div><dt>${T("admin_field_actor")}</dt><dd>${escapeHTML(actorOf(r))} (${escapeHTML(
    r.actorEmail || ""
  )})</dd></div>
      <div><dt>${T("admin_field_actor_uid")}</dt><dd><code>${escapeHTML(
    r.actorUid || "—"
  )}</code></dd></div>
      <div><dt>${T("admin_field_role")}</dt><dd>${escapeHTML(r.actorRole || "—")}</dd></div>
      <div><dt>${T("admin_field_action")}</dt><dd>${T(
    `audit_action_${normalizeAction(r.action)}`
  )}</dd></div>
      <div><dt>${T("admin_field_section")}</dt><dd>${escapeHTML(
    sectionLabel(resourceOf(r))
  )}</dd></div>
      <div><dt>${T("admin_field_record")}</dt><dd>${escapeHTML(recordOf(r) || "—")}</dd></div>
      <div><dt>${T("admin_field_record_id")}</dt><dd><code>${escapeHTML(
    r.resourceId || r.entityId || "—"
  )}</code></dd></div>
      ${
        r.targetEmail
          ? `<div><dt>${T("admin_field_target")}</dt><dd>${escapeHTML(r.targetEmail)}</dd></div>`
          : ""
      }
      ${r.summary ? `<div><dt>${T("admin_field_summary")}</dt><dd>${escapeHTML(r.summary)}</dd></div>` : ""}
      ${
        r.metadata && Object.keys(r.metadata).length
          ? `<div><dt>${T("admin_field_metadata")}</dt><dd><code class="wrap">${escapeHTML(
              JSON.stringify(r.metadata)
            )}</code></dd></div>`
          : ""
      }
    </dl>
    <h4 class="admin-form__section">${T("admin_audit_changes")}</h4>
    ${changeTableHTML(r)}
  `;
  UI().openModal({ title: T("admin_audit_detail_title"), bodyEl: body });
}

/* ------------------------------------------------------------------ */
/* Delete (gated)                                                      */
/* ------------------------------------------------------------------ */

async function removeRecord(r) {
  const ok = await UI().confirmDialog({
    title: T("admin_confirm_delete_title"),
    message: T("admin_audit_delete_msg"),
    warning: T("admin_audit_delete_warning"),
    danger: true,
  });
  if (!ok) return;
  try {
    await deleteAuditLog(r.id);
    // Deleting an audit record is itself an auditable act. Logging it means
    // a gap in the history always leaves a trace of who created the gap.
    await logAction({
      action: "delete",
      section: "audit",
      entityId: r.id,
      entityLabel: `${r.action} / ${resourceOf(r)}`,
      summary: "Deleted an audit record",
      metadata: { deletedLogId: r.id, deletedAction: r.action },
    });
    UI().successToast(T("admin_deleted_success"));
    await load(true);
  } catch (err) {
    console.error("[ICC Admin] Audit delete failed:", err);
    UI().errorToast(T("admin_error_permission"));
  }
}

/* ------------------------------------------------------------------ */
/* CSV export                                                          */
/* ------------------------------------------------------------------ */

function exportCSV() {
  const list = visibleRows();
  if (!list.length) {
    UI().errorToast(T("admin_audit_empty_title"));
    return;
  }
  const header = [
    "timestamp",
    "actor_name",
    "actor_email",
    "actor_role",
    "action",
    "section",
    "entity_id",
    "entity_label",
    "target_email",
    "changed_fields",
    "before",
    "after",
  ];
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [header.join(",")];
  list.forEach((r) => {
    lines.push(
      [
        fmtDateTime(r.at),
        actorOf(r),
        r.actorEmail,
        r.actorRole,
        normalizeAction(r.action),
        resourceOf(r),
        r.resourceId || r.entityId,
        recordOf(r),
        r.targetEmail,
        (r.changedFields || []).join(" | "),
        JSON.stringify(r.before || {}),
        JSON.stringify(r.after || {}),
      ]
        .map(cell)
        .join(",")
    );
  });

  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `icc-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

function wire() {
  document.querySelector("[data-table-body]").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.closest("tr").getAttribute("data-id");
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    if (btn.getAttribute("data-action") === "details") openDetails(row);
    else removeRecord(row);
  });

  document.querySelector("[data-search]").addEventListener("input", render);
  document.querySelector("[data-sort]").addEventListener("change", render);
  // Section, action, actor and date all narrow the Firestore query, so a
  // change means a fresh fetch rather than hiding rows already loaded.
  [
    "[data-section-filter]",
    "[data-action-filter]",
    "[data-actor-filter]",
    "[data-date-from]",
    "[data-date-to]",
  ].forEach((sel) => {
    document.querySelector(sel)?.addEventListener("change", () => load(true));
  });

  document.querySelector("[data-clear-filters]")?.addEventListener("click", () => {
    ["[data-section-filter]", "[data-action-filter]", "[data-actor-filter]", "[data-date-from]", "[data-date-to]", "[data-search]"].forEach(
      (sel) => {
        const el = document.querySelector(sel);
        if (el) el.value = "";
      }
    );
    load(true);
  });
  document.querySelector("[data-load-more]").addEventListener("click", () => load(false));
  document.querySelector("[data-export-btn]").addEventListener("click", exportCSV);
}

document.addEventListener("DOMContentLoaded", () => {
  protectAdminPage("audit", async (user, profile) => {
    me = profile;
    populateFilters();
    wire();
    await load(true);
  });
});
