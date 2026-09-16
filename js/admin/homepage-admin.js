/**
 * homepage-admin.js — admin/homepage.html
 * -----------------------------------------------------------------------
 * PHASE 7 (Part 2) — the Homepage CMS.
 *
 * ==========================================================================
 * SECTIONS, NOT FIELDS
 * ==========================================================================
 * The Phase 5 version of this screen was a fixed form: one input per known
 * homepage slot. That works right up until someone wants a second
 * announcements block, or wants the statistics band gone for a term — at
 * which point it needs a developer, which is precisely what a CMS exists
 * to avoid.
 *
 * So the homepage is now an ORDERED LIST of section records. An admin can
 * add, remove, reorder, hide and edit sections, and each section type
 * declares which fields it actually uses (see SECTION_TYPES in
 * js/cms-schema.js) so a CTA doesn't present eight inputs that do nothing.
 *
 * ==========================================================================
 * ADDITIVE ON THE PUBLIC SITE
 * ==========================================================================
 * Sections built here render into a dedicated mount in index.html; they do
 * not replace the hand-built homepage. Turning the CMS on therefore cannot
 * blank the homepage, and turning it off cannot either. An admin who wants
 * to replace a shipped section does so deliberately rather than having it
 * disappear as a side effect of publishing their first block.
 * ------------------------------------------------------------------------ */

import { protectAdminPage } from "./admin-guard.js";
import { createCmsController, escapeHTML } from "./cms-admin.js";
import {
import { icon } from "../icons.js";
  CMS_DOCS,
  SECTION_TYPES,
  getSectionType,
  blankSection,
  BILINGUAL_SECTION_FIELDS,
  URL_SECTION_FIELDS,
  normalizeHomepage,
  isSafeUrl,
} from "../cms-schema.js";

const UI = () => window.ICC_ADMIN_UI;
function lang() {
  return (window.ICC_I18N && window.ICC_I18N.getStoredLang()) || "en";
}
const T = (key) => window.ICC_I18N.t(key, lang());

let cms = null;

/** Working copy. The form is rebuilt from this, never parsed back out of the DOM. */
let sections = [];

/** Which section is expanded — collapsed by default so a long page stays scannable. */
let expandedId = null;

/* ==================================================================== */
/* Read / write for the controller                                      */
/* ==================================================================== */

function readValues() {
  return { sections: sections.map((s, i) => ({ ...s, displayOrder: i })) };
}

function writeValues(values) {
  sections = normalizeHomepage(values);
  render();
}

/* ==================================================================== */
/* Field rendering                                                      */
/* ==================================================================== */

function fieldLabel(field) {
  return T(`cms_field_${field}`);
}

function bilingualFieldHTML(section, field) {
  const value = section[field] || { en: "", ar: "" };
  const multiline = field === "description";
  const input = (langKey, dir) =>
    multiline
      ? `<textarea rows="3" data-sec-field="${field}.${langKey}"${dir}>${escapeHTML(value[langKey] || "")}</textarea>`
      : `<input type="text" data-sec-field="${field}.${langKey}" value="${escapeHTML(value[langKey] || "")}"${dir}>`;

  return `
    <div class="admin-form__row">
      <div class="form-field">
        <label>${fieldLabel(field)} (EN)</label>
        ${input("en", "")}
      </div>
      <div class="form-field">
        <label>${fieldLabel(field)} (AR)</label>
        ${input("ar", ' dir="rtl"')}
      </div>
    </div>`;
}

function urlFieldHTML(section, field) {
  return `
    <div class="form-field" data-field="${field}">
      <label>${fieldLabel(field)}</label>
      <input type="text" data-sec-field="${field}" value="${escapeHTML(section[field] || "")}"
             placeholder="${field === "image" ? "https://…" : "majors.html"}">
      <p class="form-field__error"></p>
    </div>`;
}

/**
 * The repeatable item list, used by the features and statistics sections.
 * Each item is a label/value pair, both bilingual — a statistic is "120+"
 * plus "Active members", and both halves need translating.
 */
function itemsFieldHTML(section) {
  const items = Array.isArray(section.items) ? section.items : [];
  return `
    <fieldset class="admin-fieldset">
      <legend>${T("cms_field_items")}</legend>
      <p class="hint">${T("cms_items_hint")}</p>
      <div data-items-list>
        ${items
          .map(
            (item, i) => `
          <div class="cms-item-row" data-item-index="${i}">
            <input type="text" data-item-field="value.en" value="${escapeHTML(item.value?.en || "")}"
                   placeholder="${T("cms_item_value")} (EN)">
            <input type="text" data-item-field="value.ar" dir="rtl" value="${escapeHTML(item.value?.ar || "")}"
                   placeholder="${T("cms_item_value")} (AR)">
            <input type="text" data-item-field="label.en" value="${escapeHTML(item.label?.en || "")}"
                   placeholder="${T("cms_item_label")} (EN)">
            <input type="text" data-item-field="label.ar" dir="rtl" value="${escapeHTML(item.label?.ar || "")}"
                   placeholder="${T("cms_item_label")} (AR)">
            <button type="button" class="icon-btn icon-btn--danger" data-remove-item="${i}"
                    title="${T("admin_delete")}">${icon("trash")}</button>
          </div>`
          )
          .join("") || `<p class="hint">${T("cms_no_items")}</p>`}
      </div>
      <button type="button" class="btn btn--outline btn--sm" data-add-item>${T("cms_add_item")}</button>
    </fieldset>`;
}

function sectionBodyHTML(section) {
  const def = getSectionType(section.type);
  if (!def) return "";

  return def.fields
    .map((field) => {
      if (field === "items") return itemsFieldHTML(section);
      if (URL_SECTION_FIELDS.includes(field)) return urlFieldHTML(section, field);
      if (BILINGUAL_SECTION_FIELDS.includes(field)) return bilingualFieldHTML(section, field);
      return "";
    })
    .join("");
}

function sectionCardHTML(section, index) {
  const def = getSectionType(section.type);
  const expanded = expandedId === section.id;
  const title = section.title?.[lang()] || section.title?.en || T(def.labelKey);

  return `
    <article class="cms-card${expanded ? " is-open" : ""}" data-section-id="${escapeHTML(section.id)}">
      <header class="cms-card__head">
        <button type="button" class="cms-card__toggle" data-toggle aria-expanded="${expanded}">
          <span class="cms-card__type">${escapeHTML(T(def.labelKey))}</span>
          <span class="cms-card__title">${escapeHTML(title)}</span>
        </button>
        <div class="cms-card__actions">
          <span class="badge ${section.visible ? "badge--active" : "badge--inactive"}">
            ${section.visible ? T("cms_visible") : T("cms_hidden")}
          </span>
          <button type="button" class="icon-btn" data-move="up" ${index === 0 ? "disabled" : ""}
                  aria-label="${T("admin_move_up")}">${icon("arrow-up")}</button>
          <button type="button" class="icon-btn" data-move="down" ${index === sections.length - 1 ? "disabled" : ""}
                  aria-label="${T("admin_move_down")}">${icon("arrow-down")}</button>
          <button type="button" class="icon-btn" data-visibility
                  title="${section.visible ? T("cms_hide") : T("cms_show")}">${section.visible ? icon("pause") : icon("play")}</button>
          <button type="button" class="icon-btn icon-btn--danger" data-remove
                  title="${T("admin_delete")}">${icon("trash")}</button>
        </div>
      </header>
      ${expanded ? `<div class="cms-card__body">${sectionBodyHTML(section)}</div>` : ""}
    </article>`;
}

function render() {
  const mount = document.querySelector("[data-sections-list]");
  if (!mount) return;

  if (!sections.length) {
    mount.innerHTML = UI().stateHTML("empty", {
      title: T("cms_home_empty_title"),
      body: T("cms_home_empty_body"),
    });
    return;
  }

  mount.innerHTML = sections.map((s, i) => sectionCardHTML(s, i)).join("");
}

/* ==================================================================== */
/* Editing                                                              */
/* ==================================================================== */

function sectionById(id) {
  return sections.find((s) => s.id === id) || null;
}

/** Write a dotted path ("title.en") into a section object. */
function setPath(target, path, value) {
  const parts = path.split(".");
  let node = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (typeof node[parts[i]] !== "object" || node[parts[i]] === null) node[parts[i]] = {};
    node = node[parts[i]];
  }
  node[parts[parts.length - 1]] = value;
}

/**
 * Field edits are captured on input and written straight into the working
 * copy — no separate "apply" step, so the reorder and visibility controls
 * can never operate on stale values. The form is only re-rendered when the
 * structure changes, so typing never costs a re-render or moves the caret.
 */
function wireList() {
  const mount = document.querySelector("[data-sections-list]");

  mount.addEventListener("input", (e) => {
    const card = e.target.closest("[data-section-id]");
    if (!card) return;
    const section = sectionById(card.getAttribute("data-section-id"));
    if (!section) return;

    const fieldPath = e.target.getAttribute("data-sec-field");
    if (fieldPath) {
      setPath(section, fieldPath, e.target.value);
      cms.renderStatus();
      return;
    }

    const itemField = e.target.getAttribute("data-item-field");
    if (itemField) {
      const row = e.target.closest("[data-item-index]");
      const idx = Number(row.getAttribute("data-item-index"));
      if (!Array.isArray(section.items)) section.items = [];
      if (!section.items[idx]) section.items[idx] = { label: {}, value: {} };
      setPath(section.items[idx], itemField, e.target.value);
      cms.renderStatus();
    }
  });

  mount.addEventListener("click", async (e) => {
    const card = e.target.closest("[data-section-id]");
    if (!card) return;
    const id = card.getAttribute("data-section-id");
    const section = sectionById(id);
    if (!section) return;
    const index = sections.findIndex((s) => s.id === id);

    if (e.target.closest("[data-toggle]")) {
      expandedId = expandedId === id ? null : id;
      render();
      return;
    }

    const move = e.target.closest("[data-move]");
    if (move) {
      const dir = move.getAttribute("data-move");
      const target = dir === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= sections.length) return;
      sections.splice(target, 0, sections.splice(index, 1)[0]);
      render();
      cms.renderStatus();
      return;
    }

    if (e.target.closest("[data-visibility]")) {
      section.visible = !section.visible;
      render();
      cms.renderStatus();
      return;
    }

    if (e.target.closest("[data-remove]")) {
      const ok = await UI().confirmDialog({
        title: T("cms_remove_section_title"),
        message: T("cms_remove_section_msg"),
        confirmLabel: T("admin_delete"),
        danger: true,
      });
      if (!ok) return;
      sections.splice(index, 1);
      if (expandedId === id) expandedId = null;
      render();
      cms.renderStatus();
      return;
    }

    if (e.target.closest("[data-add-item]")) {
      if (!Array.isArray(section.items)) section.items = [];
      section.items.push({ label: { en: "", ar: "" }, value: { en: "", ar: "" } });
      render();
      cms.renderStatus();
      return;
    }

    const removeItem = e.target.closest("[data-remove-item]");
    if (removeItem) {
      section.items.splice(Number(removeItem.getAttribute("data-remove-item")), 1);
      render();
      cms.renderStatus();
    }
  });
}

/* ==================================================================== */
/* Adding sections                                                      */
/* ==================================================================== */

function openAddSection() {
  const body = document.createElement("div");
  body.innerHTML = `
    <p class="hint">${T("cms_add_section_hint")}</p>
    <div class="cms-type-grid">
      ${SECTION_TYPES.map(
        (t) => `
        <button type="button" class="cms-type" data-type="${t.key}">
          <strong>${escapeHTML(T(t.labelKey))}</strong>
          <span>${escapeHTML(T(`cms_section_${t.key}_desc`))}</span>
        </button>`
      ).join("")}
    </div>`;

  body.querySelectorAll("[data-type]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const section = blankSection(btn.getAttribute("data-type"), sections.length);
      sections.push(section);
      expandedId = section.id; // open it immediately — it's empty and needs filling
      UI().closeModal();
      render();
      cms.renderStatus();
    });
  });

  UI().openModal({ title: T("cms_add_section"), bodyEl: body });
}

/* ==================================================================== */
/* Validation                                                           */
/* ==================================================================== */

/**
 * Check every URL before anything is written.
 *
 * safeUrl() would silently drop an unsafe value on normalize, which is the
 * right behaviour for the public site but the wrong feedback for an admin:
 * they would save, see the field empty on reload, and have no idea why. So
 * the form says so explicitly instead.
 */
function validate() {
  let ok = true;
  let firstBad = null;

  sections.forEach((section) => {
    const def = getSectionType(section.type);
    if (!def) return;
    def.fields.forEach((field) => {
      if (!URL_SECTION_FIELDS.includes(field)) return;
      if (!isSafeUrl(section[field])) {
        ok = false;
        if (!firstBad) firstBad = section.id;
      }
    });
  });

  if (!ok) {
    expandedId = firstBad;
    render();
    UI().errorToast(T("cms_invalid_url"));
  }
  return ok;
}

function wireToolbar() {
  document.querySelector("[data-add-section]")?.addEventListener("click", (e) => {
    e.preventDefault();
    if (!cms.mayEdit) {
      UI().errorToast(T("err_no_edit"));
      return;
    }
    openAddSection();
  });

  ["[data-cms-save]", "[data-cms-publish]"].forEach((sel) => {
    document.querySelector(sel)?.addEventListener(
      "click",
      (e) => {
        if (!validate()) {
          e.stopImmediatePropagation();
          e.preventDefault();
        }
      },
      true
    );
  });
}

document.addEventListener("DOMContentLoaded", () => {
  protectAdminPage("homepage", async (_user, profile) => {
    cms = createCmsController({
      docId: CMS_DOCS.HOMEPAGE,
      profile,
      read: readValues,
      write: writeValues,
    });

    wireList();
    wireToolbar();
    cms.wireToolbar();

    if (!cms.mayEdit) {
      document.querySelector("[data-add-section]")?.setAttribute("disabled", "");
    }

    try {
      await cms.load();
    } catch (err) {
      console.error("[ICC Admin] Failed to load homepage config:", err);
      UI().errorToast(T("admin_error_generic"));
      render();
    }

    document.addEventListener("icc:languagechange", render);
  });
});
