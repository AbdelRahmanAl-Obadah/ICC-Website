/**
 * settings-admin.js — admin/settings.html
 * -----------------------------------------------------------------------
 * PHASE 7 (Part 2) — global settings, organised into the six groups the
 * brief asks for: General, Localization, SEO, Social, Contact and
 * Maintenance.
 *
 * The groups and their field types are declared once in SETTINGS_GROUPS
 * (js/cms-schema.js) and the form is generated from that declaration, so
 * adding a setting is one entry there rather than an input here, a reader
 * there, a validator somewhere else, and a normalizer on the public side
 * that someone forgets.
 *
 * ==========================================================================
 * VALIDATION
 * ==========================================================================
 * URL fields go through the same allow-list as navigation links — social
 * links and the OG image end up in hrefs and meta tags on public pages, so
 * they get no more trust than a nav item does. Selects are constrained to
 * their declared options and booleans are coerced, so a malformed document
 * cannot produce an undefined setting on the public site.
 *
 * ==========================================================================
 * MAINTENANCE MODE IS A NOTICE, NOT A GATE
 * ==========================================================================
 * The warning shown beside that toggle says so plainly. This is a static
 * site with no server-side gate: a "maintenance wall" drawn in JavaScript
 * stops nobody who can open developer tools. Presenting it as access
 * control would be a false assurance, so the setting shows a clear banner
 * and the admin is told exactly that.
 * ------------------------------------------------------------------------ */

import { protectAdminPage } from "./admin-guard.js";
import { createCmsController, escapeHTML } from "./cms-admin.js";
import { CMS_DOCS, SETTINGS_GROUPS, normalizeSettings, isSafeUrl } from "../cms-schema.js";

const UI = () => window.ICC_ADMIN_UI;
function lang() {
  return (window.ICC_I18N && window.ICC_I18N.getStoredLang()) || "en";
}
const T = (key) => window.ICC_I18N.t(key, lang());

let cms = null;
let activeGroup = SETTINGS_GROUPS[0].key;

function fieldName(group, field) {
  return `${group}__${field}`;
}

/* ==================================================================== */
/* Controller bridge                                                    */
/* ==================================================================== */

function readValues() {
  const out = {};
  SETTINGS_GROUPS.forEach((group) => {
    out[group.key] = {};
    group.fields.forEach((field) => {
      const el = document.querySelector(`[name="${fieldName(group.key, field.key)}"]`);
      if (!el) return;
      out[group.key][field.key] = field.type === "bool" ? el.checked : el.value;
    });
  });
  // normalizeSettings applies the URL allow-list, constrains selects and
  // coerces booleans — the same function the public site runs.
  return normalizeSettings(out);
}

function writeValues(values) {
  const clean = normalizeSettings(values);
  SETTINGS_GROUPS.forEach((group) => {
    group.fields.forEach((field) => {
      const el = document.querySelector(`[name="${fieldName(group.key, field.key)}"]`);
      if (!el) return;
      const value = clean[group.key]?.[field.key];
      if (field.type === "bool") el.checked = value === true;
      else el.value = value ?? "";
    });
  });
}

/* ==================================================================== */
/* Form building                                                        */
/* ==================================================================== */

function fieldHTML(group, field) {
  const name = fieldName(group.key, field.key);
  const label = escapeHTML(T(`set_${field.key}`));
  const hintKey = `set_${field.key}_hint`;
  const hint = T(hintKey);
  const hintHTML = hint !== hintKey ? `<p class="hint">${escapeHTML(hint)}</p>` : "";

  switch (field.type) {
    case "bool":
      return `
        <div class="form-field" data-field="${name}">
          <span class="form-check">
            <input type="checkbox" id="s_${name}" name="${name}">
            <label for="s_${name}">${label}</label>
          </span>
          ${hintHTML}
        </div>`;

    case "select":
      return `
        <div class="form-field" data-field="${name}">
          <label for="s_${name}">${label}</label>
          <select id="s_${name}" name="${name}">
            ${field.options
              .map((o) => `<option value="${escapeHTML(o)}">${escapeHTML(T(`set_opt_${o}`))}</option>`)
              .join("")}
          </select>
          ${hintHTML}
        </div>`;

    case "textarea":
      return `
        <div class="form-field" data-field="${name}">
          <label for="s_${name}">${label}</label>
          <textarea id="s_${name}" name="${name}" rows="3"></textarea>
          <p class="form-field__error"></p>
          ${hintHTML}
        </div>`;

    default:
      return `
        <div class="form-field" data-field="${name}">
          <label for="s_${name}">${label}</label>
          <input type="${field.type === "email" ? "email" : "text"}" id="s_${name}" name="${name}"
                 ${field.type === "url" ? 'placeholder="https://…"' : ""}>
          <p class="form-field__error"></p>
          ${hintHTML}
        </div>`;
  }
}

function buildForm() {
  const tabs = document.querySelector("[data-settings-tabs]");
  const mount = document.querySelector("[data-settings-groups]");
  if (!tabs || !mount) return;

  tabs.innerHTML = SETTINGS_GROUPS.map(
    (g) => `
    <button type="button" class="cms-tab${g.key === activeGroup ? " is-active" : ""}"
            data-group-tab="${g.key}" aria-pressed="${g.key === activeGroup}">
      ${escapeHTML(T(g.labelKey))}
    </button>`
  ).join("");

  // All groups stay in the DOM; only one is visible. Otherwise switching
  // tabs before saving would drop the edits on the hidden ones.
  mount.innerHTML = SETTINGS_GROUPS.map(
    (g) => `
    <div class="cms-group" data-group="${g.key}"${g.key === activeGroup ? "" : " hidden"}>
      ${
        g.key === "maintenance"
          ? `<div class="admin-alert admin-alert--info">${escapeHTML(T("set_maintenance_notice"))}</div>`
          : ""
      }
      <div class="appr-grid">${g.fields.map((f) => fieldHTML(g, f)).join("")}</div>
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

/* ==================================================================== */
/* Validation                                                           */
/* ==================================================================== */

function validate() {
  const form = document.querySelector("[data-settings-form]");
  UI().clearAllErrors(form);
  let ok = true;
  let firstBadGroup = null;

  SETTINGS_GROUPS.forEach((group) => {
    group.fields.forEach((field) => {
      const name = fieldName(group.key, field.key);
      const el = form.elements[name];
      if (!el) return;
      const wrap = form.querySelector(`[data-field="${name}"]`);

      if (field.type === "url" && !isSafeUrl(el.value)) {
        UI().setFieldError(wrap, T("cms_invalid_url"));
        ok = false;
        if (!firstBadGroup) firstBadGroup = group.key;
      }

      if (field.type === "email" && el.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value.trim())) {
        UI().setFieldError(wrap, T("set_invalid_email"));
        ok = false;
        if (!firstBadGroup) firstBadGroup = group.key;
      }
    });
  });

  // Jump to the tab holding the problem — an error on a hidden tab is an
  // error the admin cannot see or fix.
  if (firstBadGroup) showGroup(firstBadGroup);
  return ok;
}

function wire() {
  document.querySelector("[data-settings-tabs]")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-group-tab]");
    if (btn) showGroup(btn.getAttribute("data-group-tab"));
  });

  document.querySelector("[data-settings-form]")?.addEventListener("submit", (e) => e.preventDefault());

  ["[data-cms-save]", "[data-cms-publish]"].forEach((sel) => {
    document.querySelector(sel)?.addEventListener(
      "click",
      (e) => {
        if (!validate()) {
          e.stopImmediatePropagation();
          e.preventDefault();
          UI().errorToast(T("set_fix_errors"));
        }
      },
      true
    );
  });
}

document.addEventListener("DOMContentLoaded", () => {
  protectAdminPage("settings", async (_user, profile) => {
    buildForm();
    wire();

    cms = createCmsController({
      docId: CMS_DOCS.SETTINGS,
      profile,
      read: readValues,
      write: writeValues,
    });

    cms.wireToolbar();
    cms.watchForm("[data-settings-form]");

    try {
      await cms.load();
    } catch (err) {
      console.error("[ICC Admin] Failed to load settings config:", err);
      UI().errorToast(T("admin_error_generic"));
    }

    document.addEventListener("icc:languagechange", () => {
      const current = readValues();
      buildForm();
      showGroup(activeGroup);
      writeValues(current);
      cms.renderStatus();
    });
  });
});
