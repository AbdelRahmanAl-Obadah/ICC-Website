/**
 * subjects.js
 * -----------------------------------------------------------------------
 * PHASE 1: renders the semester/subject tree on major.html from local
 * demo data (DEMO_YEARS). The same demo curriculum is shown regardless
 * of which major id is in the URL — it exists purely to prove out the
 * UI, and is clearly labelled as demo content.
 *
 * PHASE 2+: replace getDemoYears() with the result of
 * `await fetchSemestersForMajor(majorId)` from firestore.js. Keep the
 * returned shape the same (years → semesters → subjects) and
 * renderSemesterPlan() keeps working unmodified.
 *
 * Shape:
 * [
 *   {
 *     year: 1,
 *     semesters: [
 *       { label: "Semester 1", subjects: [ {code, name, credits, prereq, desc} ] }
 *     ]
 *   }
 * ]
 * ------------------------------------------------------------------------
 */

const DEMO_YEARS = [
  {
    year: 1,
    semesters: [
      {
        semesterIndex: 1,
        subjects: [
          { code: "CS101", name: { en: "Intro to Programming", ar: "مقدمة في البرمجة" }, credits: 3, prereq: null, desc: { en: "Foundations of problem solving and writing code.", ar: "أساسيات حل المشكلات وكتابة الشيفرة." } },
          { code: "MATH101", name: { en: "Calculus I", ar: "التفاضل والتكامل ١" }, credits: 3, prereq: null, desc: { en: "Limits, derivatives and their applications.", ar: "النهايات والمشتقات وتطبيقاتها." } },
          { code: "ENG101", name: { en: "English Communication", ar: "مهارات التواصل بالإنجليزية" }, credits: 3, prereq: null, desc: { en: "Academic writing and spoken communication.", ar: "الكتابة الأكاديمية والتواصل الشفهي." } },
        ],
      },
      {
        semesterIndex: 2,
        subjects: [
          { code: "CS102", name: { en: "Data Structures", ar: "بنية البيانات" }, credits: 3, prereq: "CS101", desc: { en: "Lists, trees, graphs and how to choose between them.", ar: "القوائم والأشجار والرسوم البيانية وكيفية الاختيار بينها." } },
          { code: "MATH102", name: { en: "Calculus II", ar: "التفاضل والتكامل ٢" }, credits: 3, prereq: "MATH101", desc: { en: "Integration techniques and infinite series.", ar: "تقنيات التكامل والمتسلسلات اللانهائية." } },
          { code: "PHYS101", name: { en: "General Physics", ar: "الفيزياء العامة" }, credits: 3, prereq: null, desc: { en: "Mechanics and the physical basis of computing hardware.", ar: "الميكانيكا والأساس الفيزيائي لأجهزة الحوسبة." } },
        ],
      },
    ],
  },
  {
    year: 2,
    semesters: [
      {
        semesterIndex: 1,
        subjects: [
          { code: "CS201", name: { en: "Algorithms", ar: "الخوارزميات" }, credits: 3, prereq: "CS102", desc: { en: "Designing and analyzing efficient algorithms.", ar: "تصميم وتحليل الخوارزميات الفعّالة." } },
          { code: "CS210", name: { en: "Computer Organization", ar: "تنظيم الحاسوب" }, credits: 3, prereq: "CS102", desc: { en: "How hardware executes the code you write.", ar: "كيف ينفّذ الجهاز الشيفرة التي تكتبها." } },
          { code: "STAT201", name: { en: "Probability & Statistics", ar: "الاحتمالات والإحصاء" }, credits: 3, prereq: "MATH102", desc: { en: "Foundations for data analysis and ML later on.", ar: "أساسيات لتحليل البيانات وتعلم الآلة لاحقاً." } },
        ],
      },
      {
        semesterIndex: 2,
        subjects: [
          { code: "CS220", name: { en: "Operating Systems", ar: "أنظمة التشغيل" }, credits: 3, prereq: "CS210", desc: { en: "Processes, memory and concurrency.", ar: "العمليات والذاكرة والتزامن." } },
          { code: "CS230", name: { en: "Database Systems", ar: "أنظمة قواعد البيانات" }, credits: 3, prereq: "CS201", desc: { en: "Modeling, querying and managing structured data.", ar: "نمذجة البيانات المنظمة والاستعلام عنها وإدارتها." } },
          { code: "CS240", name: { en: "Discrete Mathematics", ar: "الرياضيات المتقطعة" }, credits: 3, prereq: "MATH101", desc: { en: "Logic, sets and proof techniques used across CS.", ar: "المنطق والمجموعات وتقنيات البرهان المستخدمة في الحوسبة." } },
        ],
      },
    ],
  },
];

function getDemoYears() {
  return DEMO_YEARS;
}

function subjectCardHTML(subject, lang) {
  const t = window.ICC_I18N.t;
  return `
    <div class="subject-card">
      <div class="subject-card__top">
        <div>
          <div class="subject-card__code">${subject.code}</div>
          <div class="subject-card__name">${subject.name[lang]}</div>
        </div>
      </div>
      <div class="subject-card__meta">
        <span>${subject.credits} ${t("credit_hours", lang)}</span>
        <span>${subject.prereq ? `${t("prereq_label", lang)}: ${subject.prereq}` : "—"}</span>
      </div>
      <p class="subject-card__desc">${subject.desc[lang]}</p>
      <span class="subject-card__link">${t("course_link", lang)} →</span>
    </div>
  `;
}

function renderSemesterPlan() {
  const mount = document.querySelector("[data-semester-plan]");
  if (!mount) return;

  const lang = window.ICC_I18N.getStoredLang();
  const t = window.ICC_I18N.t;

  mount.innerHTML = getDemoYears()
    .map((yearBlock) => `
      <div class="year-block">
        <div class="year-block__head">
          <h2>${t("year_label", lang)} ${yearBlock.year}</h2>
          <span class="tag tag--demo">${t("demo_label", lang)}</span>
        </div>
        ${yearBlock.semesters
          .map(
            (sem) => `
          <div class="semester">
            <div class="semester__head">
              <span>${t("semester_label", lang)} ${sem.semesterIndex}</span>
              <span class="tag">${sem.subjects.length} × ${t("credit_hours", lang)}</span>
            </div>
            <div class="subject-grid">
              ${sem.subjects.map((s) => subjectCardHTML(s, lang)).join("")}
            </div>
          </div>
        `
          )
          .join("")}
      </div>
    `)
    .join("");
}

document.addEventListener("DOMContentLoaded", renderSemesterPlan);

window.ICC_SUBJECTS = { getDemoYears, rerender: renderSemesterPlan };
