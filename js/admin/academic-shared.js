/**
 * academic-shared.js
 * -----------------------------------------------------------------------
 * PHASE 7 — the pieces every academic-management screen needs, in one
 * place.
 *
 * Specializations, Academic Years, Semesters and Courses are four screens
 * with the same job: a filterable, sortable, reorderable table of
 * bilingual records that sit somewhere in
 *
 *     College → Major → Specialization → Academic Year → Semester → Course
 *
 * Writing that four times would mean four slightly different answers to
 * "what does the empty state say", "which direction does ↑ move a row in
 * RTL", and — the one that actually costs data — "what happens when you
 * delete a record something else points at". So the answers live here and
 * the screens import them.
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO
 *   It is not a second permission system. Authorization is decided by
 *   permissions.js and enforced by firestore.rules; this module only
 *   renders and asks. Where it needs to know whether a control should
 *   exist, it calls can() rather than deciding for itself.
 *
 * THE OPTIONAL-LEVEL RULE
 *   Specializations are optional. A major may have none, and everything
 *   below it must keep working when it has none. Every helper here treats
 *   an empty specializationId as "applies to the whole major" rather than
 *   as missing data, and `matchesScope()` is the single definition of that
 *   rule so the four screens cannot drift apart on it.
 * ------------------------------------------------------------------------
 */

import { getDependents } from "../firestore.js";
import { can, ACTIONS, ownershipEnabled, ownsRecord } from "../permissions.js";
import { icon } from "../icons.js";

const UI = () => window.ICC_ADMIN_UI;

export function lang() {
  return (window.ICC_I18N && window.ICC_I18N.getStoredLang()) || "en";
}

export function T(key) {
  return window.ICC_I18N ? window.ICC_I18N.t(key, lang()) : key;
}

export function escapeHTML(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

/* ==========================================================================
   NAMING
   ========================================================================== */

/**
 * A record's name in the current language, falling back through the other
 * language to the code to the id. The fallback chain matters: a record
 * half-translated during data entry should still be identifiable in the
 * table rather than rendering as an empty cell.
 */
export function localName(record) {
  if (!record) return "—";
  return (
    record.name?.[lang()] ||
    record.name?.en ||
    record.name?.ar ||
    record.code ||
    record.id ||
    "—"
  );
}

/** Look an id up in a loaded list and return its display name. */
export function nameById(list, id, fallback = "—") {
  if (!id) return fallback;
  const found = (list || []).find((x) => x.id === id);
  return found ? localName(found) : id;
}

/** "—" for an unset optional relationship, so blanks read as intentional. */
export const NONE = "—";

/* ==========================================================================
   SCOPE MATCHING — the optional-specialization rule
   ========================================================================== */

/**
 * Does `record` belong to the given major/specialization/year scope?
 *
 * The subtle case, and the reason this is one function rather than four
 * inline conditionals: a record with NO specialization belongs to every
 * specialization of its major. A course attached to the major as a whole
 * ("Calculus I", taken by every track) must appear when an admin filters
 * to a specific specialization, because it is genuinely part of that
 * specialization's plan. Filtering it out would make the curriculum look
 * incomplete and invite someone to re-create it per track.
 *
 * Passing "" or null for a scope means "don't filter on this level".
 */
export function matchesScope(record, { majorId, specializationId, academicYearId } = {}) {
  if (!record) return false;
  if (majorId && record.majorId !== majorId) return false;

  if (specializationId) {
    const own = record.specializationId || "";
    // "" on the record = applies to the whole major = matches any track.
    if (own && own !== specializationId) return false;
  }

  if (academicYearId && record.academicYearId !== academicYearId) return false;
  return true;
}

/**
 * Ownership filter that keeps SHARED records visible.
 *
 * `filterOwned()` from permissions.js fails closed: a record it cannot
 * resolve to an owned major is hidden. That is right for a semester or a
 * course, which always belong to exactly one major. It is wrong for an
 * academic year with no majorId, which belongs to every major by design —
 * hiding those from a scoped admin would empty the year dropdown on their
 * own major's semester form and make the level look broken.
 *
 * So a record with no owning id is treated as shared and kept for reading.
 * This narrows nothing and grants nothing: writing to a shared record
 * still goes through ownsRecord() in each page's validation and through
 * firestore.rules, both of which continue to refuse a restricted admin.
 */
export function filterOwnedKeepingShared(profile, section, records, ownerField = "majorId") {
  if (!ownershipEnabled(profile)) return records;
  return (records || []).filter(
    (r) => !r[ownerField] || ownsRecord(profile, section, r, { majors: r[ownerField] })
  );
}

/** Sort by displayOrder, with a stable name tiebreak for equal orders. */
export function byDisplayOrder(a, b) {
  const delta = (a.displayOrder ?? 0) - (b.displayOrder ?? 0);
  if (delta !== 0) return delta;
  return localName(a).localeCompare(localName(b));
}

/* ==========================================================================
   FORM CONTROL BUILDERS
   ========================================================================== */

/**
 * <option> list for a relationship select.
 * `placeholder` is the label for the empty choice; pass null to omit it
 * (required relationships) or a label like "All majors" / "None" to keep
 * the empty choice meaningful.
 */
export function optionsHTML(list, selectedId, placeholder = NONE) {
  const head =
    placeholder === null
      ? ""
      : `<option value="">${escapeHTML(placeholder)}</option>`;
  return (
    head +
    (list || [])
      .map(
        (item) =>
          `<option value="${escapeHTML(item.id)}"${
            item.id === selectedId ? " selected" : ""
          }>${escapeHTML(localName(item))}${
            item.active === false ? ` (${T("admin_inactive")})` : ""
          }</option>`
      )
      .join("")
  );
}

/** Active/inactive pill for a table row. */
export function statusBadgeHTML(record) {
  return record.active
    ? `<span class="badge badge--active">${T("admin_active")}</span>`
    : `<span class="badge badge--inactive">${T("admin_inactive")}</span>`;
}

/**
 * The reorder cell. The arrows are logical (first/last), not visual, so
 * they keep meaning the same thing in RTL — ↑ always moves a row earlier
 * in the curriculum regardless of text direction.
 */
export function orderCellHTML(record, index, list) {
  return `
    <div class="admin-order-cell">
      <button class="icon-btn" data-action="up" ${index === 0 ? "disabled" : ""}
              aria-label="${escapeHTML(T("admin_move_up"))}">${icon("arrow-up")}</button>
      <button class="icon-btn" data-action="down" ${index === list.length - 1 ? "disabled" : ""}
              aria-label="${escapeHTML(T("admin_move_down"))}">${icon("arrow-down")}</button>
      <span class="admin-order-cell__num">${record.displayOrder ?? "—"}</span>
    </div>`;
}

/**
 * Row action buttons, showing only what this admin may actually do.
 * A button that always fails is worse than no button, so each is gated on
 * the matching action rather than on "can they open the page".
 */
export function actionsCellHTML(profile, section, record) {
  const out = [];
  if (can(profile, section, ACTIONS.EDIT)) {
    out.push(`<button class="icon-btn" data-action="edit" title="${T("admin_edit")}">${icon("pencil")}</button>`);
  }
  if (can(profile, section, ACTIONS.PUBLISH)) {
    out.push(
      `<button class="icon-btn" data-action="toggle" title="${
        record.active ? T("admin_deactivate") : T("admin_activate")
      }">${record.active ? icon("pause") : icon("play")}</button>`
    );
  }
  if (can(profile, section, ACTIONS.DELETE)) {
    out.push(
      `<button class="icon-btn icon-btn--danger" data-action="delete" title="${T("admin_delete")}">${icon("trash")}</button>`
    );
  }
  return `<div class="admin-table__actions">${out.join("") || NONE}</div>`;
}

/**
 * Hide the toolbar controls this admin can't use.
 *
 * Row-level buttons are gated by actionsCellHTML above; this covers the
 * page-level ones, which live in the HTML rather than in rendered rows and
 * were previously shown to everyone who could open the page. An admin with
 * VIEW on Requirements should not be offered "Add requirement" — the write
 * would be refused by the rules, but only after they'd filled in the form.
 *
 * Returns the capability set so callers can reuse it without re-deriving.
 */
export function gateToolbar(profile, section, selectors = {}) {
  const caps = {
    create: can(profile, section, ACTIONS.CREATE),
    edit: can(profile, section, ACTIONS.EDIT),
    delete: can(profile, section, ACTIONS.DELETE),
    publish: can(profile, section, ACTIONS.PUBLISH),
  };

  const { add = "[data-add-btn]", bulk = "[data-bulk-bar]" } = selectors;
  if (!caps.create) document.querySelectorAll(add).forEach((el) => el.remove());
  if (!caps.edit && !caps.delete && !caps.publish) {
    document.querySelectorAll(bulk).forEach((el) => el.remove());
  }

  // A read-only viewer deserves to be told that's what they are, rather
  // than left to infer it from the absence of buttons.
  if (!caps.create && !caps.edit && !caps.delete && !caps.publish) {
    const note = document.querySelector("[data-readonly-note]");
    if (note) {
      note.textContent = T("admin_readonly_note");
      note.hidden = false;
    }
  }

  return caps;
}

/* ==========================================================================
   STATES
   ========================================================================== */

export function showLoading(mountSelector = "[data-state-mount]", tableSelector = "[data-table]") {
  const mount = document.querySelector(mountSelector);
  const table = document.querySelector(tableSelector);
  if (table) table.hidden = true;
  if (mount) mount.innerHTML = UI().stateHTML("loading", { title: "", body: T("state_loading") });
}

export function showError(mountSelector = "[data-state-mount]", tableSelector = "[data-table]") {
  const mount = document.querySelector(mountSelector);
  const table = document.querySelector(tableSelector);
  if (table) table.hidden = true;
  if (mount) {
    mount.innerHTML = UI().stateHTML("error", {
      title: T("state_error_title"),
      body: T("state_error_body"),
    });
  }
}

/**
 * Render rows, or the right empty state. There are two distinct empties
 * and conflating them is a real usability bug: "you have no records yet"
 * invites you to create one, while "your filters match nothing" invites
 * you to clear the filters. Showing the first when the second is true
 * makes admins create duplicates of records they already have.
 */
export function renderRows({
  rows,
  rowHTML,
  filtered = false,
  mountSelector = "[data-state-mount]",
  tableSelector = "[data-table]",
  bodySelector = "[data-table-body]",
  emptyTitleKey = "admin_empty_title",
  emptyBodyKey = "admin_empty_body",
}) {
  const mount = document.querySelector(mountSelector);
  const table = document.querySelector(tableSelector);
  const body = document.querySelector(bodySelector);

  if (!rows.length) {
    if (table) table.hidden = true;
    if (mount) {
      mount.innerHTML = UI().stateHTML("empty", {
        title: T(filtered ? "admin_no_matches_title" : emptyTitleKey),
        body: T(filtered ? "admin_no_matches_body" : emptyBodyKey),
      });
    }
    return;
  }

  if (mount) mount.innerHTML = "";
  if (table) table.hidden = false;
  if (body) body.innerHTML = rows.map((r, i) => rowHTML(r, i, rows)).join("");
}

/* ==========================================================================
   REORDERING
   ========================================================================== */

/**
 * Swap a record with its neighbour within its own sibling group.
 *
 * `siblings` is the already-scoped, already-sorted list — reordering must
 * happen within the group the admin is looking at, not across the whole
 * collection, or moving a first-year semester "up" could silently
 * reshuffle a different major's curriculum.
 *
 * Records that have never been ordered share displayOrder 0, so a plain
 * value swap would be a no-op. The whole visible group is therefore
 * rewritten as a contiguous 0..n-1 sequence, which also cleans up the gaps
 * left behind by deletions.
 */
export async function moveWithin(siblings, record, direction, commitOrder) {
  const ordered = [...siblings].sort(byDisplayOrder);
  const idx = ordered.findIndex((r) => r.id === record.id);
  const target = direction === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || target < 0 || target >= ordered.length) return false;

  const [moved] = ordered.splice(idx, 1);
  ordered.splice(target, 0, moved);

  const updates = ordered
    .map((r, i) => ({ id: r.id, displayOrder: i }))
    .filter((u, i) => (ordered[i].displayOrder ?? -1) !== u.displayOrder);

  if (!updates.length) return false;
  await commitOrder(updates);
  return true;
}

/* ==========================================================================
   DELETION WITH DEPENDENCY WARNING
   ========================================================================== */

/**
 * Ask before deleting, and say plainly what the deletion would break.
 *
 * Firestore has no foreign keys: deleting a major that 40 courses point at
 * succeeds instantly and leaves 40 records referencing an id that resolves
 * to nothing. They don't error — they render as blanks on the public site,
 * which is how a curriculum quietly develops holes nobody notices for a
 * term. So the counts are fetched first and spelled out per type, and
 * deactivating is offered as the safer default.
 *
 * Fails CLOSED: if the dependency check itself fails, the delete is
 * refused rather than attempted, because an unverified delete is exactly
 * the case this exists to prevent.
 *
 * @returns {Promise<"delete"|"deactivate"|"cancel">}
 */
export async function confirmDeleteWithDependencies({ section, record, label }) {
  let dependents = [];
  try {
    dependents = await getDependents(section, record);
  } catch (err) {
    console.error("[ICC Admin] Dependency check failed:", err);
    UI().errorToast(T("dep_check_failed"));
    return "cancel";
  }

  const total = dependents.reduce((n, d) => n + d.count, 0);

  return new Promise((resolve) => {
    const body = document.createElement("div");
    const list = dependents
      .map((d) => `<li><strong>${d.count}</strong> ${escapeHTML(T(`perm_${d.section}`))}</li>`)
      .join("");

    body.innerHTML = `
      <p>${T("admin_confirm_delete_msg")} — "${escapeHTML(label || record.id)}"</p>
      ${
        total
          ? `<div class="admin-modal__warning">
               <strong>${T("dep_title")}</strong>
               <p>${T("dep_body").replace("{count}", total)}</p>
               <ul class="dep-list">${list}</ul>
               <p class="hint">${T("dep_hint")}</p>
             </div>`
          : `<p class="hint">${T("dep_none")}</p>`
      }
      <div class="admin-form__actions admin-form__actions--stack">
        <button type="button" class="btn btn--outline" data-choice="cancel">${T("admin_cancel")}</button>
        <button type="button" class="btn btn--primary" data-choice="deactivate">${T("dep_deactivate_btn")}</button>
        <button type="button" class="btn btn--danger" data-choice="delete">${
          total ? T("dep_delete_anyway_btn") : T("admin_delete")
        }</button>
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

/* ==========================================================================
   FORM UTILITIES
   ========================================================================== */

/** Read a bilingual {en, ar} pair out of a FormData by field prefix. */
export function readBilingual(fd, prefix) {
  return {
    en: (fd.get(`${prefix}_en`) || "").toString().trim(),
    ar: (fd.get(`${prefix}_ar`) || "").toString().trim(),
  };
}

/**
 * Validate required fields, marking each empty one.
 * `pairs` is [[inputName, dataFieldKey], ...] matching the data-field
 * wrappers in the form markup.
 */
export function requireFields(form, pairs) {
  UI().clearAllErrors(form);
  let ok = true;
  for (const [inputName, fieldKey] of pairs) {
    const input = form.querySelector(`[name="${inputName}"]`);
    const wrap = form.querySelector(`[data-field="${fieldKey}"]`);
    if (!input || !String(input.value).trim()) {
      UI().setFieldError(wrap, T("admin_field_required"));
      ok = false;
    }
  }
  return ok;
}

/** Mark one field invalid with a specific message and return false. */
export function fieldError(form, fieldKey, messageKey) {
  UI().setFieldError(form.querySelector(`[data-field="${fieldKey}"]`), T(messageKey));
  return false;
}

/**
 * Standard save-button busy state. Returned function restores it, so the
 * caller's `finally` is one line and can't forget a branch.
 */
export function busy(button) {
  if (!button) return () => {};
  const original = button.textContent;
  button.disabled = true;
  button.textContent = T("admin_saving");
  return () => {
    button.disabled = false;
    button.textContent = original;
  };
}
