/**
 * requirements.js
 * -----------------------------------------------------------------------
 * PHASE 3A: renders requirements.html from real Firestore data
 * (requirements collection, filtered by category). No hardcoded
 * requirement rows remain in requirements.html — this module owns all
 * three category blocks: free-elective, university, college.
 * ------------------------------------------------------------------------
 */

import { getRequirementsByCategory, FirestoreNotConfiguredError } from "./firestore.js";

const CATEGORIES = [
  { key: "free-elective", mount: "[data-requirements-electives]" },
  { key: "university", mount: "[data-requirements-university]" },
  { key: "college", mount: "[data-requirements-college]" },
];

function loadingHTML(lang) {
  const t = window.ICC_I18N.t;
  return `<div class="state state--loading" role="status"><div class="state__icon">…</div><p>${t(
    "state_loading",
    lang
  )}</p></div>`;
}

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

function requirementRowHTML(req, lang) {
  const t = window.ICC_I18N.t;
  const name = req.name?.[lang] || req.name?.en || req.code || "";
  const link = req.courseUrl
    ? `<a href="${req.courseUrl}" target="_blank" rel="noopener">${name}</a>`
    : name;
  const metaParts = [req.code, req.creditHours != null ? `${req.creditHours} ${t("credit_hours", lang)}` : null].filter(
    Boolean
  );
  return `
    <div class="requirement-row">
      <span class="requirement-row__name">${link}</span>
      <span class="requirement-row__meta">${metaParts.join(" · ")}</span>
    </div>
  `;
}

async function renderCategory({ key, mount }) {
  const el = document.querySelector(mount);
  if (!el) return;

  const lang = window.ICC_I18N.getStoredLang();
  el.innerHTML = loadingHTML(lang);

  try {
    const items = await getRequirementsByCategory(key);
    if (!items.length) {
      el.innerHTML = `<div class="requirement-list">${stateHTML("empty", lang, {
        title: window.ICC_I18N.t("requirements_empty_title", lang),
        body: window.ICC_I18N.t("requirements_empty_body", lang),
      })}</div>`;
      return;
    }
    el.innerHTML = `<div class="requirement-list">${items.map((r) => requirementRowHTML(r, lang)).join("")}</div>`;
  } catch (err) {
    console.error(`[ICC] Failed to load requirements (${key}):`, err);
    if (err instanceof FirestoreNotConfiguredError) {
      el.innerHTML = `<div class="requirement-list">${stateHTML("empty", lang, {
        title: window.ICC_I18N.t("requirements_empty_title", lang),
        body: window.ICC_I18N.t("requirements_empty_body", lang),
      })}</div>`;
    } else {
      el.innerHTML = `<div class="requirement-list">${stateHTML("error", lang)}</div>`;
    }
  }
}

function renderAll() {
  return Promise.all(CATEGORIES.map(renderCategory));
}

document.addEventListener("DOMContentLoaded", renderAll);
document.addEventListener("icc:languagechange", renderAll);
