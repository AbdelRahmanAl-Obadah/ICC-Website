/**
 * resource-ops.js
 * -----------------------------------------------------------------------
 * PHASE 6 — the single pipeline every content mutation in the Admin Panel
 * goes through.
 *
 * The brief asked for these systems to be one coherent architecture rather
 * than disconnected features, and this module is where that actually
 * happens. One call to saveRecord() or deleteRecord():
 *
 *   1. PERMISSION MATRIX — checks the specific action (create/edit/delete/
 *      publish), not just "can they open this page".
 *   2. OWNERSHIP — checks this particular record is in their scope, on both
 *      the old and the new value.
 *   3. WORKFLOW — an author without `publish` has their work forced into
 *      draft or pending-review instead of going live.
 *   4. VERSION HISTORY — snapshots the previous state before overwriting.
 *   5. RELATIONSHIP PROTECTION — refuses to silently orphan dependent
 *      records, and offers archive / reassign / cascade instead.
 *   6. AUDIT LOG — records who did what, with a before/after diff.
 *
 * Skipping any step isn't possible from a page's point of view: pages call
 * this, not Firestore. And because all six client-side steps are advisory,
 * firestore.rules independently enforces 1, 2 and 3 on the server — this
 * module exists to make the panel behave correctly and explain itself, not
 * to be the security boundary.
 * ------------------------------------------------------------------------
 */

import {
  can,
  canActOn,
  ownsRecord,
  ownershipEnabled,
  isSuperAdmin,
  ACTIONS,
  WORKFLOW,
  workflowPatch,
  stateOf,
  getPermission,
} from "../permissions.js";
import { logAction } from "./audit-log.js";
import { icon } from "../icons.js";
import {
  saveVersion,
  getDependents,
  deleteDependents,
  reassignDependents,
} from "../firestore.js";

const UI = () => window.ICC_ADMIN_UI;
function lang() {
  return (window.ICC_I18N && window.ICC_I18N.getStoredLang()) || "en";
}
const T = (key) => window.ICC_I18N.t(key, lang());

/** Thrown when the panel refuses an operation. Pages show err.message. */
export class NotAuthorizedError extends Error {
  constructor(messageKey) {
    super(window.ICC_I18N.t(messageKey, lang()));
    this.name = "NotAuthorizedError";
  }
}

/* ==========================================================================
   WORKFLOW RESOLUTION
   ========================================================================== */

/**
 * Decide the state a save should land in.
 *
 * The rule that matters: an author who cannot publish never produces
 * public content. If they ASK to publish, the change is routed into
 * "pending review" rather than rejected outright — that's the approval
 * workflow, and refusing the save instead would just teach people to stop
 * pressing the button.
 *
 * @param {object} profile
 * @param {string} section
 * @param {string} intent  "draft" | "publish" | "keep"
 * @param {object} existing  the record being edited, if any
 */
export function resolveWorkflowState(profile, section, intent, existing = null) {
  const def = getPermission(section);
  if (!def || !def.workflow) return null; // section has no workflow

  const mayPublish = can(profile, section, ACTIONS.PUBLISH);
  const current = existing ? stateOf(existing) : WORKFLOW.DRAFT;

  if (intent === "publish") {
    return mayPublish ? WORKFLOW.PUBLISHED : WORKFLOW.PENDING;
  }
  if (intent === "draft") return WORKFLOW.DRAFT;

  // "keep": preserve the existing state, unless preserving it would mean an
  // author without publish rights silently updating live content — in that
  // case the edit goes to review and the published version stays as it is
  // until someone authorized approves the replacement.
  if (current === WORKFLOW.PUBLISHED && !mayPublish) return WORKFLOW.PENDING;
  return current;
}

/** Does saving with this intent require someone else's approval? */
export function needsApproval(profile, section, intent) {
  return resolveWorkflowState(profile, section, intent) === WORKFLOW.PENDING;
}

/* ==========================================================================
   SAVE
   ========================================================================== */

/**
 * Create or update a record with every guarantee above applied.
 *
 * @param {object} opts
 *   profile, section, collection
 *   existing   — the current record (null for a create)
 *   data       — the new field values
 *   intent     — "draft" | "publish" | "keep"
 *   label      — human-readable name for the audit entry
 *   create(data) / update(id, data) — the section's own Firestore writers,
 *                 so this module never needs to know their field shapes
 *   ownershipContext — extra hints for ownsRecord (e.g. a resolved majorId)
 * @returns {Promise<{id, state, pending}>}
 */
export async function saveRecord(opts) {
  const {
    profile,
    section,
    collection,
    existing = null,
    data,
    intent = "keep",
    label = "",
    create,
    update,
    ownershipContext = {},
  } = opts;

  const isCreate = !existing?.id;
  const action = isCreate ? ACTIONS.CREATE : ACTIONS.EDIT;

  // --- 1 & 2: matrix + ownership ---------------------------------------
  if (!can(profile, section, action)) {
    throw new NotAuthorizedError(isCreate ? "err_no_create" : "err_no_edit");
  }
  if (!isCreate && !ownsRecord(profile, section, existing, ownershipContext)) {
    throw new NotAuthorizedError("err_not_owner");
  }
  // A restricted admin must not create a record outside their own scope
  // either, or ownership would be trivially escapable by creating rather
  // than editing.
  if (!ownsRecord(profile, section, { ...data, id: existing?.id }, ownershipContext)) {
    throw new NotAuthorizedError("err_not_owner_target");
  }

  // --- 3: workflow ------------------------------------------------------
  const state = resolveWorkflowState(profile, section, intent, existing);
  const payload = state ? { ...data, ...workflowPatch(state) } : { ...data };

  // --- 4: version snapshot (before the write, never after) --------------
  if (!isCreate) {
    try {
      await saveVersion(collection, existing.id, existing, {
        actorUid: profile.uid,
        actorName: profile.displayName,
        actorEmail: profile.email,
        reason: "update",
      });
    } catch (err) {
      // A history gap is bad; blocking the admin's save is worse.
      console.error("[ICC] Version snapshot failed:", err);
    }
  }

  // --- the write --------------------------------------------------------
  let id;
  if (isCreate) {
    id = await create(payload);
  } else {
    id = existing.id;
    await update(id, payload);
  }

  // --- 6: audit ---------------------------------------------------------
  await logAction({
    action: isCreate ? "create" : "update",
    section,
    entityId: id,
    entityLabel: label,
    summary: state ? `${T("admin_field_state")}: ${T(`wf_${state}`)}` : "",
    before: isCreate ? null : existing,
    after: { ...(existing || {}), ...payload },
  });

  return { id, state, pending: state === WORKFLOW.PENDING };
}

/* ==========================================================================
   PUBLISH / UNPUBLISH / REVIEW
   ========================================================================== */

/**
 * Move a record between workflow states.
 * Publishing, approving and rejecting all land here, so the permission
 * check and the audit entry are identical for all three.
 */
export async function transitionRecord(opts) {
  const { profile, section, collection, record, toState, update, label = "", reviewer = false } =
    opts;

  // Acting on your OWN record needs publish on the section; acting as a
  // reviewer on someone else's submission needs the workflow:publish
  // capability. Either is sufficient — a Super Admin holds both.
  const mayAct =
    can(profile, section, ACTIONS.PUBLISH) || (reviewer && can(profile, "workflow", ACTIONS.PUBLISH));
  if (!mayAct) throw new NotAuthorizedError("err_no_publish");
  if (!ownsRecord(profile, section, record)) throw new NotAuthorizedError("err_not_owner");

  try {
    await saveVersion(collection, record.id, record, {
      actorUid: profile.uid,
      actorName: profile.displayName,
      actorEmail: profile.email,
      reason: "transition",
    });
  } catch (err) {
    console.error("[ICC] Version snapshot failed:", err);
  }

  const patch = workflowPatch(toState);
  await update(record.id, patch);

  const ACTION_FOR_STATE = {
    [WORKFLOW.PUBLISHED]: "publish",
    [WORKFLOW.UNPUBLISHED]: "unpublish",
    [WORKFLOW.APPROVED]: "approve",
    [WORKFLOW.REJECTED]: "reject",
    [WORKFLOW.PENDING]: "submit",
    [WORKFLOW.DRAFT]: "update",
  };

  await logAction({
    action: ACTION_FOR_STATE[toState] || "update",
    section,
    entityId: record.id,
    entityLabel: label,
    before: { status: stateOf(record), active: record.active === true },
    after: patch,
  });

  return toState;
}

/* ==========================================================================
   DELETE — with relationship protection
   ========================================================================== */

/**
 * Delete a record, but never silently break the database.
 *
 * Firestore has no foreign keys, so deleting a major that 40 subjects point
 * at succeeds instantly and leaves 40 orphans that render as blanks on the
 * public site. This asks first, shows exactly what depends on the record,
 * and offers the three sane outcomes: archive it instead (the default and
 * safest), delete the dependents too, or cancel.
 *
 * @returns {Promise<"deleted"|"archived"|"cancelled">}
 */
export async function deleteRecord(opts) {
  const {
    profile,
    section,
    collection,
    record,
    label = "",
    remove,
    update,
    ownershipContext = {},
  } = opts;

  if (!canActOn(profile, section, ACTIONS.DELETE, record, ownershipContext)) {
    throw new NotAuthorizedError("err_no_delete");
  }

  let dependents = [];
  try {
    dependents = await getDependents(section, record);
  } catch (err) {
    console.error("[ICC] Dependency check failed:", err);
    // Fail closed: if we can't prove the record is safe to delete, say so
    // rather than deleting it on the assumption that it is.
    UI().errorToast(T("rel_check_failed"));
    return "cancelled";
  }

  const totalDeps = dependents.reduce((n, d) => n + d.count, 0);
  const choice = await openDeleteDialog({ record, label, dependents, totalDeps, profile, section });
  if (choice === "cancel") return "cancelled";

  // --- Archive instead of deleting -------------------------------------
  if (choice === "archive") {
    await update(record.id, workflowPatch(WORKFLOW.UNPUBLISHED));
    await logAction({
      action: "unpublish",
      section,
      entityId: record.id,
      entityLabel: label,
      summary: T("rel_archived_instead"),
      before: { status: stateOf(record), active: record.active === true },
      after: workflowPatch(WORKFLOW.UNPUBLISHED),
    });
    UI().successToast(T("rel_archived_success"));
    return "archived";
  }

  // --- Cascade ---------------------------------------------------------
  if (choice === "cascade" && totalDeps) {
    await deleteDependents(dependents);
  }

  try {
    await saveVersion(collection, record.id, record, {
      actorUid: profile.uid,
      actorName: profile.displayName,
      actorEmail: profile.email,
      reason: "delete",
    });
  } catch (err) {
    console.error("[ICC] Version snapshot failed:", err);
  }

  await remove(record.id);

  await logAction({
    action: "delete",
    section,
    entityId: record.id,
    entityLabel: label,
    summary: totalDeps
      ? T("rel_deleted_with_deps").replace("{count}", totalDeps)
      : "",
    before: record,
  });

  UI().successToast(T("admin_deleted_success"));
  return "deleted";
}

/**
 * The delete dialog. Its whole job is to make the consequences legible
 * before anything irreversible happens, which is why the dependent counts
 * are spelled out per type rather than summarised as one number.
 */
function openDeleteDialog({ record, label, dependents, totalDeps, profile, section }) {
  return new Promise((resolve) => {
    const body = document.createElement("div");

    const depList = dependents
      .map(
        (d) =>
          `<li><strong>${d.count}</strong> ${T(`perm_${d.section}`)}</li>`
      )
      .join("");

    const mayArchive = can(profile, section, ACTIONS.PUBLISH) || isSuperAdmin(profile);

    body.innerHTML = `
      <p>${T("admin_confirm_delete_msg")} — "${escapeHTML(label || record.id)}"</p>

      ${
        totalDeps
          ? `<div class="rel-warning">
               <strong>${T("rel_title")}</strong>
               <p>${T("rel_body").replace("{count}", totalDeps)}</p>
               <ul class="rel-list">${depList}</ul>
               <p class="hint">${T("rel_hint")}</p>
             </div>`
          : `<p class="hint">${T("rel_none")}</p>`
      }

      <div class="admin-form__actions admin-form__actions--stack">
        <button type="button" class="btn btn--outline" data-choice="cancel">${T("admin_cancel")}</button>
        ${
          mayArchive
            ? `<button type="button" class="btn btn--primary" data-choice="archive">${T("rel_archive_btn")}</button>`
            : ""
        }
        ${
          totalDeps
            ? `<button type="button" class="btn btn--danger" data-choice="cascade">${T(
                "rel_cascade_btn"
              ).replace("{count}", totalDeps)}</button>`
            : `<button type="button" class="btn btn--danger" data-choice="delete">${T("admin_delete")}</button>`
        }
      </div>`;

    body.querySelectorAll("[data-choice]").forEach((btn) => {
      btn.addEventListener("click", () => {
        UI().closeModal();
        resolve(btn.getAttribute("data-choice"));
      });
    });

    UI().openModal({ title: T("admin_confirm_delete_title"), bodyEl: body });
  });
}

/**
 * Offer to move dependents to a different parent instead of deleting them.
 * Exposed separately because it only makes sense where a like-for-like
 * replacement exists (another major, another semester).
 */
export async function reassign(dependents, field, newValue, meta = {}) {
  await reassignDependents(dependents, field, newValue);
  await logAction({
    action: "update",
    section: meta.section || "unknown",
    entityId: meta.entityId || null,
    entityLabel: meta.label || "",
    summary: T("rel_reassigned").replace("{field}", field),
    after: { [field]: newValue },
  });
}

export function escapeHTML(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

/* ==========================================================================
   SHARED RENDER HELPERS
   ========================================================================== */

/** Workflow badge for a table row. */
export function stateBadge(record) {
  const state = stateOf(record);
  const def = { draft: "badge--inactive", pending: "badge--pending", approved: "badge--admin", published: "badge--active", rejected: "badge--danger", unpublished: "badge--inactive" };
  return `<span class="badge ${def[state] || "badge--inactive"}">${T(`wf_${state}`)}</span>`;
}

/**
 * Build the action buttons for a row, showing only what this admin may
 * actually do to THIS record. A control that leads to a permission error
 * is worse than no control at all.
 */
export function rowActionsHTML(profile, section, record, ownershipContext = {}) {
  const owns = ownsRecord(profile, section, record, ownershipContext);
  const state = stateOf(record);
  const out = [];

  if (owns && can(profile, section, ACTIONS.EDIT)) {
    out.push(`<button class="icon-btn" data-action="edit" title="${T("admin_edit")}">${icon("pencil")}</button>`);
  }
  if (owns && can(profile, section, ACTIONS.CREATE)) {
    out.push(`<button class="icon-btn" data-action="duplicate" title="${T("admin_duplicate")}">⧉</button>`);
  }
  if (owns && can(profile, section, ACTIONS.PUBLISH)) {
    out.push(
      state === WORKFLOW.PUBLISHED
        ? `<button class="icon-btn" data-action="unpublish" title="${T("wf_unpublish")}">${icon("pause")}</button>`
        : `<button class="icon-btn" data-action="publish" title="${T("wf_publish")}">${icon("play")}</button>`
    );
  }
  if (can(profile, "versions", ACTIONS.VIEW)) {
    out.push(`<button class="icon-btn" data-action="history" title="${T("ver_history")}">⟲</button>`);
  }
  if (owns && can(profile, section, ACTIONS.DELETE)) {
    out.push(`<button class="icon-btn icon-btn--danger" data-action="delete" title="${T("admin_delete")}">${icon("trash")}</button>`);
  }
  return out.join("") || "—";
}

/** Banner explaining an ownership restriction, shown above a filtered table. */
export function ownershipNoticeHTML(profile, section) {
  if (!ownershipEnabled(profile)) return "";
  const def = getPermission(section);
  if (!def || !def.ownership) return "";
  return `<div class="admin-alert admin-alert--info">${T("ownership_notice")}</div>`;
}
