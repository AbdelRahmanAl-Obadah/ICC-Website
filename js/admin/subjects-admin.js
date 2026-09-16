/**
 * subjects-admin.js — admin/subjects.html
 * -----------------------------------------------------------------------
 * PHASE 7 — Courses / Subjects, placed correctly in the hierarchy and
 * given real prerequisite relationships.
 *
 *     College → Major → Specialization → Academic Year → Semester → Course
 *
 * ==========================================================================
 * CASCADING SELECTION
 * ==========================================================================
 * The form narrows downward: choosing a major filters the specializations,
 * which filters the academic years, which filters the semesters. The
 * semester list is the point of the exercise — an admin should never be
 * offered a semester belonging to a different major, because picking one
 * produces a course that exists in the database but appears nowhere on the
 * site, and nothing errors to say so.
 *
 * Every relationship is then re-validated at save time against the loaded
 * data, not merely trusted from the dropdown: a form left open while
 * another admin deleted a semester would otherwise write a dangling id.
 *
 * ==========================================================================
 * PREREQUISITES — TEXT AND STRUCTURE, TOGETHER
 * ==========================================================================
 * Prerequisites used to be free text ("CS116 or equivalent"). That text is
 * untouched and still saved, because it carries nuance no id can:
 * "concurrent enrolment permitted", "department approval". Alongside it,
 * `prerequisiteIds` now holds actual course ids, which is what makes the
 * relationship queryable — so the panel can answer "what breaks if I
 * delete this course?" with a list rather than a shrug.
 *
 * Three integrity rules are enforced before any write:
 *   1. Every id must resolve to a course that still exists.
 *   2. A course may not be its own prerequisite.
 *   3. A prerequisite chain may not form a cycle. A → B → C → A is not a
 *      curriculum; it is a set of courses no student can ever start, and
 *      it is easy to create one edit at a time without noticing.
 *
 * Rule 3 is checked with a walk over the whole prerequisite graph
 * (see wouldCreateCycle) rather than a one-step "is B already a prereq of
 * A" check, because cycles that matter are usually indirect.
 * ------------------------------------------------------------------------
 */

import { protectAdminPage } from "./admin-guard.js";
import { logAction } from "./audit-log.js";
import {
  getMajors,
  getAllSpecializations,
  getAllAcademicYears,
  getAllSemesters,
  getAllSubjects,
  createSubject,
  updateSubject,
  deleteSubject,
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
const SECTION = "subjects";
const COLLECTION = "subjects";

/**
 * Requirement categories, matching the Requirements screen's own list so
 * a course and a requirement describing the same thing are labelled the
 * same way across the panel.
 */
const REQUIREMENT_TYPES = [
  { key: "university", labelKey: "req_type_university" },
  { key: "college", labelKey: "req_type_college" },
  { key: "major", labelKey: "req_type_major" },
  { key: "free-elective", labelKey: "req_type_free_elective" },
  { key: "other", labelKey: "req_type_other" },
];

let profile = null;
let allMajors = [];
let allSpecializations = [];
let allYears = [];
let allSemesters = [];
let allSubjects = [];

/* ==================================================================== */
/* Relationship helpers                                                 */
/* ==================================================================== */

function specializationsForMajor(majorId) {
  if (!majorId) return [];
  return allSpecializations.filter((s) => s.majorId === majorId).sort(byDisplayOrder);
}

/** Years usable for a major/specialization pair — see semesters-admin.js. */
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

/**
 * The semesters a course may legitimately be placed in.
 *
 * Major must match exactly. Specialization matches when the semester has
 * none (it belongs to the whole major, so every track's courses can sit in
 * it) or when it is the same one. Academic year, when given, must match.
 */
function semestersFor(majorId, specializationId, academicYearId) {
  if (!majorId) return [];
  return allSemesters
    .filter((s) => {
      if (s.majorId !== majorId) return false;
      if (s.specializationId && specializationId && s.specializationId !== specializationId) return false;
      if (s.specializationId && !specializationId) return false;
      if (academicYearId && s.academicYearId && s.academicYearId !== academicYearId) return false;
      return true;
    })
    .sort(byDisplayOrder);
}

function subjectLabel(subject) {
  if (!subject) return "—";
  const code = subject.code ? `${subject.code} — ` : "";
  return `${code}${localName(subject)}`;
}

/* ==================================================================== */
/* Prerequisite graph                                                   */
/* ==================================================================== */

/** The stored prerequisite ids of a course, always as a clean array. */
function prereqIdsOf(subject) {
  return Array.isArray(subject?.prerequisiteIds)
    ? subject.prerequisiteIds.filter((id) => typeof id === "string" && id)
    : [];
}

/**
 * Would giving `subjectId` these prerequisites create a cycle?
 *
 * Walks the existing graph from each proposed prerequisite: if the course
 * being edited is reachable from any of them, then adding that edge closes
 * a loop. `pendingId` may be null for a course that doesn't exist yet — a
 * new course can't be reachable from anything, so it can't close a cycle.
 */
function wouldCreateCycle(subjectId, proposedPrereqIds) {
  if (!subjectId) return null;

  const graph = new Map();
  allSubjects.forEach((s) => graph.set(s.id, prereqIdsOf(s)));
  graph.set(subjectId, proposedPrereqIds);

  const seen = new Set();
  const stack = [...proposedPrereqIds];

  while (stack.length) {
    const current = stack.pop();
    if (current === subjectId) return current;
    if (seen.has(current)) continue;
    seen.add(current);
    (graph.get(current) || []).forEach((next) => stack.push(next));
  }
  return null;
}

/** Courses that name this one as a prerequisite, resolved client-side. */
function dependentsOf(subjectId) {
  return allSubjects.filter((s) => prereqIdsOf(s).includes(subjectId));
}

/* ==================================================================== */
/* Filtering + sorting                                                  */
/* ==================================================================== */

function currentFilters() {
  return {
    majorId: document.querySelector("[data-major-filter]")?.value || "all",
    specializationId: document.querySelector("[data-specialization-filter]")?.value || "all",
    yearId: document.querySelector("[data-year-filter]")?.value || "all",
    semesterId: document.querySelector("[data-semester-filter]")?.value || "all",
    requirementType: document.querySelector("[data-type-filter]")?.value || "all",
    status: document.querySelector("[data-status-filter]")?.value || "all",
    search: (document.querySelector("[data-search]")?.value || "").trim().toLowerCase(),
  };
}

function isFiltered() {
  const f = currentFilters();
  return Object.entries(f).some(([k, v]) => (k === "search" ? !!v : v !== "all"));
}

function applyFilters(list) {
  const f = currentFilters();
  return list.filter((s) => {
    if (f.majorId !== "all" && s.majorId !== f.majorId) return false;
    if (f.specializationId !== "all" && s.specializationId && s.specializationId !== f.specializationId) {
      return false;
    }
    if (f.yearId !== "all" && s.academicYearId !== f.yearId) return false;
    if (f.semesterId !== "all" && s.semesterId !== f.semesterId) return false;
    if (f.requirementType !== "all" && (s.requirementType || "") !== f.requirementType) return false;
    if (f.status === "active" && !s.active) return false;
    if (f.status === "inactive" && s.active) return false;
    if (!f.search) return true;
    const hay = `${s.name?.en || ""} ${s.name?.ar || ""} ${s.code || ""}`.toLowerCase();
    return hay.includes(f.search);
  });
}

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
    case "credits":
      return sorted.sort((a, b) => (b.creditHours ?? 0) - (a.creditHours ?? 0));
    default:
      return sorted.sort(byDisplayOrder);
  }
}

/* ==================================================================== */
/* Rendering                                                            */
/* ==================================================================== */

function prereqCellHTML(s) {
  const ids = prereqIdsOf(s);
  if (ids.length) {
    // Show codes: they're what the structured links are for, and they stay
    // short enough to read in a table cell.
    const codes = ids
      .map((id) => {
        const found = allSubjects.find((x) => x.id === id);
        return found ? found.code || localName(found) : T("prereq_unknown");
      })
      .map((c) => `<span class="tag">${escapeHTML(c)}</span>`)
      .join(" ");
    return codes;
  }
  // Fall back to the legacy free-text prerequisite so courses that were
  // never converted still show what they require.
  const text = s.prerequisite?.[lang()] || s.prerequisite?.en || "";
  return text ? `<span class="hint">${escapeHTML(text)}</span>` : "—";
}

function rowHTML(s, index, list) {
  const reorderable = currentSort() === "order" && can(profile, SECTION, ACTIONS.EDIT);
  return `
    <tr data-id="${escapeHTML(s.id)}">
      <td>${reorderable ? orderCellHTML(s, index, list) : `<span class="admin-order-cell__num">${s.displayOrder ?? "—"}</span>`}</td>
      <td class="wrap">${escapeHTML(localName(s))}</td>
      <td><span class="tag">${escapeHTML(s.code || "—")}</span></td>
      <td class="wrap">${escapeHTML(nameById(allMajors, s.majorId))}</td>
      <td class="wrap">${escapeHTML(
        s.specializationId ? nameById(allSpecializations, s.specializationId) : T("admin_whole_major")
      )}</td>
      <td class="wrap">${escapeHTML(s.semesterId ? nameById(allSemesters, s.semesterId) : "—")}</td>
      <td>${s.creditHours ?? "—"}</td>
      <td class="wrap">${prereqCellHTML(s)}</td>
      <td>${statusBadgeHTML(s)}</td>
      <td>
        <div class="admin-table__actions">
          ${can(profile, SECTION, ACTIONS.EDIT) ? `<button class="icon-btn" data-action="edit" title="${T("admin_edit")}">✎</button>` : ""}
          ${can(profile, SECTION, ACTIONS.CREATE) ? `<button class="icon-btn" data-action="duplicate" title="${T("admin_duplicate")}">⧉</button>` : ""}
          ${can(profile, SECTION, ACTIONS.PUBLISH) ? `<button class="icon-btn" data-action="toggle" title="${s.active ? T("admin_deactivate") : T("admin_activate")}">${s.active ? "⏸" : "▶"}</button>` : ""}
          ${can(profile, SECTION, ACTIONS.DELETE) ? `<button class="icon-btn icon-btn--danger" data-action="delete" title="${T("admin_delete")}">🗑</button>` : ""}
        </div>
      </td>
    </tr>`;
}

function render() {
  const rows = applySort(applyFilters(allSubjects));
  renderRows({
    rows,
    rowHTML,
    filtered: isFiltered(),
    emptyTitleKey: "admin_empty_title",
    emptyBodyKey: "admin_empty_body",
  });
}

/** Toolbar cascade: major → specialization → year → semester. */
function populateFilters() {
  const majorSelect = document.querySelector("[data-major-filter]");
  const specSelect = document.querySelector("[data-specialization-filter]");
  const yearSelect = document.querySelector("[data-year-filter]");
  const semSelect = document.querySelector("[data-semester-filter]");
  const typeSelect = document.querySelector("[data-type-filter]");
  if (!majorSelect) return;

  const currentMajor = majorSelect.value || "all";
  majorSelect.innerHTML =
    `<option value="all">${T("admin_filter_all_majors")}</option>` +
    allMajors.map((m) => `<option value="${escapeHTML(m.id)}">${escapeHTML(localName(m))}</option>`).join("");
  majorSelect.value =
    currentMajor === "all" || allMajors.some((m) => m.id === currentMajor) ? currentMajor : "all";

  const majorValue = majorSelect.value === "all" ? "" : majorSelect.value;

  if (specSelect) {
    const currentSpec = specSelect.value || "all";
    const scoped = majorValue ? specializationsForMajor(majorValue) : allSpecializations;
    specSelect.innerHTML =
      `<option value="all">${T("admin_filter_all_specializations")}</option>` +
      scoped.map((s) => `<option value="${escapeHTML(s.id)}">${escapeHTML(localName(s))}</option>`).join("");
    specSelect.value = scoped.some((s) => s.id === currentSpec) ? currentSpec : "all";
    specSelect.disabled = scoped.length === 0;
  }

  const specValue = specSelect && specSelect.value !== "all" ? specSelect.value : "";

  if (yearSelect) {
    const currentYear = yearSelect.value || "all";
    const scoped = majorValue ? yearsFor(majorValue, specValue) : allYears;
    yearSelect.innerHTML =
      `<option value="all">${T("admin_filter_all_years")}</option>` +
      scoped.map((y) => `<option value="${escapeHTML(y.id)}">${escapeHTML(localName(y))}</option>`).join("");
    yearSelect.value = scoped.some((y) => y.id === currentYear) ? currentYear : "all";
    yearSelect.disabled = scoped.length === 0;
  }

  const yearValue = yearSelect && yearSelect.value !== "all" ? yearSelect.value : "";

  if (semSelect) {
    const currentSem = semSelect.value || "all";
    const scoped = majorValue ? semestersFor(majorValue, specValue, yearValue) : allSemesters;
    semSelect.innerHTML =
      `<option value="all">${T("admin_filter_all")}</option>` +
      scoped.map((s) => `<option value="${escapeHTML(s.id)}">${escapeHTML(localName(s))}</option>`).join("");
    semSelect.value = scoped.some((s) => s.id === currentSem) ? currentSem : "all";
    semSelect.disabled = scoped.length === 0;
  }

  if (typeSelect && !typeSelect.dataset.filled) {
    typeSelect.dataset.filled = "1";
    typeSelect.innerHTML =
      `<option value="all">${T("admin_filter_all_types")}</option>` +
      REQUIREMENT_TYPES.map((t) => `<option value="${t.key}">${escapeHTML(T(t.labelKey))}</option>`).join("");
  }
}

async function loadAll() {
  showLoading();
  try {
    const [majors, specializations, years, semesters, subjects] = await Promise.all([
      getMajors(),
      getAllSpecializations(),
      getAllAcademicYears(),
      getAllSemesters(),
      getAllSubjects(),
    ]);
    allMajors = filterOwned(profile, "majors", majors);
    allSpecializations = filterOwned(profile, "specializations", specializations);
    allYears = filterOwnedKeepingShared(profile, "academicYears", years);
    allSemesters = filterOwned(profile, "semesters", semesters);
    allSubjects = filterOwned(profile, SECTION, subjects);
    populateFilters();
    render();
  } catch (err) {
    console.error("[ICC Admin] Failed to load courses:", err);
    showError();
  }
}

/* ==================================================================== */
/* Form                                                                 */
/* ==================================================================== */

function requirementTypeOptions(selected) {
  return (
    `<option value="">—</option>` +
    REQUIREMENT_TYPES.map(
      (t) => `<option value="${t.key}"${t.key === selected ? " selected" : ""}>${escapeHTML(T(t.labelKey))}</option>`
    ).join("")
  );
}

/**
 * The prerequisite picker.
 *
 * A checkbox list rather than a multi-select: on a phone a native
 * multi-select is close to unusable, and prerequisites are exactly the
 * field someone fixes on a phone between classes. The list is scoped to
 * courses of the same major — a prerequisite from an unrelated programme
 * is almost always a mis-click — and excludes the course being edited, so
 * rule 2 (no self-prerequisite) is impossible to violate by clicking.
 */
function prerequisitePickerHTML(subject, majorId) {
  const selected = prereqIdsOf(subject);
  const candidates = allSubjects
    .filter((s) => s.id !== subject?.id && (!majorId || s.majorId === majorId))
    .sort((a, b) => (a.code || "").localeCompare(b.code || ""));

  if (!candidates.length) {
    return `<p class="hint">${T("prereq_no_candidates")}</p>`;
  }

  return `
    <div class="prereq-picker" data-prereq-picker>
      ${candidates
        .map(
          (c) => `
        <label class="prereq-picker__item">
          <input type="checkbox" name="prerequisiteIds" value="${escapeHTML(c.id)}"
                 ${selected.includes(c.id) ? "checked" : ""}>
          <span>${escapeHTML(subjectLabel(c))}</span>
        </label>`
        )
        .join("")}
    </div>`;
}

function formHTML(subj) {
  const s = subj || {};
  return `
    <form data-subject-form class="admin-form" novalidate>

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
        </div>
        <div class="form-field" data-field="academicYearId">
          <label>${T("admin_field_academic_year")}</label>
          <select name="academicYearId" data-year-select></select>
          <p class="form-field__error"></p>
        </div>
      </div>

      <div class="form-field" data-field="semesterId">
        <label>${T("admin_field_semester")} *</label>
        <select name="semesterId" required data-semester-select></select>
        <p class="form-field__error">${T("admin_field_required")}</p>
        <p class="hint">${T("course_semester_hint")}</p>
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
        <div class="form-field" data-field="code">
          <label>${T("admin_field_code")} *</label>
          <input type="text" name="code" value="${escapeHTML(s.code || "")}" required>
          <p class="form-field__error">${T("admin_field_required")}</p>
        </div>
        <div class="form-field" data-field="creditHours">
          <label>${T("admin_field_credit_hours")} *</label>
          <input type="number" name="creditHours" min="0" max="12" step="1" value="${s.creditHours ?? ""}" required>
          <p class="form-field__error">${T("admin_field_required")}</p>
        </div>
      </div>

      <div class="form-field">
        <label>${T("admin_field_requirement_type")}</label>
        <select name="requirementType">${requirementTypeOptions(s.requirementType || "")}</select>
      </div>

      <fieldset class="admin-fieldset">
        <legend>${T("prereq_legend")}</legend>
        <p class="hint">${T("prereq_hint")}</p>
        <div data-prereq-mount>${prerequisitePickerHTML(s, s.majorId)}</div>

        <div class="admin-form__row" style="margin-top:12px;">
          <div class="form-field">
            <label>${T("admin_field_prerequisite_en")}</label>
            <input type="text" name="prerequisite_en" value="${escapeHTML(s.prerequisite?.en || "")}">
          </div>
          <div class="form-field">
            <label>${T("admin_field_prerequisite_ar")}</label>
            <input type="text" name="prerequisite_ar" dir="rtl" value="${escapeHTML(s.prerequisite?.ar || "")}">
          </div>
        </div>
        <p class="hint">${T("prereq_text_hint")}</p>
      </fieldset>

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

      <div class="form-field">
        <label>${T("admin_field_course_url")}</label>
        <input type="url" name="courseUrl" value="${escapeHTML(s.courseUrl || "")}">
      </div>

      <div class="admin-form__row">
        <div class="form-field">
          <label>${T("admin_field_display_order")}</label>
          <input type="number" name="displayOrder" value="${s.displayOrder ?? allSubjects.length}">
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
 * Wire the downward cascade. Changing a level resets the levels below it
 * (see semesters-admin.js for why keeping stale values is the worse
 * option), and changing the major also rebuilds the prerequisite picker,
 * since the candidate courses are scoped to the major.
 */
function wireCascade(form, subj) {
  const majorSelect = form.querySelector("[data-major-select]");
  const specSelect = form.querySelector("[data-specialization-select]");
  const yearSelect = form.querySelector("[data-year-select]");
  const semSelect = form.querySelector("[data-semester-select]");
  const prereqMount = form.querySelector("[data-prereq-mount]");
  let first = true;

  function refreshSpecializations() {
    const scoped = specializationsForMajor(majorSelect.value);
    specSelect.innerHTML = optionsHTML(scoped, first ? subj?.specializationId || "" : "", T("admin_whole_major"));
    specSelect.disabled = scoped.length === 0;
  }

  function refreshYears() {
    const scoped = yearsFor(majorSelect.value, specSelect.value || "");
    yearSelect.innerHTML = optionsHTML(scoped, first ? subj?.academicYearId || "" : "", T("admin_no_year"));
    yearSelect.disabled = scoped.length === 0;
  }

  function refreshSemesters() {
    const scoped = semestersFor(majorSelect.value, specSelect.value || "", yearSelect.value || "");
    semSelect.innerHTML = optionsHTML(scoped, first ? subj?.semesterId || "" : "", "—");
    // An empty list is a real state, not a bug: a major with no semesters
    // yet needs its semesters created before courses can be filed in them.
    semSelect.disabled = scoped.length === 0;
  }

  function refreshPrereqs() {
    if (!prereqMount) return;
    prereqMount.innerHTML = prerequisitePickerHTML(subj, majorSelect.value);
  }

  majorSelect.addEventListener("change", () => {
    first = false;
    refreshSpecializations();
    refreshYears();
    refreshSemesters();
    refreshPrereqs();
  });
  specSelect.addEventListener("change", () => {
    first = false;
    refreshYears();
    refreshSemesters();
  });
  yearSelect.addEventListener("change", () => {
    first = false;
    refreshSemesters();
  });

  refreshSpecializations();
  refreshYears();
  refreshSemesters();
  first = false;
}

function readForm(form) {
  const fd = new FormData(form);
  return {
    majorId: (fd.get("majorId") || "").toString(),
    specializationId: (fd.get("specializationId") || "").toString(),
    academicYearId: (fd.get("academicYearId") || "").toString(),
    semesterId: (fd.get("semesterId") || "").toString(),
    name: readBilingual(fd, "name"),
    code: (fd.get("code") || "").toString().trim(),
    creditHours: Number(fd.get("creditHours")) || 0,
    requirementType: (fd.get("requirementType") || "").toString(),
    // Legacy free-text prerequisites are preserved verbatim alongside the
    // structured ids — neither replaces the other.
    prerequisite: readBilingual(fd, "prerequisite"),
    prerequisiteIds: fd.getAll("prerequisiteIds").map((v) => v.toString()),
    description: readBilingual(fd, "description"),
    courseUrl: (fd.get("courseUrl") || "").toString().trim(),
    displayOrder: Number(fd.get("displayOrder")) || 0,
    active: fd.get("active") === "on",
  };
}

function validate(form, data, editing) {
  const editingId = editing?.id || null;

  if (!requireFields(form, [
    ["majorId", "majorId"],
    ["semesterId", "semesterId"],
    ["name_en", "name_en"],
    ["name_ar", "name_ar"],
    ["code", "code"],
    ["creditHours", "creditHours"],
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
  }

  // --- The core integrity rule the brief calls out -------------------
  const semester = allSemesters.find((s) => s.id === data.semesterId);
  if (!semester) return fieldError(form, "semesterId", "err_semester_missing");
  if (semester.majorId !== data.majorId) {
    return fieldError(form, "semesterId", "err_semester_major_mismatch");
  }
  // Only meaningful where the semester is itself specialization-scoped: a
  // semester belonging to the whole major legitimately holds courses from
  // any track within it.
  if (semester.specializationId && semester.specializationId !== data.specializationId) {
    return fieldError(form, "semesterId", "err_semester_specialization_mismatch");
  }
  if (data.academicYearId && semester.academicYearId && semester.academicYearId !== data.academicYearId) {
    return fieldError(form, "semesterId", "err_semester_year_mismatch");
  }

  // --- Prerequisite integrity ---------------------------------------
  const unknown = data.prerequisiteIds.filter((id) => !allSubjects.some((s) => s.id === id));
  if (unknown.length) {
    UI().errorToast(T("err_prereq_unknown"));
    return false;
  }
  if (editingId && data.prerequisiteIds.includes(editingId)) {
    UI().errorToast(T("err_prereq_self"));
    return false;
  }
  const cycleVia = wouldCreateCycle(editingId, data.prerequisiteIds);
  if (cycleVia) {
    const via = allSubjects.find((s) => s.id === cycleVia);
    UI().errorToast(T("err_prereq_cycle").replace("{course}", subjectLabel(via)));
    return false;
  }

  // --- Duplicate course code within a major --------------------------
  const clash = allSubjects.some(
    (s) =>
      s.id !== editingId &&
      s.majorId === data.majorId &&
      (s.code || "").toLowerCase() === data.code.toLowerCase()
  );
  if (clash) return fieldError(form, "code", "err_code_duplicate");

  return true;
}

function openForm(subj, preset = {}) {
  if (!allMajors.length) {
    UI().errorToast(T("err_no_majors_yet"));
    return;
  }

  const seed = subj || { majorId: preset.majorId || "", semesterId: preset.semesterId || "" };
  const wrap = document.createElement("div");
  wrap.innerHTML = formHTML(seed);
  const form = wrap.querySelector("[data-subject-form]");
  wireCascade(form, seed);
  wrap.querySelector("[data-cancel]").addEventListener("click", () => UI().closeModal());

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = readForm(form);
    if (!validate(form, data, subj)) return;

    if (data.active && !can(profile, SECTION, ACTIONS.PUBLISH)) {
      data.active = false;
      UI().toast(T("wf_saved_unpublished"), "info");
    }

    const restore = busy(wrap.querySelector("[data-submit]"));
    try {
      if (subj?.id) {
        await updateSubject(subj.id, data);
        await logAction({
          action: "update",
          section: SECTION,
          entityId: subj.id,
          entityLabel: data.name.en || subj.id,
          before: subj,
          after: { ...subj, ...data },
        });
        UI().successToast(T("admin_updated_success"));
      } else {
        const newId = await createSubject(data);
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
      console.error("[ICC Admin] Save course failed:", err);
      UI().errorToast(T("admin_error_generic"));
    } finally {
      restore();
    }
  });

  UI().openModal({
    title: subj?.id ? T("admin_subject_form_title_edit") : T("admin_subject_form_title_add"),
    bodyEl: wrap,
  });
}

/* ==================================================================== */
/* Duplicate                                                            */
/* ==================================================================== */

function openDuplicateForm(subj) {
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <p class="hint">${T("admin_duplicate_target_hint")}</p>
    <form data-dup-form class="admin-form" novalidate>
      <div class="form-field">
        <label>${T("admin_field_major")}</label>
        <select data-major-select name="majorId">${optionsHTML(allMajors, subj.majorId, null)}</select>
      </div>
      <div class="admin-form__row">
        <div class="form-field">
          <label>${T("admin_field_specialization")}</label>
          <select data-specialization-select name="specializationId"></select>
        </div>
        <div class="form-field">
          <label>${T("admin_field_academic_year")}</label>
          <select data-year-select name="academicYearId"></select>
        </div>
      </div>
      <div class="form-field">
        <label>${T("admin_field_semester")}</label>
        <select data-semester-select name="semesterId"></select>
      </div>
      <div class="admin-form__actions">
        <button type="button" class="btn btn--outline" data-cancel>${T("admin_cancel")}</button>
        <button type="submit" class="btn btn--primary" data-submit>${T("admin_duplicate")}</button>
      </div>
    </form>`;

  const form = wrap.querySelector("[data-dup-form]");
  wireCascade(form, subj);
  wrap.querySelector("[data-cancel]").addEventListener("click", () => UI().closeModal());

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const majorId = form.querySelector("[data-major-select]").value;
    const semesterId = form.querySelector("[data-semester-select]").value;
    if (!majorId || !semesterId) {
      UI().errorToast(T("admin_field_required"));
      return;
    }

    const copy = {
      majorId,
      specializationId: form.querySelector("[data-specialization-select]").value || "",
      academicYearId: form.querySelector("[data-year-select]").value || "",
      semesterId,
      name: { en: `${subj.name?.en || ""} (Copy)`, ar: `${subj.name?.ar || ""} (نسخة)` },
      code: `${subj.code || ""}-COPY`,
      creditHours: subj.creditHours || 0,
      requirementType: subj.requirementType || "",
      prerequisite: { en: subj.prerequisite?.en || "", ar: subj.prerequisite?.ar || "" },
      // Structured prerequisites are carried over only when the copy stays
      // inside the same major; across majors those ids would point at
      // courses the new major's students never take.
      prerequisiteIds: majorId === subj.majorId ? prereqIdsOf(subj) : [],
      description: { en: subj.description?.en || "", ar: subj.description?.ar || "" },
      courseUrl: subj.courseUrl || "",
      displayOrder: (subj.displayOrder ?? 0) + 1,
      // A copy always lands inactive: it has a placeholder name and code
      // that nobody wants on the public site by accident.
      active: false,
    };

    const restore = busy(wrap.querySelector("[data-submit]"));
    try {
      const copyId = await createSubject(copy);
      await logAction({
        action: "create",
        section: SECTION,
        entityId: copyId,
        entityLabel: copy.name.en || copyId,
        summary: `Duplicated from "${subj.name?.en || subj.id}"`,
        after: copy,
      });
      UI().successToast(T("admin_duplicated_success"));
      UI().closeModal();
      await loadAll();
    } catch (err) {
      console.error("[ICC Admin] Duplicate course failed:", err);
      UI().errorToast(T("admin_error_generic"));
    } finally {
      restore();
    }
  });

  UI().openModal({ title: T("admin_duplicate_subject_title"), bodyEl: wrap });
}

/* ==================================================================== */
/* Row actions                                                          */
/* ==================================================================== */

/**
 * Deleting a course that others require is the case most likely to break a
 * curriculum quietly, so the dependents are named — not just counted —
 * before anything happens, and the panel offers to detach the references
 * rather than leaving them pointing at nothing.
 */
async function handleDelete(subj) {
  const label = subjectLabel(subj);
  const dependents = dependentsOf(subj.id);

  if (dependents.length) {
    const proceed = await new Promise((resolve) => {
      const body = document.createElement("div");
      body.innerHTML = `
        <p>${T("admin_confirm_delete_msg")} — "${escapeHTML(label)}"</p>
        <div class="admin-modal__warning">
          <strong>${T("prereq_dep_title")}</strong>
          <p>${T("prereq_dep_body").replace("{count}", dependents.length)}</p>
          <ul class="dep-list">
            ${dependents.map((d) => `<li>${escapeHTML(subjectLabel(d))}</li>`).join("")}
          </ul>
          <p class="hint">${T("prereq_dep_hint")}</p>
        </div>
        <div class="admin-form__actions admin-form__actions--stack">
          <button type="button" class="btn btn--outline" data-choice="cancel">${T("admin_cancel")}</button>
          <button type="button" class="btn btn--primary" data-choice="detach">${T("prereq_detach_btn")}</button>
        </div>`;
      body.querySelectorAll("[data-choice]").forEach((btn) =>
        btn.addEventListener("click", () => {
          UI().closeModal();
          resolve(btn.getAttribute("data-choice"));
        })
      );
      UI().openModal({ title: T("admin_confirm_delete_title"), bodyEl: body });
    });

    if (proceed !== "detach") return;

    // Detach first, so that if the delete then fails the data is still
    // consistent — a course with one fewer prerequisite is valid; a
    // prerequisite pointing at a deleted course is not.
    try {
      await Promise.all(
        dependents.map((d) =>
          updateSubject(d.id, {
            prerequisiteIds: prereqIdsOf(d).filter((id) => id !== subj.id),
          })
        )
      );
      await logAction({
        action: "update",
        section: SECTION,
        entityId: subj.id,
        entityLabel: label,
        summary: T("prereq_detached_summary").replace("{count}", dependents.length),
      });
    } catch (err) {
      console.error("[ICC Admin] Detaching prerequisites failed:", err);
      UI().errorToast(T("admin_error_generic"));
      return;
    }
  }

  const choice = await confirmDeleteWithDependencies({ section: SECTION, record: subj, label });
  if (choice === "cancel") return;

  try {
    if (choice === "deactivate") {
      await updateSubject(subj.id, { active: false });
      await logAction({
        action: "deactivate",
        section: SECTION,
        entityId: subj.id,
        entityLabel: label,
        summary: T("dep_deactivated_instead"),
        before: { active: subj.active },
        after: { active: false },
      });
      UI().successToast(T("dep_deactivated_success"));
    } else {
      await deleteSubject(subj.id);
      await logAction({
        action: "delete",
        section: SECTION,
        entityId: subj.id,
        entityLabel: label,
        before: subj,
      });
      UI().successToast(T("admin_deleted_success"));
    }
    await loadAll();
  } catch (err) {
    console.error("[ICC Admin] Delete course failed:", err);
    UI().errorToast(T("admin_error_generic"));
  }
}

async function handleToggle(subj) {
  try {
    await updateSubject(subj.id, { active: !subj.active });
    await logAction({
      action: subj.active ? "deactivate" : "activate",
      section: SECTION,
      entityId: subj.id,
      entityLabel: subjectLabel(subj),
      before: { active: subj.active },
      after: { active: !subj.active },
    });
    UI().successToast(T("admin_status_updated_success"));
    await loadAll();
  } catch (err) {
    console.error("[ICC Admin] Toggle course failed:", err);
    UI().errorToast(T("admin_error_generic"));
  }
}

async function handleMove(subj, direction) {
  const siblings = allSubjects.filter((s) => s.semesterId === subj.semesterId);
  try {
    const changed = await moveWithin(siblings, subj, direction, (updates) =>
      reorderDocs(COLLECTION, updates)
    );
    if (!changed) return;
    await logAction({
      action: "reorder",
      section: SECTION,
      entityId: subj.id,
      entityLabel: subjectLabel(subj),
      summary: T(direction === "up" ? "admin_move_up" : "admin_move_down"),
    });
    await loadAll();
  } catch (err) {
    console.error("[ICC Admin] Reorder courses failed:", err);
    UI().errorToast(T("admin_error_generic"));
  }
}

function wireTable() {
  document.querySelector("[data-table-body]").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.closest("tr")?.getAttribute("data-id");
    const subj = allSubjects.find((s) => s.id === id);
    if (!subj) return;

    switch (btn.getAttribute("data-action")) {
      case "edit": openForm(subj); break;
      case "duplicate": openDuplicateForm(subj); break;
      case "delete": handleDelete(subj); break;
      case "toggle": handleToggle(subj); break;
      case "up": handleMove(subj, "up"); break;
      case "down": handleMove(subj, "down"); break;
    }
  });
}

function wireToolbar() {
  const addBtn = document.querySelector("[data-add-btn]");
  if (addBtn) {
    if (!can(profile, SECTION, ACTIONS.CREATE)) addBtn.hidden = true;
    else addBtn.addEventListener("click", () => openForm(null));
  }

  ["[data-major-filter]", "[data-specialization-filter]", "[data-year-filter]"].forEach((sel) => {
    document.querySelector(sel)?.addEventListener("change", () => {
      populateFilters();
      render();
    });
  });
  document.querySelector("[data-semester-filter]")?.addEventListener("change", render);
  document.querySelector("[data-type-filter]")?.addEventListener("change", render);
  document.querySelector("[data-status-filter]")?.addEventListener("change", render);
  document.querySelector("[data-sort]")?.addEventListener("change", render);
  document.querySelector("[data-search]")?.addEventListener("input", render);
  document.querySelector("[data-clear-filters]")?.addEventListener("click", () => {
    [
      "[data-major-filter]",
      "[data-specialization-filter]",
      "[data-year-filter]",
      "[data-semester-filter]",
      "[data-type-filter]",
      "[data-status-filter]",
    ].forEach((sel) => {
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
    if (params.get("new") === "1" && can(profile, SECTION, ACTIONS.CREATE)) {
      openForm(null, {
        majorId: params.get("majorId") || "",
        semesterId: params.get("semesterId") || "",
      });
    }
  });
});
