/**
 * majors.js
 * -----------------------------------------------------------------------
 * PHASE 1: renders majors from local demo data (DEMO_MAJORS below).
 *
 * PHASE 2+: replace the two calls to getDemoMajors()/getDemoMajorById()
 * with `await fetchAllMajors()` / `await fetchMajorById(id)` from
 * firestore.js. The render functions (renderFeaturedMajors,
 * renderMajorsGrid, renderMajorHeader) are written to accept the same
 * shape either way, so no other code needs to change.
 *
 * Every major object looks like:
 * {
 *   id: "computer-science",          // used in major.html?id=...
 *   name: { en, ar },
 *   summary: { en, ar },             // one-line card description
 *   description: { en, ar },         // longer major.html description
 * }
 * ------------------------------------------------------------------------
 */

const DEMO_MAJORS = [
  {
    id: "computer-science",
    name: { en: "Computer Science", ar: "علم الحاسوب" },
    summary: {
      en: "Algorithms, systems and software engineering foundations.",
      ar: "أسس الخوارزميات والأنظمة وهندسة البرمجيات.",
    },
    description: {
      en: "A broad foundation in algorithms, data structures, operating systems and software engineering, with room to specialize in later years.",
      ar: "أساس واسع في الخوارزميات وبنية البيانات وأنظمة التشغيل وهندسة البرمجيات، مع إمكانية التخصص في السنوات المتقدمة.",
    },
  },
  {
    id: "cyber-security",
    name: { en: "Cyber Security", ar: "الأمن السيبراني" },
    summary: {
      en: "Network defense, cryptography and secure systems design.",
      ar: "الدفاع الشبكي والتشفير وتصميم الأنظمة الآمنة.",
    },
    description: {
      en: "Focused study of network defense, cryptography, secure systems design and the practices used to protect real infrastructure.",
      ar: "دراسة مركزة في الدفاع الشبكي والتشفير وتصميم الأنظمة الآمنة والممارسات المستخدمة لحماية البنية التحتية الحقيقية.",
    },
  },
  {
    id: "artificial-intelligence",
    name: { en: "Artificial Intelligence", ar: "الذكاء الاصطناعي" },
    summary: {
      en: "Machine learning, data systems and intelligent applications.",
      ar: "تعلم الآلة وأنظمة البيانات والتطبيقات الذكية.",
    },
    description: {
      en: "Covers machine learning, data-driven systems and the math and engineering behind building intelligent applications responsibly.",
      ar: "يغطي تعلم الآلة والأنظمة القائمة على البيانات والرياضيات والهندسة وراء بناء تطبيقات ذكية بمسؤولية.",
    },
  },
];

function getDemoMajors() {
  return DEMO_MAJORS;
}

function getDemoMajorById(id) {
  return DEMO_MAJORS.find((m) => m.id === id) || null;
}

function majorCardHTML(major, lang) {
  const t = window.ICC_I18N.t;
  return `
    <article class="major-card">
      <div class="major-card__head">
        <h3>${major.name[lang]}</h3>
        <span class="tag tag--demo">${t("demo_label", lang)}</span>
      </div>
      <p>${major.summary[lang]}</p>
      <div class="major-card__foot">
        <span class="tag">${major.id}</span>
        <a class="btn btn--ghost" href="major.html?id=${encodeURIComponent(major.id)}">${t("view_major", lang)} →</a>
      </div>
    </article>
  `;
}

function renderFeaturedMajors() {
  const mount = document.querySelector("[data-featured-majors]");
  if (!mount) return;
  const lang = window.ICC_I18N.getStoredLang();
  mount.innerHTML = getDemoMajors()
    .map((m) => majorCardHTML(m, lang))
    .join("");
}

function renderMajorsGrid() {
  const mount = document.querySelector("[data-majors-grid]");
  if (!mount) return;
  const lang = window.ICC_I18N.getStoredLang();
  mount.innerHTML = getDemoMajors()
    .map((m) => majorCardHTML(m, lang))
    .join("");
}

function getMajorIdFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id") || params.get("major");
}

function renderMajorHeader() {
  const mount = document.querySelector("[data-major-header]");
  if (!mount) return;

  const lang = window.ICC_I18N.getStoredLang();
  const t = window.ICC_I18N.t;
  const id = getMajorIdFromURL();
  const major = id ? getDemoMajorById(id) : getDemoMajors()[0];

  if (!major) {
    mount.innerHTML = `
      <div class="state state--error" role="alert">
        <div class="state__icon">⚠</div>
        <strong>${t("state_error_title", lang)}</strong>
        <p>${t("state_error_body", lang)}</p>
      </div>
    `;
    document.title = "ICC — Major not found";
    return;
  }

  mount.querySelector("[data-major-name]").textContent = major.name[lang];
  mount.querySelector("[data-major-desc]").textContent = major.description[lang];
  mount.querySelector("[data-major-id]").textContent = major.id;
  document.title = `${major.name[lang]} — ICC`;
}

function rerenderOnLanguageChange() {
  document.addEventListener("icc:languagechange", () => {
    renderFeaturedMajors();
    renderMajorsGrid();
    renderMajorHeader();
    if (window.ICC_SUBJECTS && window.ICC_SUBJECTS.rerender) {
      window.ICC_SUBJECTS.rerender();
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  renderFeaturedMajors();
  renderMajorsGrid();
  renderMajorHeader();
  rerenderOnLanguageChange();
});

window.ICC_MAJORS = { getDemoMajors, getDemoMajorById, getMajorIdFromURL };
