/**
 * content-admin.js — admin/content.html
 * -----------------------------------------------------------------------
 * PHASE 7 (Part 2) — centralized management of every editable string on
 * the public website.
 *
 * ==========================================================================
 * THE GOAL: NOBODY EDITS HTML TO CHANGE A WORD
 * ==========================================================================
 * Navbar labels, hero copy, section headings, search text, empty states,
 * error messages, CTA text, footer copy and contact details — all of it is
 * here, grouped the way an admin thinks about the site rather than the way
 * the HTML happens to be ordered (see CONTENT_GROUPS in js/cms-schema.js).
 *
 * ==========================================================================
 * EMPTY MEANS "USE THE BUILT-IN TEXT"
 * ==========================================================================
 * Each field shows the shipped default from js/language.js as its
 * placeholder, and leaving it blank means exactly that default is used.
 *
 * This is the property that makes the CMS safe to adopt gradually. If a
 * blank field meant "blank this element", then opening this screen and
 * saving once would wipe every string on the site that hadn't been typed
 * into — which is a trap, not a feature. Instead an admin can fill in the
 * six strings they care about and the other sixty keep working.
 *
 * The placeholder also answers the question the admin actually has, which
 * is "what does this field currently say on the site?" — without it, a
 * screen of empty inputs labelled `state_error_body` is unusable.
 * ------------------------------------------------------------------------ */

import { protectAdminPage } from "./admin-guard.js";
import { createCmsController, escapeHTML } from "./cms-admin.js";
import {
  CMS_DOCS,
  CONTENT_GROUPS,
  CONTENT_FIELD_KEYS,
  fallbackKeyFor,
  normalizeContent,
} from "../cms-schema.js";

const UI = () => window.ICC_ADMIN_UI;
function lang() {
  return (window.ICC_I18N && window.ICC_I18N.getStoredLang()) || "en";
}
const T = (key) => window.ICC_I18N.t(key, lang());

let cms = null;
let activeGroup = CONTENT_GROUPS[0].key;

/** The shipped default for a field, in a given language — used as placeholder. */
function defaultFor(fieldKey, language) {
  const i18nKey = fallbackKeyFor(fieldKey);
  if (!i18nKey || !window.ICC_I18N) return "";
  const dict = window.ICC_I18N.translations[language] || {};
  return dict[i18nKey] || "";
}

/* ==================================================================== */
/* Controller bridge                                                    */
/* ==================================================================== */

function readValues() {
  const out = {};
  CONTENT_FIELD_KEYS.forEach((key) => {
    const en = document.querySelector(`[name="${key}_en"]`);
    const ar = document.querySelector(`[name="${key}_ar"]`);
    const enVal = en ? en.value.trim() : "";
    const arVal = ar ? ar.value.trim() : "";
    // Only store fields that actually have content, so the document stays
    // a record of what was overridden rather than a copy of every default.
    if (enVal || arVal) out[key] = { en: enVal, ar: arVal };
  });
  return out;
}

function writeValues(values) {
  const clean = normalizeContent(values);
  CONTENT_FIELD_KEYS.forEach((key) => {
    const en = document.querySelector(`[name="${key}_en"]`);
    const ar = document.querySelector(`[name="${key}_ar"]`);
    if (en) en.value = clean[key]?.en || "";
    if (ar) ar.value = clean[key]?.ar || "";
  });
}

/* ==================================================================== */
/* Form building                                                        */
/* ==================================================================== */

function fieldHTML(field) {
  const multiline = field.multiline === true;
  const phEn = escapeHTML(defaultFor(field.key, "en"));
  const phAr = escapeHTML(defaultFor(field.key, "ar"));

  const input = (suffix, placeholder, dir) =>
    multiline
      ? `<textarea name="${field.key}_${suffix}" rows="3" placeholder="${placeholder}"${dir}></textarea>`
      : `<input type="text" name="${field.key}_${suffix}" placeholder="${placeholder}"${dir}>`;

  return `
    <div class="cms-content-field">
      <div class="cms-content-field__label">
        <strong>${escapeHTML(T(`cms_text_${field.key}`))}</strong>
        <code>${escapeHTML(field.key)}</code>
      </div>
      <div class="admin-form__row">
        <div class="form-field">
          <label>English</label>
          ${input("en", phEn, "")}
        </div>
        <div class="form-field">
          <label>العربية</label>
          ${input("ar", phAr, ' dir="rtl"')}
        </div>
      </div>
    </div>`;
}

function buildForm() {
  const tabs = document.querySelector("[data-content-tabs]");
  const mount = document.querySelector("[data-content-groups]");
  if (!tabs || !mount) return;

  tabs.innerHTML = CONTENT_GROUPS.map(
    (g) => `
    <button type="button" class="cms-tab${g.key === activeGroup ? " is-active" : ""}"
            data-group-tab="${g.key}" aria-pressed="${g.key === activeGroup}">
      ${escapeHTML(T(g.labelKey))}
    </button>`
  ).join("");

  // Every group is rendered but only one is shown. Keeping them all in the
  // DOM means readValues() sees every field regardless of which tab is
  // open — otherwise switching tabs before saving would drop the edits on
  // the tabs that happened to be hidden.
  mount.innerHTML = CONTENT_GROUPS.map(
    (g) => `
    <div class="cms-group" data-group="${g.key}"${g.key === activeGroup ? "" : " hidden"}>
      ${g.fields.map(fieldHTML).join("")}
    </div>`
  ).join("");
}

function showGroup(key) {
  activeGroup = key;
  document.querySelectorAll("[data-group]").forEach((el) => {
    el.hidden = el.getAttribute("data-group") !== key;
  });
  document.querySelectorAll("[data-group-tab]").forEach((btn) => {
    const active = btn.getAttribute("data-group-tab") === key;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", String(active));
  });
}

function wire() {
  document.querySelector("[data-content-tabs]")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-group-tab]");
    if (btn) showGroup(btn.getAttribute("data-group-tab"));
  });

  document.querySelector("[data-content-form]")?.addEventListener("submit", (e) => e.preventDefault());
}

document.addEventListener("DOMContentLoaded", () => {
  protectAdminPage("content", async (_user, profile) => {
    buildForm();
    wire();

    cms = createCmsController({
      docId: CMS_DOCS.CONTENT,
      profile,
      read: readValues,
      write: writeValues,
    });

    cms.wireToolbar();
    cms.watchForm("[data-content-form]");

    if (!cms.mayEdit) {
      document
        .querySelectorAll("[data-content-form] input, [data-content-form] textarea")
        .forEach((el) => el.setAttribute("readonly", ""));
    }

    try {
      await cms.load();
    } catch (err) {
      console.error("[ICC Admin] Failed to load content config:", err);
      UI().errorToast(T("admin_error_generic"));
    }

    // Placeholders show the shipped defaults, which are language-specific,
    // so the form is rebuilt on a language switch and refilled.
    document.addEventListener("icc:languagechange", () => {
      const current = readValues();
      buildForm();
      showGroup(activeGroup);
      writeValues(current);
      cms.renderStatus();
    });
  });
});
