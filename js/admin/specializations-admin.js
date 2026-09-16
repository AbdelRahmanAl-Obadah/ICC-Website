/**
 * specializations-admin.js — admin/specializations.html
 * -----------------------------------------------------------------------
 * PHASE 7 — full CRUD for the specialization level.
 *
 * A specialization is an OPTIONAL branch of a major: "Software
 * Engineering" might have none, while "Computer Science" might have
 * "Artificial Intelligence" and "Cybersecurity". Every other academic
 * screen has to keep working for both shapes, so the rule enforced here
 * and in academic-shared.js is that a missing specialization means
 * "applies to the whole major" — never "broken record".
 *
 * A specialization always belongs to exactly one major. That relationship
 * is stored as `majorId` and nothing about the major is copied onto the
 * specialization: the major's name is resolved at render time from the
 * loaded majors list. Denormalizing it would mean renaming a major leaves
 * stale names scattered across its branches.
 * ------------------------------------------------------------------------
 */

import { protectAdminPage } from "./admin-guard.js";
import { logAction } from "./audit-log.js";
import {
  getMajors,
  getAllSpecializations,
  createSpecialization,
  updateSpecialization,
  deleteSpecialization,
  reorderDocs,
} from "../firestore.js";
import { can, ACTIONS, filterOwned, ownsRecord } from "../permissions.js";
import {
  T,
  lang,
  escapeHTML,
  localName,
  nameById,
  optionsHTML,
  statusBadgeHTML,
  orderCellHTML,
  actionsCellHTML,
  showLoading,
  showError,
  renderRows,
  moveWithin,
  byDisplayOrder,
  confirmDeleteWithDependencies,
  readBilingual,
  requireFields,
  fieldError,
  busy,
} from "./academic-shared.js";

const UI = () => window.ICC_ADMIN_UI;
const SECTION = "specializations";
const COLLECTION = "specializations";

let profile = null;
let allMajors = [];
let allSpecializations = [];

/* ==================================================================== */
/* Filtering + sorting                                                  */
/* ==================================================================== */

function currentFilters() {
  return {
    majorId: document.querySelector("[data-major-filter]")?.value || "all",
    status: document.querySelector("[data-status-filter]")?.value || "all",
    search: (document.querySelector("[data-search]")?.value || "").trim().toLowerCase(),
  };
}

function isFiltered() {
  const f = currentFilters();
  return f.majorId !== "all" || f.status !== "all" || !!f.search;
}

function applyFilters(list) {
  const f = currentFilters();
  return list.filter((s) => {
    if (f.majorId !== "all" && s.majorId !== f.majorId) return false;
    if (f.status === "active" && !s.active) return false;
    if (f.status === "inactive" && s.active) return false;
    if (!f.search) return true;
    const hay = `${s.name?.en || ""} ${s.name?.ar || ""} ${s.code || ""} ${nameById(
      allMajors,
      s.majorId
    )}`.toLowerCase();
    return hay.includes(f.search);
  });
}

/**
 * Sorting is by the chosen column, but reordering only makes sense in
 * displayOrder view — the ↑/↓ buttons write displayOrder, so offering them
 * while the table is sorted by name would show a row "moving" nowhere.
 */
function currentSort() {
  return document.querySelector("[data-sort]")?.value || "order";
}

function applySort(list) {
  const sorted = [...list];
  switch (currentSort()) {
    case "name":
      return sorted.sort((a, b) => localName(a).localeCompare(localName(b), lang()));
    case "code":
      return sorted.sort((a, b) => (a.code || "").localeCompare(b.code || ""));
    case "major":
      return sorted.sort((a, b) =>
        nameById(allMajors, a.majorId).localeCompare(nameById(allMajors, b.majorId), lang())
      );
    default:
      return sorted.sort(byDisplayOrder);
  }
}

/* ==================================================================== */
/* Rendering                                                            */
/* ==================================================================== */

function rowHTML(s, index, list) {
  const reorderable = currentSort() === "order" && can(profile, SECTION, ACTIONS.EDIT);
  return `
    <tr data-id="${escapeHTML(s.id)}">
      <td>${reorderable ? orderCellHTML(s, index, list) : `<span class="admin-order-cell__num">${s.displayOrder ?? "—"}</span>`}</td>
      <td class="wrap">${escapeHTML(localName(s))}</td>
      <td><span class="tag">${escapeHTML(s.code || "—")}</span></td>
      <td class="wrap">${escapeHTML(nameById(allMajors, s.majorId))}</td>
      <td>${statusBadgeHTML(s)}</td>
      <td>${actionsCellHTML(profile, SECTION, s)}</td>
    </tr>`;
}

function render() {
  const rows = applySort(applyFilters(allSpecializations));
  renderRows({
    rows,
    rowHTML,
    filtered: isFiltered(),
    emptyTitleKey: "spec_empty_title",
    emptyBodyKey: "spec_empty_body",
  });
}

function populateMajorFilter() {
  const select = document.querySelector("[data-major-filter]");
  if (!select) return;
  const current = select.value || "all";
  select.innerHTML =
    `<option value="all">${T("admin_filter_all_majors")}</option>` +
    allMajors
      .map((m) => `<option value="${escapeHTML(m.id)}">${escapeHTML(localName(m))}</option>`)
      .join("");
  select.value = allMajors.some((m) => m.id === current) || current === "all" ? current : "all";
}

async function loadAll() {
  showLoading();
  try {
    const [majors, specializations] = await Promise.all([
      getMajors(),
      getAllSpecializations(),
    ]);
    // An ownership-restricted admin sees only their own majors' branches.
    allMajors = filterOwned(profile, "majors", majors);
    allSpecializations = filterOwned(profile, SECTION, specializations);
    populateMajorFilter();
    render();
  } catch (err) {
    console.error("[ICC Admin] Failed to load specializations:", err);
    showError();
  }
}

/* ==================================================================== */
/* Form                                                                 */
/* ==================================================================== */

function formHTML(spec) {
  const s = spec || {};
  const nextOrder = allSpecializations.filter((x) => x.majorId === s.majorId).length;
  return `
    <form data-spec-form class="admin-form" novalidate>
      <div class="form-field" data-field="majorId">
        <label>${T("admin_field_major")} *</label>
        <select name="majorId" required>${optionsHTML(allMajors, s.majorId, "—")}</select>
        <p class="form-field__error">${T("admin_field_required")}</p>
        <p class="hint">${T("spec_major_hint")}</p>
      </div>

      <div class="admin-form__row">
        <div class="form-field" data-field="name_en">
          <label>${T("admin_field_name_en")} *</label>
          <input type="text" name="name_en" value="${escapeHTML(s.name?.en || "")}" required>
          <p class="form-field__error">${T("admin_field_required")}</p>
        </div>
        <div class="form-field" data-field="name_ar">
          <label>${T("admin_field_name_ar")} *</label>
          <input type="text" name="name_ar" dir="rtl" value="${escapeHTML(s.name?.ar || "")}" required>
          <p class="form-field__error">${T("admin_field_required")}</p>
        </div>
      </div>

      <div class="form-field" data-field="code">
        <label>${T("admin_field_code")} *</label>
        <input type="text" name="code" value="${escapeHTML(s.code || "")}" required>
        <p class="form-field__error">${T("admin_field_required")}</p>
        <p class="hint">${T("spec_code_hint")}</p>
      </div>

      <div class="admin-form__row">
        <div class="form-field">
          <label>${T("admin_field_description_en")}</label>
          <textarea name="description_en" rows="3">${escapeHTML(s.description?.en || "")}</textarea>
        </div>
        <div class="form-field">
          <label>${T("admin_field_description_ar")}</label>
          <textarea name="description_ar" dir="rtl" rows="3">${escapeHTML(s.description?.ar || "")}</textarea>
        </div>
      </div>

      <div class="admin-form__row">
        <div class="form-field">
          <label>${T("admin_field_display_order")}</label>
          <input type="number" name="displayOrder" value="${s.displayOrder ?? nextOrder}">
        </div>
        <div class="form-field">
          <span class="form-check" style="margin-top:28px;">
            <input type="checkbox" name="active" ${s.active ? "checked" : ""}>
            <label>${T("admin_field_active")}</label>
          </span>
        </div>
      </div>

      <div class="admin-form__actions">
        <button type="button" class="btn btn--outline" data-cancel>${T("admin_cancel")}</button>
        <button type="submit" class="btn btn--primary" data-submit>${T("admin_save")}</button>
      </div>
    </form>`;
}

function readForm(form) {
  const fd = new FormData(form);
  return {
    majorId: (fd.get("majorId") || "").toString(),
    name: readBilingual(fd, "name"),
    code: (fd.get("code") || "").toString().trim(),
    description: readBilingual(fd, "description"),
    displayOrder: Number(fd.get("displayOrder")) || 0,
    active: fd.get("active") === "on",
  };
}

/**
 * Validate before writing. Two checks beyond "is it filled in":
 *
 *  - the major must actually exist in the loaded list, so a stale form
 *    left open while a major was deleted elsewhere can't create an orphan;
 *  - the code must be unique within its major, because course codes are
 *    how students and admins refer to a track in conversation, and two
 *    tracks answering to "CS-AI" makes every later reference ambiguous.
 */
function validate(form, data, editingId) {
  if (!requireFields(form, [
    ["majorId", "majorId"],
    ["name_en", "name_en"],
    ["name_ar", "name_ar"],
    ["code", "code"],
  ])) {
    return false;
  }

  if (!allMajors.some((m) => m.id === data.majorId)) {
    return fieldError(form, "majorId", "err_major_missing");
  }

  if (!ownsRecord(profile, SECTION, data, { majors: data.majorId })) {
    return fieldError(form, "majorId", "err_not_owner_target");
  }

  const clash = allSpecializations.some(
    (s) =>
      s.id !== editingId &&
      s.majorId === data.majorId &&
      (s.code || "").toLowerCase() === data.code.toLowerCase()
  );
  if (clash) return fieldError(form, "code", "err_code_duplicate");

  return true;
}

function openForm(spec) {
  if (!allMajors.length) {
    UI().errorToast(T("err_no_majors_yet"));
    return;
  }

  const wrap = document.createElement("div");
  wrap.innerHTML = formHTML(spec);
  const form = wrap.querySelector("[data-spec-form]");
  wrap.querySelector("[data-cancel]").addEventListener("click", () => UI().closeModal());

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = readForm(form);
    if (!validate(form, data, spec?.id)) return;

    // Publishing is a separate right from editing: an admin without it may
    // still save, but the record stays inactive rather than going live.
    if (data.active && !can(profile, SECTION, ACTIONS.PUBLISH)) {
      data.active = false;
      UI().toast(T("wf_saved_unpublished"), "info");
    }

    const restore = busy(wrap.querySelector("[data-submit]"));
    try {
      if (spec?.id) {
        await updateSpecialization(spec.id, data);
        await logAction({
          action: "update",
          section: SECTION,
          entityId: spec.id,
          entityLabel: data.name.en || spec.id,
          before: spec,
          after: { ...spec, ...data },
        });
        UI().successToast(T("admin_updated_success"));
      } else {
        const newId = await createSpecialization(data);
        await logAction({
          action: "create",
          section: SECTION,
          entityId: newId,
          entityLabel: data.name.en || newId,
          after: data,
        });
        UI().successToast(T("admin_created_success"));
      }
      UI().closeModal();
      await loadAll();
    } catch (err) {
      console.error("[ICC Admin] Save specialization failed:", err);
      UI().errorToast(T("admin_error_generic"));
    } finally {
      restore();
    }
  });

  UI().openModal({
    title: spec?.id ? T("spec_form_title_edit") : T("spec_form_title_add"),
    bodyEl: wrap,
  });
}

/* ==================================================================== */
/* Row actions                                                          */
/* ==================================================================== */

async function handleDelete(spec) {
  const label = localName(spec);
  const choice = await confirmDeleteWithDependencies({
    section: SECTION,
    record: spec,
    label,
  });
  if (choice === "cancel") return;

  try {
    if (choice === "deactivate") {
      await updateSpecialization(spec.id, { active: false });
      await logAction({
        action: "deactivate",
        section: SECTION,
        entityId: spec.id,
        entityLabel: label,
        summary: T("dep_deactivated_instead"),
        before: { active: spec.active },
        after: { active: false },
      });
      UI().successToast(T("dep_deactivated_success"));
    } else {
      await deleteSpecialization(spec.id);
      await logAction({
        action: "delete",
        section: SECTION,
        entityId: spec.id,
        entityLabel: label,
        before: spec,
      });
      UI().successToast(T("admin_deleted_success"));
    }
    await loadAll();
  } catch (err) {
    console.error("[ICC Admin] Delete specialization failed:", err);
    UI().errorToast(T("admin_error_generic"));
  }
}

async function handleToggle(spec) {
  try {
    await updateSpecialization(spec.id, { active: !spec.active });
    await logAction({
      action: spec.active ? "deactivate" : "activate",
      section: SECTION,
      entityId: spec.id,
      entityLabel: localName(spec),
      before: { active: spec.active },
      after: { active: !spec.active },
    });
    UI().successToast(T("admin_status_updated_success"));
    await loadAll();
  } catch (err) {
    console.error("[ICC Admin] Toggle specialization failed:", err);
    UI().errorToast(T("admin_error_generic"));
  }
}

async function handleMove(spec, direction) {
  // Siblings = specializations of the same major. Reordering is scoped to
  // the branch, so moving one never disturbs another major's ordering.
  const siblings = allSpecializations.filter((s) => s.majorId === spec.majorId);
  try {
    const changed = await moveWithin(siblings, spec, direction, (updates) =>
      reorderDocs(COLLECTION, updates)
    );
    if (!changed) return;
    await logAction({
      action: "reorder",
      section: SECTION,
      entityId: spec.id,
      entityLabel: localName(spec),
      summary: T(direction === "up" ? "admin_move_up" : "admin_move_down"),
    });
    await loadAll();
  } catch (err) {
    console.error("[ICC Admin] Reorder specializations failed:", err);
    UI().errorToast(T("admin_error_generic"));
  }
}

function wireTable() {
  document.querySelector("[data-table-body]").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.closest("tr")?.getAttribute("data-id");
    const spec = allSpecializations.find((s) => s.id === id);
    if (!spec) return;

    switch (btn.getAttribute("data-action")) {
      case "edit":
        openForm(spec);
        break;
      case "delete":
        handleDelete(spec);
        break;
      case "toggle":
        handleToggle(spec);
        break;
      case "up":
        handleMove(spec, "up");
        break;
      case "down":
        handleMove(spec, "down");
        break;
    }
  });
}

function wireToolbar() {
  const addBtn = document.querySelector("[data-add-btn]");
  if (addBtn) {
    if (!can(profile, SECTION, ACTIONS.CREATE)) addBtn.hidden = true;
    else addBtn.addEventListener("click", () => openForm(null));
  }
  document.querySelector("[data-major-filter]")?.addEventListener("change", render);
  document.querySelector("[data-status-filter]")?.addEventListener("change", render);
  document.querySelector("[data-sort]")?.addEventListener("change", render);
  document.querySelector("[data-search]")?.addEventListener("input", render);
  document.querySelector("[data-clear-filters]")?.addEventListener("click", () => {
    const major = document.querySelector("[data-major-filter]");
    const status = document.querySelector("[data-status-filter]");
    const search = document.querySelector("[data-search]");
    if (major) major.value = "all";
    if (status) status.value = "all";
    if (search) search.value = "";
    render();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  protectAdminPage(SECTION, async (_user, adminProfile) => {
    profile = adminProfile;
    wireTable();
    wireToolbar();
    await loadAll();

    // Re-render (not reload) on language switch: the data is unchanged,
    // only the language the names resolve in.
    document.addEventListener("icc:languagechange", () => {
      populateMajorFilter();
      render();
    });

    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1" && can(profile, SECTION, ACTIONS.CREATE)) openForm(null);
    const presetMajor = params.get("majorId");
    if (presetMajor) {
      const select = document.querySelector("[data-major-filter]");
      if (select && allMajors.some((m) => m.id === presetMajor)) {
        select.value = presetMajor;
        render();
      }
    }
  });
});
