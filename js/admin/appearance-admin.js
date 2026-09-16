/**
 * appearance-admin.js — admin/appearance.html
 * -----------------------------------------------------------------------
 * PHASE 7 (Part 2) — the visual design manager.
 *
 * ==========================================================================
 * WHAT IS AND ISN'T EXPOSED
 * ==========================================================================
 * Colours (validated hex), sizes (clamped numbers), and a fixed set of
 * component styles (enums). Nothing else. There is no free-form CSS box
 * and no custom-JavaScript field, and that is a deliberate refusal rather
 * than an omission: a text area whose contents are injected into a page
 * every visitor loads is a defacement and script-injection vector, and it
 * buys a convenience nobody asked for. Admins choose among looks defined
 * in css/appearance.css; the range of possible sites is set in reviewed
 * code, not in a database field.
 *
 * ==========================================================================
 * THE PREVIEW IS THE REAL RENDERER
 * ==========================================================================
 * The preview pane calls applyAppearance() from js/appearance.js — the
 * exact function the public site uses — against a scoped container. It is
 * not a mock-up maintained alongside the real thing.
 *
 * That matters because a separately-maintained preview drifts, and a
 * drifted preview is worse than none: it confidently shows an admin
 * something the site will not actually do. Sharing the renderer means the
 * preview cannot be wrong about anything the renderer handles, and any
 * future appearance option is previewable the moment it's supported.
 * ------------------------------------------------------------------------ */

import { protectAdminPage } from "./admin-guard.js";
import { createCmsController, escapeHTML } from "./cms-admin.js";
import { applyAppearance } from "../appearance-engine.js";
import {
  CMS_DOCS,
  APPEARANCE_DEFAULTS,
  APPEARANCE_OPTIONS,
  APPEARANCE_RANGES,
  normalizeAppearance,
  isHexColor,
  isSafeUrl,
} from "../cms-schema.js";

const UI = () => window.ICC_ADMIN_UI;
function lang() {
  return (window.ICC_I18N && window.ICC_I18N.getStoredLang()) || "en";
}
const T = (key) => window.ICC_I18N.t(key, lang());

let cms = null;

/* ==================================================================== */
/* Field groups — how the form is organised for a human                 */
/* ==================================================================== */

const COLOR_FIELDS = [
  ["color_primary", "appr_color_primary"],
  ["color_secondary", "appr_color_secondary"],
  ["color_accent", "appr_color_accent"],
  ["color_bg", "appr_color_bg"],
  ["color_surface", "appr_color_surface"],
  ["color_text", "appr_color_text"],
  ["color_text_soft", "appr_color_text_soft"],
  ["color_border", "appr_color_border"],
];

const SIZE_FIELDS = [
  ["radius", "appr_radius"],
  ["border_width", "appr_border_width"],
  ["container_width", "appr_container_width"],
  ["section_spacing", "appr_section_spacing"],
  ["font_scale", "appr_font_scale"],
];

const OPTION_FIELDS = [
  ["shadow_style", "appr_shadow_style"],
  ["button_style", "appr_button_style"],
  ["card_style", "appr_card_style"],
  ["header_style", "appr_header_style"],
  ["navbar_style", "appr_navbar_style"],
  ["footer_style", "appr_footer_style"],
  ["hero_style", "appr_hero_style"],
  ["font_pairing", "appr_font_pairing"],
  ["density", "appr_density"],
  ["color_mode", "appr_color_mode"],
];

const ASSET_FIELDS = [
  ["logo_url", "appr_logo_url"],
  ["logo_dark_url", "appr_logo_dark_url"],
  ["favicon_url", "appr_favicon_url"],
];

/* ==================================================================== */
/* Form building                                                        */
/* ==================================================================== */

function colorFieldHTML([name, labelKey]) {
  return `
    <div class="form-field appr-color" data-field="${name}">
      <label for="f_${name}">${T(labelKey)}</label>
      <div class="appr-color__row">
        <input type="color" id="f_${name}" name="${name}" value="${APPEARANCE_DEFAULTS[name]}">
        <input type="text" name="${name}_hex" class="appr-color__hex"
               value="${APPEARANCE_DEFAULTS[name]}" spellcheck="false" aria-label="${T(labelKey)} hex">
      </div>
      <p class="form-field__error"></p>
    </div>`;
}

function sizeFieldHTML([name, labelKey]) {
  const range = APPEARANCE_RANGES[name];
  return `
    <div class="form-field" data-field="${name}">
      <label for="f_${name}">${T(labelKey)} <span class="appr-value" data-value-for="${name}"></span></label>
      <input type="range" id="f_${name}" name="${name}"
             min="${range.min}" max="${range.max}" step="${range.step}"
             value="${APPEARANCE_DEFAULTS[name]}">
    </div>`;
}

function optionFieldHTML([name, labelKey]) {
  const options = APPEARANCE_OPTIONS[name] || [];
  return `
    <div class="form-field" data-field="${name}">
      <label for="f_${name}">${T(labelKey)}</label>
      <select id="f_${name}" name="${name}">
        ${options
          .map((o) => `<option value="${o}">${escapeHTML(T(`appr_opt_${o}`))}</option>`)
          .join("")}
      </select>
    </div>`;
}

function assetFieldHTML([name, labelKey]) {
  return `
    <div class="form-field" data-field="${name}">
      <label for="f_${name}">${T(labelKey)}</label>
      <input type="url" id="f_${name}" name="${name}" placeholder="https://…">
      <p class="form-field__error"></p>
    </div>`;
}

function buildForm() {
  const mount = document.querySelector("[data-appearance-fields]");
  if (!mount) return;

  mount.innerHTML = `
    <fieldset class="admin-fieldset">
      <legend>${T("appr_group_colors")}</legend>
      <p class="hint">${T("appr_colors_hint")}</p>
      <div class="appr-grid">${COLOR_FIELDS.map(colorFieldHTML).join("")}</div>
    </fieldset>

    <fieldset class="admin-fieldset">
      <legend>${T("appr_group_shape")}</legend>
      <div class="appr-grid">${SIZE_FIELDS.map(sizeFieldHTML).join("")}</div>
    </fieldset>

    <fieldset class="admin-fieldset">
      <legend>${T("appr_group_components")}</legend>
      <div class="appr-grid">${OPTION_FIELDS.map(optionFieldHTML).join("")}</div>
    </fieldset>

    <fieldset class="admin-fieldset">
      <legend>${T("appr_group_branding")}</legend>
      <p class="hint">${T("appr_branding_hint")}</p>
      <div class="appr-grid">${ASSET_FIELDS.map(assetFieldHTML).join("")}</div>
    </fieldset>`;
}

/* ==================================================================== */
/* Read / write                                                         */
/* ==================================================================== */

function form() {
  return document.querySelector("[data-appearance-form]");
}

function readForm() {
  const f = form();
  if (!f) return { ...APPEARANCE_DEFAULTS };
  const out = {};
  Object.keys(APPEARANCE_DEFAULTS).forEach((key) => {
    const field = f.elements[key];
    if (!field) {
      out[key] = APPEARANCE_DEFAULTS[key];
      return;
    }
    out[key] = field.type === "checkbox" ? field.checked : field.value;
  });
  // normalizeAppearance clamps, validates and fills gaps — the same
  // function the public site runs, so what's previewed is what would apply.
  return normalizeAppearance(out);
}

function writeForm(values) {
  const f = form();
  if (!f) return;
  const clean = normalizeAppearance(values);

  Object.entries(clean).forEach(([key, value]) => {
    const field = f.elements[key];
    if (field) field.value = value;
    // Keep the hex text box beside each colour swatch in step.
    const hex = f.elements[`${key}_hex`];
    if (hex) hex.value = value;
  });

  updateValueLabels();
  updatePreview();
}

/** Show the current number next to each slider — a slider alone tells you nothing. */
function updateValueLabels() {
  const values = readForm();
  Object.keys(APPEARANCE_RANGES).forEach((key) => {
    const label = document.querySelector(`[data-value-for="${key}"]`);
    if (label) label.textContent = `${values[key]}${APPEARANCE_RANGES[key].unit}`;
  });
}

/* ==================================================================== */
/* Live preview                                                         */
/* ==================================================================== */

/**
 * Apply the current form values to the preview container.
 *
 * Scoped to the container rather than the whole document on purpose: the
 * Admin Panel must keep its own appearance while you experiment, or a
 * mid-edit dark theme would make the form you're editing unreadable and
 * leave no obvious way back.
 */
function updatePreview() {
  const root = document.querySelector("[data-appearance-preview]");
  if (!root) return;
  applyAppearance(readForm(), root);
}

/* ==================================================================== */
/* Validation                                                           */
/* ==================================================================== */

function validate() {
  const f = form();
  UI().clearAllErrors(f);
  let ok = true;

  COLOR_FIELDS.forEach(([name]) => {
    const hex = f.elements[`${name}_hex`];
    if (hex && hex.value.trim() && !isHexColor(hex.value)) {
      UI().setFieldError(f.querySelector(`[data-field="${name}"]`), T("appr_invalid_hex"));
      ok = false;
    }
  });

  ASSET_FIELDS.forEach(([name]) => {
    const field = f.elements[name];
    if (field && !isSafeUrl(field.value)) {
      UI().setFieldError(f.querySelector(`[data-field="${name}"]`), T("cms_invalid_url"));
      ok = false;
    }
  });

  return ok;
}

/* ==================================================================== */
/* Wiring                                                               */
/* ==================================================================== */

function wireForm() {
  const f = form();

  // Colour swatch ⇄ hex box, in both directions, so an admin can paste a
  // brand hex or pick visually without the two disagreeing.
  COLOR_FIELDS.forEach(([name]) => {
    const picker = f.elements[name];
    const hex = f.elements[`${name}_hex`];
    if (!picker || !hex) return;

    picker.addEventListener("input", () => {
      hex.value = picker.value;
      updatePreview();
    });
    hex.addEventListener("input", () => {
      if (isHexColor(hex.value)) {
        picker.value = hex.value.trim().toLowerCase();
        updatePreview();
      }
    });
  });

  f.addEventListener("input", () => {
    updateValueLabels();
    updatePreview();
  });
  f.addEventListener("change", updatePreview);

  f.addEventListener("submit", (e) => e.preventDefault());

  // Reset restores the ICC identity exactly — the brand is always one
  // click away, however far an experiment has wandered.
  document.querySelector("[data-reset-btn]")?.addEventListener("click", async () => {
    const ok = await UI().confirmDialog({
      title: T("appr_reset_title"),
      message: T("appr_reset_msg"),
      confirmLabel: T("appr_reset"),
    });
    if (!ok) return;
    writeForm({ ...APPEARANCE_DEFAULTS });
    cms.renderStatus();
    UI().toast(T("appr_reset_done"), "info");
  });

  // Validate before either write reaches Firestore.
  ["[data-cms-save]", "[data-cms-publish]"].forEach((sel) => {
    const btn = document.querySelector(sel);
    if (!btn) return;
    btn.addEventListener(
      "click",
      (e) => {
        if (!validate()) {
          e.stopImmediatePropagation();
          e.preventDefault();
          UI().errorToast(T("appr_fix_errors"));
        }
      },
      true // capture, so this runs before the controller's own handler
    );
  });
}

document.addEventListener("DOMContentLoaded", () => {
  protectAdminPage("appearance", async (_user, profile) => {
    buildForm();

    cms = createCmsController({
      docId: CMS_DOCS.APPEARANCE,
      profile,
      read: readForm,
      write: writeForm,
      onChange: updatePreview,
    });

    wireForm();
    cms.wireToolbar();
    cms.watchForm("[data-appearance-form]");

    try {
      await cms.load();
    } catch (err) {
      console.error("[ICC Admin] Failed to load appearance config:", err);
      UI().errorToast(T("admin_error_generic"));
      writeForm({ ...APPEARANCE_DEFAULTS });
    }

    // Labels are language-dependent, so rebuild the form on a switch and
    // restore the values the admin had in progress.
    document.addEventListener("icc:languagechange", () => {
      const current = readForm();
      buildForm();
      wireForm();
      writeForm(current);
      cms.renderStatus();
    });
  });
});
