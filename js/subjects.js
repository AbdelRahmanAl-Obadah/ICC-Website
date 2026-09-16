/**
 * subjects.js
 * -----------------------------------------------------------------------
 * PHASE 3A: renders the semester/subject tree on major.html from real
 * Firestore data (semesters + subjects collections, filtered by
 * majorId). No demo curriculum data lives here anymore.
 *
 * Called by majors.js once it knows which major id is in the URL:
 *   window.ICC_SUBJECTS.init(majorId)      — first load
 *   window.ICC_SUBJECTS.rerender(majorId)  — on language change
 *
 * Semesters are grouped by yearNumber, then ordered by semesterNumber /
 * displayOrder. A major can have any number of years/semesters — nothing
 * here assumes a fixed count.
 * ------------------------------------------------------------------------
 */

import { getSemestersForMajor, getSubjectsForMajor, FirestoreNotConfiguredError } from "./firestore.js";
import { icon } from "./icons.js";

// Cache of the last successfully loaded semesters/subjects so a language
// switch can re-render instantly without refetching Firestore.
let lastMajorId = null;
let lastSemesters = null;
let lastSubjects = null;

function stateHTML(kind, lang, { title, body } = {}) {
  const t = window.ICC_I18N.t;
  const icon = kind === "error" ? "⚠" : kind === "empty" ? "—" : "…";
  return `
    <div class="state state--${kind}" role="${kind === "error" ? "alert" : "status"}">
      <div class="state__icon">${icon}</div>
      <strong>${title ?? t(`state_${kind}_title`, lang)}</strong>
      <p>${body ?? t(`state_${kind}_body`, lang)}</p>
    </div>
  `;
}

function loadingHTML(lang) {
  const t = window.ICC_I18N.t;
  return `<div class="state state--loading" role="status"><div class="state__icon">…</div><p>${t(
    "state_loading",
    lang
  )}</p></div>`;
}

function subjectCardHTML(subject, lang) {
  const t = window.ICC_I18N.t;
  const name = subject.name?.[lang] || subject.name?.en || subject.code || "";
  const prereq = subject.prerequisite?.[lang] || subject.prerequisite?.en || "";
  const description = subject.description?.[lang] || subject.description?.en || "";
  const link = subject.courseUrl
    ? `<a class="subject-card__link icon-text" href="${subject.courseUrl}" target="_blank" rel="noopener">${t(
        "course_link",
        lang
      )}${icon("external-link")}</a>`
    : "";

  return `
    <div class="subject-card">
      <div class="subject-card__top">
        <div>
          ${subject.code ? `<div class="subject-card__code">${subject.code}</div>` : ""}
          <div class="subject-card__name">${name}</div>
        </div>
      </div>
      <div class="subject-card__meta">
        ${subject.creditHours != null ? `<span>${subject.creditHours} ${t("credit_hours", lang)}</span>` : ""}
        <span>${prereq ? `${t("prereq_label", lang)}: ${prereq}` : "—"}</span>
      </div>
      ${description ? `<p class="subject-card__desc">${description}</p>` : ""}
      ${link}
    </div>
  `;
}

/** Group a flat semesters[] + subjects[] pair into year → semester → subjects. */
function groupByYear(semesters, subjects) {
  const bySemesterId = new Map();
  subjects.forEach((subject) => {
    const list = bySemesterId.get(subject.semesterId) || [];
    list.push(subject);
    bySemesterId.set(subject.semesterId, list);
  });

  const yearMap = new Map();
  semesters.forEach((semester) => {
    const yearNumber = semester.yearNumber ?? 0;
    const yearGroup = yearMap.get(yearNumber) || { yearNumber, semesters: [] };
    yearGroup.semesters.push({
      ...semester,
      subjects: bySemesterId.get(semester.id) || [],
    });
    yearMap.set(yearNumber, yearGroup);
  });

  return Array.from(yearMap.values())
    .sort((a, b) => a.yearNumber - b.yearNumber)
    .map((yearGroup) => ({
      ...yearGroup,
      semesters: yearGroup.semesters.sort(
        (a, b) => (a.semesterNumber ?? 0) - (b.semesterNumber ?? 0) || (a.displayOrder ?? 0) - (b.displayOrder ?? 0)
      ),
    }));
}

function renderFromCache() {
  const mount = document.querySelector("[data-semester-plan]");
  if (!mount) return;

  const lang = window.ICC_I18N.getStoredLang();
  const t = window.ICC_I18N.t;

  if (!lastSemesters || !lastSemesters.length) {
    mount.innerHTML = stateHTML("empty", lang, {
      title: t("years_empty_title", lang),
      body: t("years_empty_body", lang),
    });
    return;
  }

  const years = groupByYear(lastSemesters, lastSubjects || []);

  mount.innerHTML = years
    .map(
      (yearBlock) => `
      <div class="year-block">
        <div class="year-block__head">
          <h2>${t("year_label", lang)} ${yearBlock.yearNumber}</h2>
        </div>
        ${yearBlock.semesters
          .map((sem) => {
            const semesterLabel = sem.name?.[lang] || sem.name?.en || `${t("semester_label", lang)} ${sem.semesterNumber ?? ""}`;
            return `
          <div class="semester">
            <div class="semester__head">
              <span>${semesterLabel}</span>
              <span class="tag">${sem.subjects.length} × ${t("credit_hours", lang)}</span>
            </div>
            <div class="subject-grid">
              ${
                sem.subjects.length
                  ? sem.subjects.map((s) => subjectCardHTML(s, lang)).join("")
                  : `<p class="subject-card__desc">${t("subjects_empty_body", lang)}</p>`
              }
            </div>
          </div>
        `;
          })
          .join("")}
      </div>
    `
    )
    .join("");
}

async function loadAndRender(majorId) {
  const mount = document.querySelector("[data-semester-plan]");
  if (!mount) return;

  const lang = window.ICC_I18N.getStoredLang();

  if (!majorId) {
    lastMajorId = null;
    lastSemesters = [];
    lastSubjects = [];
    renderFromCache();
    return;
  }

  mount.innerHTML = loadingHTML(lang);

  try {
    const [semesters, subjects] = await Promise.all([
      getSemestersForMajor(majorId),
      getSubjectsForMajor(majorId),
    ]);
    lastMajorId = majorId;
    lastSemesters = semesters;
    lastSubjects = subjects;
    renderFromCache();
  } catch (err) {
    console.error("[ICC] Failed to load semester plan:", err);
    if (err instanceof FirestoreNotConfiguredError) {
      lastMajorId = majorId;
      lastSemesters = [];
      lastSubjects = [];
      renderFromCache();
    } else {
      mount.innerHTML = stateHTML("error", lang);
    }
  }
}

function init(majorId) {
  return loadAndRender(majorId);
}

function rerender(majorId) {
  // If we're re-rendering for the same major we already have cached data
  // for, just redraw with the new language instead of refetching.
  if (majorId && majorId === lastMajorId) {
    renderFromCache();
    return Promise.resolve();
  }
  return loadAndRender(majorId ?? lastMajorId);
}

window.ICC_SUBJECTS = { init, rerender };
