/**
 * semesters-admin.js — admin/semesters.html
 * -----------------------------------------------------------------------
 * PHASE 7 — Semesters, now positioned correctly in the hierarchy:
 *
 *     College → Major → Specialization → Academic Year → Semester → Course
 *
 * WHAT CHANGED, AND WHAT DELIBERATELY DID NOT
 *   A semester now carries `specializationId` and `academicYearId`
 *   alongside the `majorId` it always had. Both new fields are OPTIONAL at
 *   the data level and the screen renders an unset one as "—", because
 *   every semester created before this phase has neither. Refusing to
 *   display those records, or forcing an admin to fill the fields in
 *   before they could fix a typo, would have made the upgrade a migration
 *   project instead of an addition.
 *
 *   `yearNumber` is still written on every save, even when an academic
 *   year is chosen. It is the field the public pages and existing queries
 *   read, so keeping it in sync (rather than replacing it with a lookup)
 *   is what lets this change ship without touching the public site.
 *
 * VALIDATION
 *   Relationships are checked against the loaded data before the write,
 *   not after: a specialization must belong to the chosen major, and an
 *   academic year must be either shared or scoped to that same major and
 *   specialization. Firestore will happily store a semester pointing at a
 *   specialization from a different major — it has no foreign keys — and
 *   the result is a curriculum that renders half-empty with no error
 *   anywhere to explain why.
 * ------------------------------------------------------------------------
 */

import { protectAdminPage } from "./admin-guard.js";
import { logAction } from "./audit-log.js";
import {
  getMajors,
  getAllSpecializations,
  getAllAcademicYears,
  getAllSemesters,
  createSemester,
  updateSemester,
  deleteSemester,
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
const SECTION = "semesters";
const COLLECTION = "semesters";

let profile = null;
let allMajors = [];
let allSpecializations = [];
let allYears = [];
let allSemesters = [];

/* ==================================================================== */
/* Relationship helpers                                                 */
/* ==================================================================== */

function specializationsForMajor(majorId) {
  if (!majorId) return [];
  return allSpecializations.filter((s) => s.majorId === majorId).sort(byDisplayOrder);
}

/**
 * Academic years available for a major/specialization pair.
 *
 * Includes, in this order of generality:
 *   - shared years (no majorId) — usable anywhere;
 *   - years scoped to the major but not to any specialization;
 *   - years scoped to this exact specialization.
 *
 * The middle case is the important one: a major-wide "Second Year" applies
 * to every track inside that major, so excluding it when a specialization
 * is selected would force an admin to duplicate it per track.
 */
function yearsFor(majorId, specializationId) {
  return allYears
    .filter((y) => {
      if (y.majorId && majorId && y.majorId !== majorId) return false;
      if (y.majorId && !majorId) return false;
      if (y.specializationId && y.specializationId !== specializationId) return false;
      return true;
    })
    .sort(byDisplayOrder);
}

/* ==================================================================== */
/* Filtering + sorting                                                  */
/* ==================================================================== */

function currentFilters() {
  return {
    majorId: document.querySelector("[data-major-filter]")?.value || "all",
    specializationId: document.querySelector("[data-specialization-filter]")?.value || "all",
    yearId: document.querySelector("[data-year-filter]")?.value || "all",
    status: document.querySelector("[data-status-filter]")?.value || "all",
    search: (document.querySelector("[data-search]")?.value || "").trim().toLowerCase(),
  };
}

function isFiltered() {
  const f = currentFilters();
  return (
    f.majorId !== "all" ||
    f.specializationId !== "all" ||
    f.yearId !== "all" ||
    f.status !== "all" ||
    !!f.search
  );
}

function applyFilters(list) {
  const f = currentFilters();
  return list.filter((s) => {
    if (f.majorId !== "all" && s.majorId !== f.majorId) return false;
    // A semester with no specialization belongs to the whole major, so it
    // stays visible when narrowing to one track.
    if (f.specializationId !== "all" && s.specializationId && s.specializationId !== f.specializationId) {
      return false;
    }
    if (f.yearId !== "all" && s.academicYearId !== f.yearId) return false;
    if (f.status === "active" && !s.active) return false;
    if (f.status === "inactive" && s.active) return false;
    if (!f.search) return true;
    const hay = `${s.name?.en || ""} ${s.name?.ar || ""} ${s.yearNumber ?? ""} ${
      s.semesterNumber ?? ""
    } ${nameById(allMajors, s.majorId)}`.toLowerCase();
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
      return sorted.sort(
        (a, b) =>
          (a.yearNumber ?? 0) - (b.yearNumber ?? 0) ||
          (a.semesterNumber ?? 0) - (b.semesterNumber ?? 0)
      );
    case "name":
      return sorted.sort((a, b) => localName(a).localeCompare(localName(b), lang()));
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
      <td class="wrap">${escapeHTML(nameById(allMajors, s.majorId))}</td>
      <td class="wrap">${escapeHTML(
        s.specializationId ? nameById(allSpecializations, s.specializationId) : T("admin_whole_major")
      )}</td>
      <td class="wrap">${escapeHTML(
        s.academicYearId ? nameById(allYears, s.academicYearId) : "—"
      )}</td>
      <td>${s.yearNumber ?? "—"}</td>
      <td>${s.semesterNumber ?? "—"}</td>
      <td class="wrap">${escapeHTML(localName(s))}</td>
      <td>${statusBadgeHTML(s)}</td>
      <td>${actionsCellHTML(profile, SECTION, s)}</td>
    </tr>`;
}

function render() {
  const rows = applySort(applyFilters(allSemesters));
  renderRows({
    rows,
    rowHTML,
    filtered: isFiltered(),
    emptyTitleKey: "admin_empty_title",
    emptyBodyKey: "admin_empty_body",
  });
}

/** Cascading toolbar filters: major → specialization → academic year. */
function populateFilters() {
  const majorSelect = document.querySelector("[data-major-filter]");
  const specSelect = document.querySelector("[data-specialization-filter]");
  const yearSelect = document.querySelector("[data-year-filter]");
  if (!majorSelect) return;

  const currentMajor = majorSelect.value || "all";
  majorSelect.innerHTML =
    `<option value="all">${T("admin_filter_all_majors")}</option>` +
    allMajors.map((m) => `<option value="${escapeHTML(m.id)}">${escapeHTML(localName(m))}</option>`).join("");
  majorSelect.value =
    currentMajor === "all" || allMajors.some((m) => m.id === currentMajor) ? currentMajor : "all";

  if (specSelect) {
    const currentSpec = specSelect.value || "all";
    const scoped = currentMajor === "all" ? allSpecializations : specializationsForMajor(currentMajor);
    specSelect.innerHTML =
      `<option value="all">${T("admin_filter_all_specializations")}</option>` +
      scoped.map((s) => `<option value="${escapeHTML(s.id)}">${escapeHTML(localName(s))}</option>`).join("");
    specSelect.value = scoped.some((s) => s.id === currentSpec) ? currentSpec : "all";
    specSelect.disabled = scoped.length === 0;
  }

  if (yearSelect) {
    const currentYear = yearSelect.value || "all";
    const specValue = specSelect && specSelect.value !== "all" ? specSelect.value : "";
    const scoped =
      currentMajor === "all" ? allYears : yearsFor(currentMajor, specValue);
    yearSelect.innerHTML =
      `<option value="all">${T("admin_filter_all_years")}</option>` +
      scoped.map((y) => `<option value="${escapeHTML(y.id)}">${escapeHTML(localName(y))}</option>`).join("");
    yearSelect.value = scoped.some((y) => y.id === currentYear) ? currentYear : "all";
    yearSelect.disabled = scoped.length === 0;
  }
}

async function loadAll() {
  showLoading();
  try {
    const [majors, specializations, years, semesters] = await Promise.all([
      getMajors(),
      getAllSpecializations(),
      getAllAcademicYears(),
      getAllSemesters(),
    ]);
    allMajors = filterOwned(profile, "majors", majors);
    allSpecializations = filterOwned(profile, "specializations", specializations);
    allYears = filterOwnedKeepingShared(profile, "academicYears", years);
    allSemesters = filterOwned(profile, SECTION, semesters);
    populateFilters();
    render();
  } catch (err) {
    console.error("[ICC Admin] Failed to load semesters:", err);
    showError();
  }
}

/* ==================================================================== */
/* Form                                                                 */
/* ==================================================================== */

function formHTML(sem) {
  const s = sem || {};
  return `
    <form data-semester-form class="admin-form" novalidate>
      <div class="form-field" data-field="majorId">
        <label>${T("admin_field_major")} *</label>
        <select name="majorId" required data-major-select>${optionsHTML(allMajors, s.majorId, "—")}</select>
        <p class="form-field__error">${T("admin_field_required")}</p>
      </div>

      <div class="admin-form__row">
        <div class="form-field" data-field="specializationId">
          <label>${T("admin_field_specialization")}</label>
          <select name="specializationId" data-specialization-select></select>
          <p class="form-field__error"></p>
          <p class="hint">${T("sem_specialization_hint")}</p>
        </div>
        <div class="form-field" data-field="academicYearId">
          <label>${T("admin_field_academic_year")}</label>
          <select name="academicYearId" data-year-select></select>
          <p class="form-field__error"></p>
          <p class="hint">${T("sem_year_hint")}</p>
        </div>
      </div>

      <div class="admin-form__row">
        <div class="form-field" data-field="yearNumber">
          <label>${T("admin_field_year_number")} *</label>
          <input type="number" name="yearNumber" min="1" max="12" value="${s.yearNumber ?? 1}" required>
          <p class="form-field__error">${T("admin_field_required")}</p>
        </div>
        <div class="form-field" data-field="semesterNumber">
          <label>${T("admin_field_semester_number")} *</label>
          <input type="number" name="semesterNumber" min="1" max="6" value="${s.semesterNumber ?? 1}" required>
          <p class="form-field__error">${T("admin_field_required")}</p>
        </div>
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

      <div class="admin-form__row">
        <div class="form-field">
          <label>${T("admin_field_year_label_en")}</label>
          <input type="text" name="yearLabel_en" value="${escapeHTML(s.yearLabel?.en || "")}">
        </div>
        <div class="form-field">
          <label>${T("admin_field_year_label_ar")}</label>
          <input type="text" name="yearLabel_ar" dir="rtl" value="${escapeHTML(s.yearLabel?.ar || "")}">
        </div>
      </div>

      <div class="admin-form__row">
        <div class="form-field">
          <label>${T("admin_field_display_order")}</label>
          <input type="number" name="displayOrder" value="${s.displayOrder ?? allSemesters.length}">
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

/**
 * Major → Specialization → Academic Year, refreshed downward.
 *
 * Changing a level clears the levels below it rather than trying to keep
 * them: a specialization from the previous major is not a value worth
 * preserving, and silently keeping it is exactly how a mismatched pairing
 * gets saved. On first render the existing record's values are restored so
 * opening an edit form doesn't wipe what's already stored.
 *
 * Selecting an academic year also fills in yearNumber, keeping the
 * denormalized field the public site reads in step with the relationship.
 */
function wireCascade(form, sem) {
  const majorSelect = form.querySelector("[data-major-select]");
  const specSelect = form.querySelector("[data-specialization-select]");
  const yearSelect = form.querySelector("[data-year-select]");
  const yearNumberInput = form.querySelector('[name="yearNumber"]');
  let first = true;

  function refreshSpecializations() {
    const scoped = specializationsForMajor(majorSelect.value);
    specSelect.innerHTML = optionsHTML(scoped, first ? sem?.specializationId || "" : "", T("admin_whole_major"));
    specSelect.disabled = scoped.length === 0;
  }

  function refreshYears() {
    const scoped = yearsFor(majorSelect.value, specSelect.value || "");
    yearSelect.innerHTML = optionsHTML(scoped, first ? sem?.academicYearId || "" : "", T("admin_no_year"));
    yearSelect.disabled = scoped.length === 0;
  }

  majorSelect.addEventListener("change", () => {
    first = false;
    refreshSpecializations();
    refreshYears();
  });

  specSelect.addEventListener("change", () => {
    first = false;
    refreshYears();
  });

  yearSelect.addEventListener("change", () => {
    const year = allYears.find((y) => y.id === yearSelect.value);
    if (year && year.yearNumber && yearNumberInput) yearNumberInput.value = year.yearNumber;
  });

  refreshSpecializations();
  refreshYears();
  first = false;
}

function readForm(form) {
  const fd = new FormData(form);
  return {
    majorId: (fd.get("majorId") || "").toString(),
    specializationId: (fd.get("specializationId") || "").toString(),
    academicYearId: (fd.get("academicYearId") || "").toString(),
    yearNumber: Number(fd.get("yearNumber")) || 1,
    semesterNumber: Number(fd.get("semesterNumber")) || 1,
    name: readBilingual(fd, "name"),
    yearLabel: readBilingual(fd, "yearLabel"),
    displayOrder: Number(fd.get("displayOrder")) || 0,
    active: fd.get("active") === "on",
  };
}

/**
 * Relationship validation — the part that protects the data rather than
 * the form. Each check answers "could this record exist in the hierarchy
 * as described?", and a failure points at the specific field to fix.
 */
function validate(form, data, editingId) {
  if (!requireFields(form, [
    ["majorId", "majorId"],
    ["yearNumber", "yearNumber"],
    ["semesterNumber", "semesterNumber"],
    ["name_en", "name_en"],
    ["name_ar", "name_ar"],
  ])) {
    return false;
  }

  if (!allMajors.some((m) => m.id === data.majorId)) {
    return fieldError(form, "majorId", "err_major_missing");
  }

  if (!ownsRecord(profile, SECTION, data, { majors: data.majorId })) {
    return fieldError(form, "majorId", "err_not_owner_target");
  }

  if (data.specializationId) {
    const spec = allSpecializations.find((s) => s.id === data.specializationId);
    if (!spec) return fieldError(form, "specializationId", "err_specialization_missing");
    if (spec.majorId !== data.majorId) {
      return fieldError(form, "specializationId", "err_specialization_major_mismatch");
    }
  }

  if (data.academicYearId) {
    const year = allYears.find((y) => y.id === data.academicYearId);
    if (!year) return fieldError(form, "academicYearId", "err_year_missing");
    if (year.majorId && year.majorId !== data.majorId) {
      return fieldError(form, "academicYearId", "err_year_major_mismatch");
    }
    if (year.specializationId && year.specializationId !== data.specializationId) {
      return fieldError(form, "academicYearId", "err_year_specialization_mismatch");
    }
  }

  // Same major, same track, same year, same semester number = a duplicate.
  const clash = allSemesters.some(
    (s) =>
      s.id !== editingId &&
      s.majorId === data.majorId &&
      (s.specializationId || "") === data.specializationId &&
      (s.yearNumber ?? 0) === data.yearNumber &&
      (s.semesterNumber ?? 0) === data.semesterNumber
  );
  if (clash) return fieldError(form, "semesterNumber", "err_semester_duplicate");

  return true;
}

function openForm(sem) {
  if (!allMajors.length) {
    UI().errorToast(T("err_no_majors_yet"));
    return;
  }

  const wrap = document.createElement("div");
  wrap.innerHTML = formHTML(sem);
  const form = wrap.querySelector("[data-semester-form]");
  wireCascade(form, sem);
  wrap.querySelector("[data-cancel]").addEventListener("click", () => UI().closeModal());

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = readForm(form);
    if (!validate(form, data, sem?.id)) return;

    if (data.active && !can(profile, SECTION, ACTIONS.PUBLISH)) {
      data.active = false;
      UI().toast(T("wf_saved_unpublished"), "info");
    }

    const restore = busy(wrap.querySelector("[data-submit]"));
    try {
      if (sem?.id) {
        await updateSemester(sem.id, data);
        await logAction({
          action: "update",
          section: SECTION,
          entityId: sem.id,
          entityLabel: data.name.en || sem.name?.en || sem.id,
          before: sem,
          after: { ...sem, ...data },
        });
        UI().successToast(T("admin_updated_success"));
      } else {
        const newId = await createSemester(data);
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
      console.error("[ICC Admin] Save semester failed:", err);
      UI().errorToast(T("admin_error_generic"));
    } finally {
      restore();
    }
  });

  UI().openModal({
    title: sem?.id ? T("admin_semester_form_title_edit") : T("admin_semester_form_title_add"),
    bodyEl: wrap,
  });
}

/* ==================================================================== */
/* Row actions                                                          */
/* ==================================================================== */

async function handleDelete(sem) {
  const label = localName(sem);
  const choice = await confirmDeleteWithDependencies({ section: SECTION, record: sem, label });
  if (choice === "cancel") return;

  try {
    if (choice === "deactivate") {
      await updateSemester(sem.id, { active: false });
      await logAction({
        action: "deactivate",
        section: SECTION,
        entityId: sem.id,
        entityLabel: label,
        summary: T("dep_deactivated_instead"),
        before: { active: sem.active },
        after: { active: false },
      });
      UI().successToast(T("dep_deactivated_success"));
    } else {
      await deleteSemester(sem.id);
      await logAction({
        action: "delete",
        section: SECTION,
        entityId: sem.id,
        entityLabel: label,
        before: sem,
      });
      UI().successToast(T("admin_deleted_success"));
    }
    await loadAll();
  } catch (err) {
    console.error("[ICC Admin] Delete semester failed:", err);
    UI().errorToast(T("admin_error_generic"));
  }
}

async function handleToggle(sem) {
  try {
    await updateSemester(sem.id, { active: !sem.active });
    await logAction({
      action: sem.active ? "deactivate" : "activate",
      section: SECTION,
      entityId: sem.id,
      entityLabel: localName(sem),
      before: { active: sem.active },
      after: { active: !sem.active },
    });
    UI().successToast(T("admin_status_updated_success"));
    await loadAll();
  } catch (err) {
    console.error("[ICC Admin] Toggle semester failed:", err);
    UI().errorToast(T("admin_error_generic"));
  }
}

async function handleMove(sem, direction) {
  const siblings = allSemesters.filter(
    (s) =>
      s.majorId === sem.majorId &&
      (s.specializationId || "") === (sem.specializationId || "")
  );
  try {
    const changed = await moveWithin(siblings, sem, direction, (updates) =>
      reorderDocs(COLLECTION, updates)
    );
    if (!changed) return;
    await logAction({
      action: "reorder",
      section: SECTION,
      entityId: sem.id,
      entityLabel: localName(sem),
      summary: T(direction === "up" ? "admin_move_up" : "admin_move_down"),
    });
    await loadAll();
  } catch (err) {
    console.error("[ICC Admin] Reorder semesters failed:", err);
    UI().errorToast(T("admin_error_generic"));
  }
}

function wireTable() {
  document.querySelector("[data-table-body]").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.closest("tr")?.getAttribute("data-id");
    const sem = allSemesters.find((s) => s.id === id);
    if (!sem) return;

    switch (btn.getAttribute("data-action")) {
      case "edit": openForm(sem); break;
      case "delete": handleDelete(sem); break;
      case "toggle": handleToggle(sem); break;
      case "up": handleMove(sem, "up"); break;
      case "down": handleMove(sem, "down"); break;
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
  document.querySelector("[data-specialization-filter]")?.addEventListener("change", () => {
    populateFilters();
    render();
  });
  document.querySelector("[data-year-filter]")?.addEventListener("change", render);
  document.querySelector("[data-status-filter]")?.addEventListener("change", render);
  document.querySelector("[data-sort]")?.addEventListener("change", render);
  document.querySelector("[data-search]")?.addEventListener("input", render);
  document.querySelector("[data-clear-filters]")?.addEventListener("click", () => {
    ["[data-major-filter]", "[data-specialization-filter]", "[data-year-filter]", "[data-status-filter]"]
      .forEach((sel) => {
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
