/**
 * bulk-actions.js
 * -----------------------------------------------------------------------
 * PHASE 6 — multi-record selection and batched operations.
 *
 * Attaches to any admin table that renders a `data-bulk-select` checkbox
 * per row, and produces a toolbar offering only the operations the viewer
 * may actually perform.
 *
 * TWO FILTERS, ALWAYS
 *   1. The MATRIX decides which buttons exist at all — an admin without
 *      `delete` never sees "Delete selected".
 *   2. OWNERSHIP decides which rows count — a restricted admin who somehow
 *      selects a record outside their scope has it dropped from the batch
 *      before anything is written, and is told how many were skipped
 *      rather than being left to wonder why the count changed.
 *
 * And the server checks both again: a bulk write is an ordinary batched
 * write, evaluated document by document against firestore.rules. A bulk
 * action cannot do anything a single action couldn't.
 *
 * Every applied batch writes ONE audit entry naming the operation, the
 * count and the affected ids — not one entry per record, which would bury
 * the log under a single "deactivate 200 subjects" click.
 * ------------------------------------------------------------------------
 */

import { can, ownsRecord, ACTIONS, WORKFLOW, workflowPatch, stateOf } from "../permissions.js";
import { bulkUpdate, bulkDelete, getDependents } from "../firestore.js";
import { logAction } from "./audit-log.js";

const UI = () => window.ICC_ADMIN_UI;
function lang() {
  return (window.ICC_I18N && window.ICC_I18N.getStoredLang()) || "en";
}
const T = (key) => window.ICC_I18N.t(key, lang());

/**
 * @param {object} cfg
 *   profile, section, collection
 *   getRecords()     — current rows on screen
 *   onDone()         — reload callback
 *   labelFor(record) — human name for audit summaries
 *   ownershipContext(record) — optional resolver hint
 */
export function initBulkActions(cfg) {
  const { profile, section } = cfg;
  const selected = new Set();

  const toolbar = document.querySelector("[data-bulk-toolbar]");
  const table = document.querySelector("[data-table]");
  if (!toolbar || !table) return { refresh() {}, clear() {} };

  /* ---------------- selection ---------------- */

  function syncToolbar() {
    const count = selected.size;
    toolbar.hidden = count === 0;
    const label = toolbar.querySelector("[data-bulk-count]");
    if (label) label.textContent = T("bulk_selected").replace("{n}", count);
  }

  function clear() {
    selected.clear();
    document
      .querySelectorAll("[data-bulk-select]")
      .forEach((cb) => {
        cb.checked = false;
      });
    const all = document.querySelector("[data-bulk-all]");
    if (all) all.checked = false;
    syncToolbar();
  }

  table.addEventListener("change", (e) => {
    const cb = e.target.closest("[data-bulk-select]");
    if (!cb) return;
    const id = cb.getAttribute("data-bulk-select");
    cb.checked ? selected.add(id) : selected.delete(id);
    syncToolbar();
  });

  const selectAll = document.querySelector("[data-bulk-all]");
  if (selectAll) {
    selectAll.addEventListener("change", () => {
      document.querySelectorAll("[data-bulk-select]").forEach((cb) => {
        cb.checked = selectAll.checked;
        const id = cb.getAttribute("data-bulk-select");
        selectAll.checked ? selected.add(id) : selected.delete(id);
      });
      syncToolbar();
    });
  }

  /* ---------------- authorization filter ---------------- */

  /**
   * Reduce the selection to the records this admin may act on.
   * Returns { ids, skipped } so the caller can report honestly.
   */
  function authorize(action) {
    const records = cfg.getRecords();
    const chosen = records.filter((r) => selected.has(r.id));
    const allowed = chosen.filter((r) =>
      can(profile, section, action) &&
      ownsRecord(profile, section, r, cfg.ownershipContext ? cfg.ownershipContext(r) : {})
    );
    return { ids: allowed.map((r) => r.id), records: allowed, skipped: chosen.length - allowed.length };
  }

  async function confirmBatch(titleKey, messageKey, count, danger = false, warning = "") {
    return UI().confirmDialog({
      title: T(titleKey),
      message: T(messageKey).replace("{n}", count),
      warning,
      danger,
    });
  }

  async function finish(actionName, result, summary) {
    await logAction({
      action: actionName,
      section,
      entityId: null,
      entityLabel: T("bulk_entity_label").replace("{n}", result.ids.length),
      summary,
      after: { affectedIds: result.ids.slice(0, 50), affectedCount: result.ids.length },
    });
    if (result.skipped) {
      UI().toast(T("bulk_skipped").replace("{n}", result.skipped), "info");
    }
    UI().successToast(T("bulk_done").replace("{n}", result.ids.length));
    clear();
    await cfg.onDone();
  }

  /* ---------------- operations ---------------- */

  async function runStateChange(toState) {
    const result = authorize(ACTIONS.PUBLISH);
    if (!result.ids.length) {
      UI().errorToast(T("bulk_nothing_allowed"));
      return;
    }
    const ok = await confirmBatch(
      `bulk_${toState}_title`,
      "bulk_state_msg",
      result.ids.length,
      toState === WORKFLOW.UNPUBLISHED
    );
    if (!ok) return;

    await bulkUpdate(cfg.collection, result.ids, workflowPatch(toState));
    await finish(
      toState === WORKFLOW.PUBLISHED ? "publish" : "unpublish",
      result,
      `${T("admin_field_state")}: ${T(`wf_${toState}`)}`
    );
  }

  async function runDelete() {
    const result = authorize(ACTIONS.DELETE);
    if (!result.ids.length) {
      UI().errorToast(T("bulk_nothing_allowed"));
      return;
    }

    // Relationship protection applies to bulk deletes too — arguably more,
    // since this is where someone can orphan a hundred records in one
    // click. The check is per record, then reported as a total.
    let depTotal = 0;
    try {
      const checks = await Promise.all(result.records.map((r) => getDependents(section, r)));
      depTotal = checks.reduce((n, deps) => n + deps.reduce((m, d) => m + d.count, 0), 0);
    } catch (err) {
      console.error("[ICC] Bulk dependency check failed:", err);
      UI().errorToast(T("rel_check_failed"));
      return;
    }

    const ok = await confirmBatch(
      "bulk_delete_title",
      "bulk_delete_msg",
      result.ids.length,
      true,
      depTotal ? T("bulk_delete_deps").replace("{count}", depTotal) : ""
    );
    if (!ok) return;

    await bulkDelete(cfg.collection, result.ids);
    await finish("delete", result, depTotal ? T("rel_deleted_with_deps").replace("{count}", depTotal) : "");
  }

  async function runSubmitForReview() {
    const result = authorize(ACTIONS.EDIT);
    if (!result.ids.length) {
      UI().errorToast(T("bulk_nothing_allowed"));
      return;
    }
    const ok = await confirmBatch("bulk_submit_title", "bulk_state_msg", result.ids.length);
    if (!ok) return;
    await bulkUpdate(cfg.collection, result.ids, workflowPatch(WORKFLOW.PENDING));
    await finish("submit", result, `${T("admin_field_state")}: ${T("wf_pending")}`);
  }

  /* ---------------- toolbar rendering ---------------- */

  function renderToolbar() {
    const buttons = [];
    if (can(profile, section, ACTIONS.PUBLISH)) {
      buttons.push(
        `<button type="button" class="btn btn--primary btn--xs" data-bulk="publish">${T("wf_publish")}</button>`,
        `<button type="button" class="btn btn--outline btn--xs" data-bulk="unpublish">${T("wf_unpublish")}</button>`
      );
    }
    if (can(profile, section, ACTIONS.EDIT) && !can(profile, section, ACTIONS.PUBLISH)) {
      // An author who can't publish can still push a batch into review.
      buttons.push(
        `<button type="button" class="btn btn--outline btn--xs" data-bulk="submit">${T("wf_submit")}</button>`
      );
    }
    if (can(profile, section, ACTIONS.DELETE)) {
      buttons.push(
        `<button type="button" class="btn btn--danger btn--xs" data-bulk="delete">${T("admin_delete")}</button>`
      );
    }

    toolbar.innerHTML = `
      <span data-bulk-count></span>
      <div class="bulk-toolbar__actions">
        ${buttons.join("") || `<span class="hint">${T("bulk_no_actions")}</span>`}
        <button type="button" class="btn btn--ghost btn--xs" data-bulk="clear">${T("bulk_clear")}</button>
      </div>`;
    toolbar.hidden = true;

    toolbar.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-bulk]");
      if (!btn) return;
      const op = btn.getAttribute("data-bulk");
      if (op === "clear") clear();
      else if (op === "publish") runStateChange(WORKFLOW.PUBLISHED);
      else if (op === "unpublish") runStateChange(WORKFLOW.UNPUBLISHED);
      else if (op === "submit") runSubmitForReview();
      else if (op === "delete") runDelete();
    });
  }

  renderToolbar();

  return {
    clear,
    refresh: syncToolbar,
    isSelected: (id) => selected.has(id),
  };
}

/** The per-row checkbox cell. Rendered only where bulk actions are on. */
export function bulkCellHTML(record) {
  return `<td class="bulk-cell"><input type="checkbox" data-bulk-select="${record.id}" aria-label="Select"></td>`;
}

/** The select-all header cell. */
export function bulkHeaderHTML() {
  return `<th class="bulk-cell"><input type="checkbox" data-bulk-all aria-label="Select all"></th>`;
}

/** True when this admin has any bulk-capable action on the section. */
export function bulkAvailable(profile, section) {
  return (
    can(profile, section, ACTIONS.PUBLISH) ||
    can(profile, section, ACTIONS.DELETE) ||
    can(profile, section, ACTIONS.EDIT)
  );
}
