/**
 * academic-years-admin.js — admin/academic-years.html
 * -----------------------------------------------------------------------
 * PHASE 7 — CRUD for the academic-year level.
 *
 * WHY THIS IS A COLLECTION AND NOT JUST A NUMBER
 *   Until now "year" was the integer `yearNumber` on each semester. That
 *   works until you need the year to carry anything of its own: a bilingual
 *   name ("Third Year" / "السنة الثالثة"), an ordering that differs from
 *   the raw number, or the ability to retire a year without touching every
 *   semester inside it. So years are documents now.
 *
 *   `semester.yearNumber` is still written alongside `academicYearId`.
 *   Every query and public page that reads yearNumber keeps working, and a
 *   semester created before this collection existed still resolves — it
 *   simply has no academicYearId yet, which the screens render as "—"
 *   rather than as an error.
 *
 * SCOPING
 *   A year may be scoped to a major, and optionally to a specialization
 *   within it. Leaving the major blank makes it a SHARED year usable by
 *   any major — the common case for a university that runs the same
 *   four-year shape across every programme, where duplicating "First Year"
 *   once per major would be four records saying the same thing.
 * ------------------------------------------------------------------------
 */

import { protectAdminPage } from "./admin-guard.js";
import { logAction } from "./audit-log.js";
import {
  getMajors,
  getAllSpecializations,
  getAllAcademicYears,
  createAcademicYear,
  updateAcademicYear,
  deleteAcademicYear,
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
  filterOwnedKeepingShared,
  confirmDeleteWithDependencies,
  readBilingual,
  requireFields,
  fieldError,
  busy,
} from "./academic-shared.js";

const UI = () => window.ICC_ADMIN_UI;
const SECTION = "academicYears";
const COLLECTION = "academicYears";

let profile = null;
let allMajors = [];
let allSpecializations = [];
let allYears = [];

/** Specializations belonging to one major, in curriculum order. */
function specializationsForMajor(majorId) {
  if (!majorId) return [];
  return allSpecializations.filter((s) => s.majorId === majorId).sort(byDisplayOrder);
}

/* ==================================================================== */
/* Filtering + sorting                                                  */
/* ==================================================================== */

function currentFilters() {
  return {
    majorId: document.querySelector("[data-major-filter]")?.value || "all",
    specializationId: document.querySelector("[data-specialization-filter]")?.value || "all",
    status: document.querySelector("[data-status-filter]")?.value || "all",
    search: (document.querySelector("[data-search]")?.value || "").trim().toLowerCase(),
  };
}

function isFiltered() {
  const f = currentFilters();
  return (
    f.majorId !== "all" || f.specializationId !== "all" || f.status !== "all" || !!f.search
  );
}

function applyFilters(list) {
  const f = currentFilters();
  return list.filter((y) => {
    // A year with no majorId is shared across every major, so it stays
    // visible when filtering to one — hiding it would make that major's
    // curriculum look like it has no years at all.
    if (f.majorId !== "all" && y.majorId && y.majorId !== f.majorId) return false;
    if (f.specializationId !== "all" && y.specializationId && y.specializationId !== f.specializationId) {
      return false;
    }
    if (f.status === "active" && !y.active) return false;
    if (f.status === "inactive" && y.active) return false;
    if (!f.search) return true;
    const hay = `${y.name?.en || ""} ${y.name?.ar || ""} ${y.yearNumber ?? ""}`.toLowerCase();
    return hay.includes(f.search);
  });
}

function currentSort() {
  return document.querySelector("[data-sort]")?.value || "order";
}

function applySort(list) {
  const sorted = [...list];
  switch (currentSort()) {
    case "year":
      return sorted.sort((a, b) => (a.yearNumber ?? 0) - (b.yearNumber ?? 0));
    case "name":
      return sorted.sort((a, b) => localName(a).localeCompare(localName(b), lang()));
    default:
      return sorted.sort(byDisplayOrder);
  }
}

/* ==================================================================== */
/* Rendering                                                            */
/* ==================================================================== */

function rowHTML(y, index, list) {
  const reorderable = currentSort() === "order" && can(profile, SECTION, ACTIONS.EDIT);
  return `
    <tr data-id="${escapeHTML(y.id)}">
      <td>${reorderable ? orderCellHTML(y, index, list) : `<span class="admin-order-cell__num">${y.displayOrder ?? "—"}</span>`}</td>
      <td class="wrap">${escapeHTML(localName(y))}</td>
      <td>${y.yearNumber ?? "—"}</td>
      <td class="wrap">${escapeHTML(y.majorId ? nameById(allMajors, y.majorId) : T("admin_shared_all_majors"))}</td>
      <td class="wrap">${escapeHTML(
        y.specializationId ? nameById(allSpecializations, y.specializationId) : T("admin_whole_major")
      )}</td>
      <td>${statusBadgeHTML(y)}</td>
      <td>${actionsCellHTML(profile, SECTION, y)}</td>
    </tr>`;
}

function render() {
  const rows = applySort(applyFilters(allYears));
  renderRows({
    rows,
    rowHTML,
    filtered: isFiltered(),
    emptyTitleKey: "year_empty_title",
    emptyBodyKey: "year_empty_body",
  });
}

/**
 * The specialization filter only ever offers specializations of the major
 * currently filtered to. Listing every specialization in the institution
 * would let an admin pick a combination that cannot match any record.
 */
function populateFilters() {
  const majorSelect = document.querySelector("[data-major-filter]");
  const specSelect = document.querySelector("[data-specialization-filter]");
  if (!majorSelect || !specSelect) return;

  const currentMajor = majorSelect.value || "all";
  majorSelect.innerHTML =
    `<option value="all">${T("admin_filter_all_majors")}</option>` +
    allMajors.map((m) => `<option value="${escapeHTML(m.id)}">${escapeHTML(localName(m))}</option>`).join("");
  majorSelect.value = currentMajor === "all" || allMajors.some((m) => m.id === currentMajor) ? currentMajor : "all";

  const currentSpec = specSelect.value || "all";
  const scoped = currentMajor === "all" ? allSpecializations : specializationsForMajor(currentMajor);
  specSelect.innerHTML =
    `<option value="all">${T("admin_filter_all_specializations")}</option>` +
    scoped.map((s) => `<option value="${escapeHTML(s.id)}">${escapeHTML(localName(s))}</option>`).join("");
  specSelect.value = scoped.some((s) => s.id === currentSpec) ? currentSpec : "all";
  specSelect.disabled = scoped.length === 0;
}

async function loadAll() {
  showLoading();
  try {
    const [majors, specializations, years] = await Promise.all([
      getMajors(),
      getAllSpecializations(),
      getAllAcademicYears(),
    ]);
    allMajors = filterOwned(profile, "majors", majors);
    allSpecializations = filterOwned(profile, "specializations", specializations);
    allYears = filterOwnedKeepingShared(profile, SECTION, years);
    populateFilters();
    render();
  } catch (err) {
    console.error("[ICC Admin] Failed to load academic years:", err);
    showError();
  }
}

/* ==================================================================== */
/* Form                                                                 */
/* ==================================================================== */

function formHTML(year) {
  const y = year || {};
  return `
    <form data-year-form class="admin-form" novalidate>
      <div class="admin-form__row">
        <div class="form-field">
          <label>${T("admin_field_major")}</label>
          <select name="majorId" data-major-select>
            ${optionsHTML(allMajors, y.majorId || "", T("admin_shared_all_majors"))}
          </select>
          <p class="hint">${T("year_major_hint")}</p>
        </div>
        <div class="form-field">
          <label>${T("admin_field_specialization")}</label>
          <select name="specializationId" data-specialization-select></select>
          <p class="hint">${T("year_specialization_hint")}</p>
        </div>
      </div>

      <div class="admin-form__row">
        <div class="form-field" data-field="name_en">
          <label>${T("admin_field_name_en")} *</label>
          <input type="text" name="name_en" value="${escapeHTML(y.name?.en || "")}" required>
          <p class="form-field__error">${T("admin_field_required")}</p>
        </div>
        <div class="form-field" data-field="name_ar">
          <label>${T("admin_field_name_ar")} *</label>
          <input type="text" name="name_ar" dir="rtl" value="${escapeHTML(y.name?.ar || "")}" required>
          <p class="form-field__error">${T("admin_field_required")}</p>
        </div>
      </div>

      <div class="admin-form__row">
        <div class="form-field" data-field="yearNumber">
          <label>${T("admin_field_year_number")} *</label>
          <input type="number" name="yearNumber" min="1" max="12" value="${y.yearNumber ?? 1}" required>
          <p class="form-field__error">${T("admin_field_required")}</p>
        </div>
        <div class="form-field">
          <label>${T("admin_field_display_order")}</label>
          <input type="number" name="displayOrder" value="${y.displayOrder ?? allYears.length}">
        </div>
      </div>

      <div class="form-field">
        <span class="form-check">
          <input type="checkbox" name="active" ${y.active ? "checked" : ""}>
          <label>${T("admin_field_active")}</label>
        </span>
      </div>

      <div class="admin-form__actions">
        <button type="button" class="btn btn--outline" data-cancel>${T("admin_cancel")}</button>
        <button type="submit" class="btn btn--primary" data-submit>${T("admin_save")}</button>
      </div>
    </form>`;
}

/**
 * Keep the specialization select honest: it lists only specializations of
 * the selected major, and resets to "whole major" whenever the major
 * changes, because a specialization from the previous major would be an
 * invalid pairing the moment it was saved.
 */
function wireCascade(form, preselectedSpecId) {
  const majorSelect = form.querySelector("[data-major-select]");
  const specSelect = form.querySelector("[data-specialization-select]");
  let first = true;

  function refresh() {
    const scoped = specializationsForMajor(majorSelect.value);
    const keep = first ? preselectedSpecId : "";
    specSelect.innerHTML = optionsHTML(scoped, keep || "", T("admin_whole_major"));
    specSelect.disabled = scoped.length === 0;
    first = false;
  }

  majorSelect.addEventListener("change", refresh);
  refresh();
}

function readForm(form) {
  const fd = new FormData(form);
  return {
    majorId: (fd.get("majorId") || "").toString(),
    specializationId: (fd.get("specializationId") || "").toString(),
    name: readBilingual(fd, "name"),
    yearNumber: Number(fd.get("yearNumber")) || 1,
    displayOrder: Number(fd.get("displayOrder")) || 0,
    active: fd.get("active") === "on",
  };
}

function validate(form, data, editingId) {
  if (!requireFields(form, [
    ["name_en", "name_en"],
    ["name_ar", "name_ar"],
    ["yearNumber", "yearNumber"],
  ])) {
    return false;
  }

  // Relationship integrity: a specialization must belong to the chosen
  // major, or the record would claim a pairing that does not exist.
  if (data.specializationId) {
    const spec = allSpecializations.find((s) => s.id === data.specializationId);
    if (!spec) return fieldError(form, "name_en", "err_specialization_missing");
    if (spec.majorId !== data.majorId) {
      return fieldError(form, "name_en", "err_specialization_major_mismatch");
    }
  }

  if (data.majorId && !ownsRecord(profile, SECTION, data, { majors: data.majorId })) {
    return fieldError(form, "name_en", "err_not_owner_target");
  }

  // Two years numbered 3 in the same scope is almost always a typo, and
  // it makes "Year 3" ambiguous everywhere downstream.
  const clash = allYears.some(
    (y) =>
      y.id !== editingId &&
      y.yearNumber === data.yearNumber &&
      (y.majorId || "") === data.majorId &&
      (y.specializationId || "") === data.specializationId
  );
  if (clash) return fieldError(form, "yearNumber", "err_year_duplicate");

  return true;
}

function openForm(year) {
  const wrap = document.createElement("div");
  wrap.innerHTML = formHTML(year);
  const form = wrap.querySelector("[data-year-form]");
  wireCascade(form, year?.specializationId || "");
  wrap.querySelector("[data-cancel]").addEventListener("click", () => UI().closeModal());

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = readForm(form);
    if (!validate(form, data, year?.id)) return;

    if (data.active && !can(profile, SECTION, ACTIONS.PUBLISH)) {
      data.active = false;
      UI().toast(T("wf_saved_unpublished"), "info");
    }

    const restore = busy(wrap.querySelector("[data-submit]"));
    try {
      if (year?.id) {
        await updateAcademicYear(year.id, data);
        await logAction({
          action: "update",
          section: SECTION,
          entityId: year.id,
          entityLabel: data.name.en || year.id,
          before: year,
          after: { ...year, ...data },
        });
        UI().successToast(T("admin_updated_success"));
      } else {
        const newId = await createAcademicYear(data);
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
      console.error("[ICC Admin] Save academic year failed:", err);
      UI().errorToast(T("admin_error_generic"));
    } finally {
      restore();
    }
  });

  UI().openModal({
    title: year?.id ? T("year_form_title_edit") : T("year_form_title_add"),
    bodyEl: wrap,
  });
}

/* ==================================================================== */
/* Row actions                                                          */
/* ==================================================================== */

async function handleDelete(year) {
  const label = localName(year);
  const choice = await confirmDeleteWithDependencies({ section: SECTION, record: year, label });
  if (choice === "cancel") return;

  try {
    if (choice === "deactivate") {
      await updateAcademicYear(year.id, { active: false });
      await logAction({
        action: "deactivate",
        section: SECTION,
        entityId: year.id,
        entityLabel: label,
        summary: T("dep_deactivated_instead"),
        before: { active: year.active },
        after: { active: false },
      });
      UI().successToast(T("dep_deactivated_success"));
    } else {
      await deleteAcademicYear(year.id);
      await logAction({
        action: "delete",
        section: SECTION,
        entityId: year.id,
        entityLabel: label,
        before: year,
      });
      UI().successToast(T("admin_deleted_success"));
    }
    await loadAll();
  } catch (err) {
    console.error("[ICC Admin] Delete academic year failed:", err);
    UI().errorToast(T("admin_error_generic"));
  }
}

async function handleToggle(year) {
  try {
    await updateAcademicYear(year.id, { active: !year.active });
    await logAction({
      action: year.active ? "deactivate" : "activate",
      section: SECTION,
      entityId: year.id,
      entityLabel: localName(year),
      before: { active: year.active },
      after: { active: !year.active },
    });
    UI().successToast(T("admin_status_updated_success"));
    await loadAll();
  } catch (err) {
    console.error("[ICC Admin] Toggle academic year failed:", err);
    UI().errorToast(T("admin_error_generic"));
  }
}

async function handleMove(year, direction) {
  const siblings = allYears.filter(
    (y) => (y.majorId || "") === (year.majorId || "") &&
           (y.specializationId || "") === (year.specializationId || "")
  );
  try {
    const changed = await moveWithin(siblings, year, direction, (updates) =>
      reorderDocs(COLLECTION, updates)
    );
    if (!changed) return;
    await logAction({
      action: "reorder",
      section: SECTION,
      entityId: year.id,
      entityLabel: localName(year),
      summary: T(direction === "up" ? "admin_move_up" : "admin_move_down"),
    });
    await loadAll();
  } catch (err) {
    console.error("[ICC Admin] Reorder academic years failed:", err);
    UI().errorToast(T("admin_error_generic"));
  }
}

function wireTable() {
  document.querySelector("[data-table-body]").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.closest("tr")?.getAttribute("data-id");
    const year = allYears.find((y) => y.id === id);
    if (!year) return;

    switch (btn.getAttribute("data-action")) {
      case "edit": openForm(year); break;
      case "delete": handleDelete(year); break;
      case "toggle": handleToggle(year); break;
      case "up": handleMove(year, "up"); break;
      case "down": handleMove(year, "down"); break;
    }
  });
}

function wireToolbar() {
  const addBtn = document.querySelector("[data-add-btn]");
  if (addBtn) {
    if (!can(profile, SECTION, ACTIONS.CREATE)) addBtn.hidden = true;
    else addBtn.addEventListener("click", () => openForm(null));
  }
  document.querySelector("[data-major-filter]")?.addEventListener("change", () => {
    populateFilters();
    render();
  });
  document.querySelector("[data-specialization-filter]")?.addEventListener("change", render);
  document.querySelector("[data-status-filter]")?.addEventListener("change", render);
  document.querySelector("[data-sort]")?.addEventListener("change", render);
  document.querySelector("[data-search]")?.addEventListener("input", render);
  document.querySelector("[data-clear-filters]")?.addEventListener("click", () => {
    ["[data-major-filter]", "[data-specialization-filter]", "[data-status-filter]"].forEach((sel) => {
      const el = document.querySelector(sel);
      if (el) el.value = "all";
    });
    const search = document.querySelector("[data-search]");
    if (search) search.value = "";
    populateFilters();
    render();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  protectAdminPage(SECTION, async (_user, adminProfile) => {
    profile = adminProfile;
    wireTable();
    wireToolbar();
    await loadAll();

    document.addEventListener("icc:languagechange", () => {
      populateFilters();
      render();
    });

    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1" && can(profile, SECTION, ACTIONS.CREATE)) openForm(null);
  });
});
