/**
 * majors.js
 * -----------------------------------------------------------------------
 * PHASE 3A: renders majors from real Firestore data. No demo/hardcoded
 * academic data lives here anymore — if Firestore is empty, the UI shows
 * a proper empty state instead of fake majors.
 *
 * Loaded as a module (see majors.html / index.html / major.html), so it
 * can import directly from firestore.js.
 *
 * Every major document looks like (see firestore.js / Phase 3A schema):
 * {
 *   id,                 // Firestore doc id, used in major.html?id=...
 *   name: { en, ar },
 *   code, college,
 *   description: { en, ar },
 *   curriculumImageUrl,
 *   slug, active, displayOrder,
 * }
 * ------------------------------------------------------------------------
 */

import {
  getActiveMajors,
  getMajorById,
  FirestoreNotConfiguredError,
} from "./firestore.js";
import { normalizeDriveImageUrl } from "./drive-utils.js";

function getMajorIdFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id") || params.get("major");
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

function loadingHTML(lang) {
  const t = window.ICC_I18N.t;
  return `<div class="state state--loading" role="status"><div class="state__icon">…</div><p>${t(
    "state_loading",
    lang
  )}</p></div>`;
}

function majorCardHTML(major, lang) {
  const t = window.ICC_I18N.t;
  const name = major.name?.[lang] || major.name?.en || major.id;
  const description = major.description?.[lang] || major.description?.en || "";
  return `
    <article class="major-card">
      <div class="major-card__head">
        <h3>${name}</h3>
      </div>
      <p>${description}</p>
      <div class="major-card__foot">
        <span class="tag">${major.code || major.id}</span>
        <a class="btn btn--ghost" href="major.html?id=${encodeURIComponent(major.id)}">${t("view_major", lang)} →</a>
      </div>
    </article>
  `;
}

async function renderMajorsInto(selector) {
  const mount = document.querySelector(selector);
  if (!mount) return;

  const lang = window.ICC_I18N.getStoredLang();
  mount.innerHTML = loadingHTML(lang);

  try {
    const majors = await getActiveMajors();

    if (!majors.length) {
      mount.innerHTML = stateHTML("empty", lang, {
        title: window.ICC_I18N.t("majors_empty_title", lang),
        body: window.ICC_I18N.t("majors_empty_body", lang),
      });
      return;
    }

    mount.innerHTML = majors.map((m) => majorCardHTML(m, lang)).join("");
  } catch (err) {
    console.error("[ICC] Failed to load majors:", err);
    if (err instanceof FirestoreNotConfiguredError) {
      mount.innerHTML = stateHTML("empty", lang, {
        title: window.ICC_I18N.t("majors_empty_title", lang),
        body: window.ICC_I18N.t("majors_empty_body", lang),
      });
    } else {
      mount.innerHTML = stateHTML("error", lang);
    }
  }
}

function renderFeaturedMajors() {
  return renderMajorsInto("[data-featured-majors]");
}

function renderMajorsGrid() {
  return renderMajorsInto("[data-majors-grid]");
}

async function renderMajorHeader() {
  const mount = document.querySelector("[data-major-header]");
  if (!mount) return null;

  const lang = window.ICC_I18N.getStoredLang();
  const t = window.ICC_I18N.t;
  const id = getMajorIdFromURL();

  const nameEl = mount.querySelector("[data-major-name]");
  const descEl = mount.querySelector("[data-major-desc]");
  const idEl = mount.querySelector("[data-major-id]");
  if (nameEl) nameEl.textContent = t("state_loading", lang);
  if (descEl) descEl.textContent = "";

  if (!id) {
    if (nameEl) nameEl.textContent = t("state_error_title", lang);
    if (descEl) descEl.textContent = t("state_error_body", lang);
    document.title = "Major not found — ICC | GJU";
    return null;
  }

  let major = null;
  try {
    major = await getMajorById(id);
  } catch (err) {
    console.error("[ICC] Failed to load major:", err);
    if (nameEl) nameEl.textContent = t("state_error_title", lang);
    if (descEl) descEl.textContent = t("state_error_body", lang);
    document.title = "Major not found — ICC | GJU";
    return null;
  }

  if (!major) {
    if (nameEl) nameEl.textContent = t("major_not_found_title", lang);
    if (descEl) descEl.textContent = t("major_not_found_body", lang);
    if (idEl) idEl.textContent = id;
    document.title = "Major not found — ICC | GJU";
    return null;
  }

  const name = major.name?.[lang] || major.name?.en || major.id;
  const description = major.description?.[lang] || major.description?.en || "";

  if (nameEl) nameEl.textContent = name;
  if (descEl) descEl.textContent = description;
  if (idEl) idEl.textContent = major.code || major.id;
  updatePageMetaForMajor(name, description, major.id);

  renderCurriculumImage(major, name, lang, t);

  return major;
}

/**
 * Keeps <title>, meta description, canonical and Open Graph tags in sync
 * with the major actually being viewed, so each major has its own
 * meaningful, shareable, indexable page instead of the generic static
 * fallback baked into major.html's <head>.
 */
function updatePageMetaForMajor(name, description, majorId) {
  const title = `${name} — ICC | GJU`;
  const desc = description
    ? description.slice(0, 160)
    : `Curriculum tree, semester plan and subjects for ${name} at ICC — GJU.`;
  const url = `https://icc-admins.web.app/major.html?id=${encodeURIComponent(majorId)}`;

  document.title = title;

  const setMeta = (selector, attr, value) => {
    const el = document.querySelector(selector);
    if (el) el.setAttribute(attr, value);
  };

  setMeta('meta[name="description"]', "content", desc);
  setMeta('link[rel="canonical"]', "href", url);
  setMeta('meta[property="og:title"]', "content", title);
  setMeta('meta[property="og:description"]', "content", desc);
  setMeta('meta[property="og:url"]', "content", url);
}

/**
 * PHASE 4A: curriculum image now accepts a direct image URL *or* a Google
 * Drive sharing URL (normalizeDriveImageUrl handles both — see
 * js/drive-utils.js). Falls back to the placeholder SVG when the field is
 * empty, and again if the URL turns out not to actually load (broken
 * link, private/unshared Drive file, etc.) so a bad admin-entered URL can
 * never break the page layout.
 */
function renderCurriculumImage(major, name, lang, t) {
  const frame = document.querySelector("[data-curriculum-frame]");
  if (!frame) return;
  const img = frame.querySelector("img");
  const note = document.querySelector("[data-curriculum-note]");
  if (!img) return;

  const showPlaceholder = (isError) => {
    img.src = "assets/images/curriculum-placeholder.svg";
    img.alt = t("major_curriculum_placeholder_alt", lang);
    frame.classList.toggle("curriculum__frame--broken", !!isError);
    if (note) {
      note.textContent = isError
        ? t("major_curriculum_broken", lang)
        : t("major_curriculum_note", lang);
    }
  };

  const rawUrl = (major.curriculumImageUrl || "").trim();
  if (!rawUrl) {
    showPlaceholder(false);
    return;
  }

  const resolvedUrl = normalizeDriveImageUrl(rawUrl);

  // Swap the src on a detached probe image first so a broken/blocked URL
  // never flashes onto the live page before falling back.
  const probe = new Image();
  probe.onload = () => {
    img.src = resolvedUrl;
    img.alt = t("major_curriculum_alt", lang).replace("{name}", name) || `${name} curriculum tree`;
    frame.classList.remove("curriculum__frame--broken");
    if (note) note.textContent = t("major_curriculum_note", lang);
  };
  probe.onerror = () => showPlaceholder(true);
  probe.src = resolvedUrl;
}

function rerenderOnLanguageChange() {
  document.addEventListener("icc:languagechange", async () => {
    await renderFeaturedMajors();
    await renderMajorsGrid();
    const major = await renderMajorHeader();
    if (window.ICC_SUBJECTS && window.ICC_SUBJECTS.rerender) {
      window.ICC_SUBJECTS.rerender(major?.id);
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  await renderFeaturedMajors();
  await renderMajorsGrid();
  const major = await renderMajorHeader();
  if (window.ICC_SUBJECTS && window.ICC_SUBJECTS.init) {
    window.ICC_SUBJECTS.init(major?.id);
  }
  rerenderOnLanguageChange();
});

window.ICC_MAJORS = { getMajorIdFromURL };
