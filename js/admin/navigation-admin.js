/**
 * navigation-admin.js — admin/navigation.html
 * -----------------------------------------------------------------------
 * PHASE 7 (Part 2) — manages the primary navigation and the footer link
 * list, both stored in siteConfig/navigation.
 *
 * ==========================================================================
 * URL SAFETY IS THE POINT OF THIS SCREEN
 * ==========================================================================
 * Every value here ends up in an href on a page that every visitor loads.
 * `javascript:` in an href executes on click with full access to the page,
 * so links are checked against an ALLOW-LIST of schemes (http, https,
 * mailto, tel, plus site-relative paths) in safeUrl() — not a block-list
 * of bad ones.
 *
 * A block-list loses here. `javascript:` is only the obvious case; there
 * is also `data:text/html`, `vbscript:`, and the fact that browsers ignore
 * whitespace and control characters inside a scheme, so "java\tscript:"
 * still runs. Allowing only known-good schemes sidesteps that whole
 * category rather than racing it.
 *
 * The check happens three times, deliberately: in this form (so the admin
 * gets a real error message), in normalizeNavigation() when the public
 * site loads the config, and again in site-chrome.js when the anchor is
 * actually built. The first is feedback; the last two are the control.
 *
 * "Open in new tab" also sets rel="noopener noreferrer" on the public
 * side — without noopener, the opened page can reach back through
 * window.opener and navigate the tab it came from.
 * ------------------------------------------------------------------------ */

import { protectAdminPage } from "./admin-guard.js";
import { createCmsController, escapeHTML } from "./cms-admin.js";
import { CMS_DOCS, normalizeNavigation, isSafeUrl } from "../cms-schema.js";

const UI = () => window.ICC_ADMIN_UI;
function lang() {
  return (window.ICC_I18N && window.ICC_I18N.getStoredLang()) || "en";
}
const T = (key) => window.ICC_I18N.t(key, lang());

let cms = null;

/** Working copy: { primary: [...], footer: [...] }. */
let nav = { primary: [], footer: [] };

const MENUS = [
  { key: "primary", labelKey: "nav_menu_primary", hintKey: "nav_menu_primary_hint" },
  { key: "footer", labelKey: "nav_menu_footer", hintKey: "nav_menu_footer_hint" },
];

function newLink(order) {
  return {
    id: `nav_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    label: { en: "", ar: "" },
    url: "",
    newTab: false,
    active: true,
    displayOrder: order,
  };
}

/* ==================================================================== */
/* Controller bridge                                                    */
/* ==================================================================== */

function readValues() {
  return {
    primary: nav.primary.map((l, i) => ({ ...l, displayOrder: i })),
    footer: nav.footer.map((l, i) => ({ ...l, displayOrder: i })),
  };
}

function writeValues(values) {
  // normalizeNavigation drops links with no URL or no label, which would
  // make a half-typed row vanish under the admin's hands. So the raw
  // values are kept for editing and normalized only on the way out.
  nav = {
    primary: Array.isArray(values?.primary) ? values.primary.map(hydrate) : [],
    footer: Array.isArray(values?.footer) ? values.footer.map(hydrate) : [],
  };
  render();
}

function hydrate(link, i) {
  return {
    id: link?.id || `nav_${i}`,
    label: { en: link?.label?.en || "", ar: link?.label?.ar || "" },
    url: link?.url || "",
    newTab: link?.newTab === true,
    active: link?.active !== false,
    displayOrder: Number.isFinite(Number(link?.displayOrder)) ? Number(link.displayOrder) : i,
  };
}

/* ==================================================================== */
/* Rendering                                                            */
/* ==================================================================== */

function rowHTML(menu, link, index, total) {
  const badUrl = !isSafeUrl(link.url);
  return `
    <tr data-menu="${menu}" data-id="${escapeHTML(link.id)}"${badUrl ? ' class="is-invalid"' : ""}>
      <td>
        <div class="admin-order-cell">
          <button type="button" class="icon-btn" data-move="up" ${index === 0 ? "disabled" : ""}
                  aria-label="${T("admin_move_up")}">↑</button>
          <button type="button" class="icon-btn" data-move="down" ${index === total - 1 ? "disabled" : ""}
                  aria-label="${T("admin_move_down")}">↓</button>
        </div>
      </td>
      <td><input type="text" data-link-field="label.en" value="${escapeHTML(link.label.en)}"
                 placeholder="${T("nav_label_en")}"></td>
      <td><input type="text" dir="rtl" data-link-field="label.ar" value="${escapeHTML(link.label.ar)}"
                 placeholder="${T("nav_label_ar")}"></td>
      <td>
        <input type="text" data-link-field="url" value="${escapeHTML(link.url)}" placeholder="majors.html">
        ${badUrl ? `<span class="nav-url-error">${T("cms_invalid_url")}</span>` : ""}
      </td>
      <td class="nav-check">
        <input type="checkbox" data-link-field="newTab" ${link.newTab ? "checked" : ""}
               aria-label="${T("nav_new_tab")}">
      </td>
      <td class="nav-check">
        <input type="checkbox" data-link-field="active" ${link.active ? "checked" : ""}
               aria-label="${T("admin_field_active")}">
      </td>
      <td>
        <button type="button" class="icon-btn icon-btn--danger" data-remove
                title="${T("admin_delete")}">🗑</button>
      </td>
    </tr>`;
}

function menuHTML(menu) {
  const links = nav[menu.key] || [];
  return `
    <section class="admin-panel" data-menu-panel="${menu.key}">
      <div class="admin-panel__body">
        <div class="admin-panel__head">
          <h2>${T(menu.labelKey)}</h2>
          <p class="hint">${T(menu.hintKey)}</p>
        </div>

        ${
          links.length
            ? `<div class="admin-table-wrap">
                 <table class="admin-table nav-table">
                   <thead>
                     <tr>
                       <th><span>${T("admin_field_display_order")}</span></th>
                       <th><span>${T("nav_label_en")}</span></th>
                       <th><span>${T("nav_label_ar")}</span></th>
                       <th><span>${T("nav_url")}</span></th>
                       <th><span>${T("nav_new_tab")}</span></th>
                       <th><span>${T("admin_field_active")}</span></th>
                       <th><span>${T("admin_actions")}</span></th>
                     </tr>
                   </thead>
                   <tbody>
                     ${links.map((l, i) => rowHTML(menu.key, l, i, links.length)).join("")}
                   </tbody>
                 </table>
               </div>`
            : UI().stateHTML("empty", { title: T("nav_empty_title"), body: T("nav_empty_body") })
        }

        <button type="button" class="btn btn--outline btn--sm" data-add-link="${menu.key}">
          ${T("nav_add_link")}
        </button>
      </div>
    </section>`;
}

function render() {
  const mount = document.querySelector("[data-nav-mount]");
  if (!mount) return;
  mount.innerHTML = MENUS.map(menuHTML).join("");
}

/* ==================================================================== */
/* Editing                                                              */
/* ==================================================================== */

function findLink(menu, id) {
  return (nav[menu] || []).find((l) => l.id === id) || null;
}

function wire() {
  const mount = document.querySelector("[data-nav-mount]");

  mount.addEventListener("input", (e) => {
    const row = e.target.closest("tr[data-id]");
    if (!row) return;
    const link = findLink(row.getAttribute("data-menu"), row.getAttribute("data-id"));
    if (!link) return;

    const field = e.target.getAttribute("data-link-field");
    if (!field) return;

    if (field === "newTab" || field === "active") {
      link[field] = e.target.checked;
    } else if (field.startsWith("label.")) {
      link.label[field.split(".")[1]] = e.target.value;
    } else {
      link[field] = e.target.value;
      // Surface an unsafe URL as soon as it's typed, but don't re-render
      // on every keystroke — that would move the caret out of the field.
      const invalid = !isSafeUrl(link.url);
      row.classList.toggle("is-invalid", invalid);
    }
    cms.renderStatus();
  });

  mount.addEventListener("change", (e) => {
    if (e.target.type === "checkbox") cms.renderStatus();
  });

  mount.addEventListener("click", async (e) => {
    const addBtn = e.target.closest("[data-add-link]");
    if (addBtn) {
      const menu = addBtn.getAttribute("data-add-link");
      nav[menu].push(newLink(nav[menu].length));
      render();
      cms.renderStatus();
      return;
    }

    const row = e.target.closest("tr[data-id]");
    if (!row) return;
    const menu = row.getAttribute("data-menu");
    const id = row.getAttribute("data-id");
    const index = nav[menu].findIndex((l) => l.id === id);

    const move = e.target.closest("[data-move]");
    if (move) {
      const target = move.getAttribute("data-move") === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= nav[menu].length) return;
      nav[menu].splice(target, 0, nav[menu].splice(index, 1)[0]);
      render();
      cms.renderStatus();
      return;
    }

    if (e.target.closest("[data-remove]")) {
      const ok = await UI().confirmDialog({
        title: T("nav_remove_title"),
        message: T("nav_remove_msg"),
        confirmLabel: T("admin_delete"),
        danger: true,
      });
      if (!ok) return;
      nav[menu].splice(index, 1);
      render();
      cms.renderStatus();
    }
  });
}

/**
 * Refuse to save a link whose URL isn't safe or whose label is empty,
 * rather than letting normalizeNavigation drop it silently on the way to
 * Firestore. An admin who saves and finds a row has vanished has no way to
 * know why; an error that names the problem is the whole difference.
 */
function validate() {
  const problems = [];
  MENUS.forEach((menu) => {
    (nav[menu.key] || []).forEach((link) => {
      const hasLabel = link.label.en.trim() || link.label.ar.trim();
      if (!link.url.trim() && !hasLabel) return; // an untouched blank row is fine
      if (!isSafeUrl(link.url)) problems.push(T("cms_invalid_url"));
      else if (!link.url.trim()) problems.push(T("nav_missing_url"));
      else if (!hasLabel) problems.push(T("nav_missing_label"));
    });
  });

  if (problems.length) {
    render();
    UI().errorToast(problems[0]);
    return false;
  }
  return true;
}

function wireToolbar() {
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
  protectAdminPage("navigation", async (_user, profile) => {
    cms = createCmsController({
      docId: CMS_DOCS.NAVIGATION,
      profile,
      read: readValues,
      write: writeValues,
    });

    wire();
    wireToolbar();
    cms.wireToolbar();

    try {
      await cms.load();
    } catch (err) {
      console.error("[ICC Admin] Failed to load navigation config:", err);
      UI().errorToast(T("admin_error_generic"));
      render();
    }

    document.addEventListener("icc:languagechange", render);
  });
});
