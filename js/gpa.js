/**
 * gpa.js
 * -----------------------------------------------------------------------
 * Client-side GPA calculator on ICC's 4.2 grading scale. Pure UI logic —
 * no Firestore involved, so it works standalone and instantly. Bilingual
 * labels come from translations in language.js (data-i18n handles those);
 * this file only wires up the interactive table + math.
 *
 * "Repeated course" handling:
 * If a course is retaken, most universities only count the new grade
 * toward GPA (the old attempt's points are dropped) while the credit
 * hours are only counted once. Since this calculator only lets you type
 * a course in once, that only matters when it's also rolled into a
 * previous cumulative GPA — so a repeated row lets you record the old
 * grade, and that old grade's contribution is subtracted out of the
 * previous cumulative GPA/hours before the new grade is added in.
 * ------------------------------------------------------------------------
 */

// Grade → points, out of 4.2 (ICC's local scale — not an official JUST document)
const GPA_SCALE = [
  { grade: "A+", points: 4.2 },
  { grade: "A", points: 4.0 },
  { grade: "A-", points: 3.75 },
  { grade: "B+", points: 3.5 },
  { grade: "B", points: 3.25 },
  { grade: "B-", points: 3.0 },
  { grade: "C+", points: 2.75 },
  { grade: "C", points: 2.5 },
  { grade: "C-", points: 2.25 },
  { grade: "D+", points: 2.0 },
  { grade: "D", points: 1.75 },
  { grade: "D-", points: 1.5 },
  { grade: "F", points: 0.50 },
];

let rowId = 0;

function gradeOptionsHtml(selected) {
  return GPA_SCALE.map(
    (g) =>
      `<option value="${g.points}"${g.points === selected ? " selected" : ""}>${g.grade} (${g.points.toFixed(2)})</option>`
  ).join("");
}

function createRow() {
  rowId += 1;
  const row = document.createElement("div");
  row.className = "gpa-row";
  row.dataset.rowId = String(rowId);

  row.innerHTML = `
    <div class="gpa-row__main">
      <div class="gpa-field gpa-field--course">
        <label data-i18n="gpa_col_course">Course</label>
        <input type="text" data-gpa-course-name placeholder="Course name">
      </div>
      <div class="gpa-field gpa-field--hours">
        <label data-i18n="gpa_col_hours">Credit hours</label>
        <input type="number" data-gpa-course-hours min="0" step="1" value="3">
      </div>
      <div class="gpa-field gpa-field--grade">
        <label data-i18n="gpa_col_grade">Grade</label>
        <select data-gpa-course-grade>${gradeOptionsHtml(4.0)}</select>
      </div>
      <button type="button" class="gpa-row-remove" data-gpa-remove-row aria-label="Remove course">✕</button>
    </div>

    <div class="gpa-row__extra">
      <label class="gpa-check gpa-check--small">
        <input type="checkbox" data-gpa-course-repeat>
        <span data-i18n="gpa_repeated_course">Repeated course (retaking it)</span>
      </label>

      <div class="gpa-field gpa-field--old-grade" data-gpa-old-grade-wrap hidden>
        <label data-i18n="gpa_repeated_old_grade">Previous grade in this course</label>
        <select data-gpa-course-old-grade>${gradeOptionsHtml(0)}</select>
      </div>
    </div>
  `;
  return row;
}

function calculate() {
  const rowsContainer = document.querySelector("[data-gpa-rows]");
  const resultEl = document.querySelector("[data-gpa-result]");
  const barEl = document.querySelector("[data-gpa-bar]");
  const totalHoursEl = document.querySelector("[data-gpa-total-hours]");
  if (!rowsContainer || !resultEl) return;

  let totalPoints = 0;
  let totalHours = 0;
  let repeatAdjustPoints = 0;
  let repeatAdjustHours = 0;

  rowsContainer.querySelectorAll(".gpa-row").forEach((row) => {
    const hoursInput = row.querySelector("[data-gpa-course-hours]");
    const gradeSelect = row.querySelector("[data-gpa-course-grade]");
    const hours = parseFloat(hoursInput?.value) || 0;
    const points = parseFloat(gradeSelect?.value) || 0;
    if (hours > 0) {
      totalPoints += hours * points;
      totalHours += hours;
    }

    const repeatToggle = row.querySelector("[data-gpa-course-repeat]");
    if (repeatToggle?.checked && hours > 0) {
      const oldGradeSelect = row.querySelector("[data-gpa-course-old-grade]");
      const oldPoints = parseFloat(oldGradeSelect?.value) || 0;
      // The old attempt's contribution needs to come out of the previous
      // cumulative GPA (it's already baked in there); hours are only
      // counted once, from this current entry.
      repeatAdjustPoints += hours * oldPoints;
      repeatAdjustHours += hours;
    }
  });

  const cumulativeToggle = document.querySelector("[data-gpa-cumulative-toggle]");
  if (cumulativeToggle?.checked) {
    const prevGpa = parseFloat(document.querySelector("[data-gpa-prev-gpa]")?.value) || 0;
    const prevHours = parseFloat(document.querySelector("[data-gpa-prev-hours]")?.value) || 0;
    if (prevHours > 0) {
      let adjPoints = prevGpa * prevHours;
      let adjHours = prevHours;
      // Remove the old attempt(s) of any repeated course(s) from the
      // previous cumulative totals, capped so it never goes negative.
      adjPoints = Math.max(0, adjPoints - repeatAdjustPoints);
      adjHours = Math.max(0, adjHours - repeatAdjustHours);
      totalPoints += adjPoints;
      totalHours += adjHours;
    }
  }

  const gpa = totalHours > 0 ? totalPoints / totalHours : 0;
  const clamped = Math.min(Math.max(gpa, 0), 4.2);

  resultEl.textContent = clamped.toFixed(2);
  if (totalHoursEl) totalHoursEl.textContent = String(totalHours);
  if (barEl) barEl.style.width = `${(clamped / 4.2) * 100}%`;
}

function addRow() {
  const rowsContainer = document.querySelector("[data-gpa-rows]");
  if (!rowsContainer) return;
  const row = createRow();
  rowsContainer.appendChild(row);

  row.querySelectorAll("input, select").forEach((el) => {
    el.addEventListener("input", calculate);
    el.addEventListener("change", calculate);
  });

  const repeatToggle = row.querySelector("[data-gpa-course-repeat]");
  const oldGradeWrap = row.querySelector("[data-gpa-old-grade-wrap]");
  repeatToggle.addEventListener("change", () => {
    oldGradeWrap.hidden = !repeatToggle.checked;
    row.classList.toggle("gpa-row--repeated", repeatToggle.checked);
    calculate();
  });

  row.querySelector("[data-gpa-remove-row]").addEventListener("click", () => {
    row.remove();
    calculate();
  });

  calculate();
}

function renderScaleTable() {
  const table = document.querySelector("[data-gpa-scale-table]");
  if (!table) return;
  table.innerHTML = GPA_SCALE.map(
    (g) => `<div class="gpa-scale-grid__row"><span>${g.grade}</span><span>${g.points.toFixed(2)}</span></div>`
  ).join("");
}

function initCumulativeToggle() {
  const toggle = document.querySelector("[data-gpa-cumulative-toggle]");
  const fields = document.querySelector("[data-gpa-cumulative-fields]");
  if (!toggle || !fields) return;

  toggle.addEventListener("change", () => {
    fields.hidden = !toggle.checked;
    calculate();
  });

  [document.querySelector("[data-gpa-prev-gpa]"), document.querySelector("[data-gpa-prev-hours]")]
    .filter(Boolean)
    .forEach((el) => el.addEventListener("input", calculate));
}

document.addEventListener("DOMContentLoaded", () => {
  renderScaleTable();
  initCumulativeToggle();

  document.querySelector("[data-gpa-add]")?.addEventListener("click", () => addRow());

  // Start with three empty rows so the table doesn't look empty
  addRow();
  addRow();
  addRow();
});
