/**
 * requirements-admin.js — admin/requirements.html
 * -----------------------------------------------------------------------
 * CRUD for Free Electives / University / College requirements, filterable
 * by category.
 * ------------------------------------------------------------------------
 */

import { protectAdminPage } from "./admin-guard.js";
import { logAction } from "./audit-log.js";
import { can, ACTIONS } from "../permissions.js";
import { actionsCellHTML, gateToolbar } from "./academic-shared.js";
import {
import { icon } from "../icons.js";
  getAllRequirements,
  createRequirement,
  updateRequirement,
  deleteRequirement,
} from "../firestore.js";

const UI = () => window.ICC_ADMIN_UI;
const T = (key) => window.ICC_I18N.t(key, lang());
function lang() {
  return (window.ICC_I18N && window.ICC_I18N.getStoredLang()) || "en";
}

let allReqs = [];
let me = null;   // signed-in profile
let caps = {};   // what this admin may do in this section

const CATEGORY_LABELS = {
  "free-elective": "admin_cat_free_elective",
  university: "admin_cat_university",
  college: "admin_cat_college",
};

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function applyFilters(list) {
  const category = document.querySelector("[data-category-filter]")?.value || "all";
  const search = (document.querySelector("[data-search]")?.value || "").trim().toLowerCase();
  return list.filter((r) => {
    if (category !== "all" && r.category !== category) return false;
    if (!search) return true;
    const hay = `${r.name?.en || ""} ${r.name?.ar || ""} ${r.code || ""}`.toLowerCase();
    return hay.includes(search);
  });
}

function rowHTML(r, index, list) {
  const statusBadge = r.active
    ? `<span class="badge badge--active">${T("admin_active")}</span>`
    : `<span class="badge badge--inactive">${T("admin_inactive")}</span>`;
  return `
    <tr data-id="${r.id}">
      <td>
        <div style="display:flex; gap:4px; align-items:center;">
          ${
            // Reordering writes to the records, so it is an EDIT — not
            // something a read-only viewer may do.
            caps.edit
              ? `<button class="icon-btn" data-action="up" ${index === 0 ? "disabled" : ""} aria-label="Move up">${icon("arrow-up")}</button>
          <button class="icon-btn" data-action="down" ${index === list.length - 1 ? "disabled" : ""} aria-label="Move down">${icon("arrow-down")}</button>`
              : ""
          }
          <span style="margin-inline-start:4px; color:var(--icc-ink-soft); font-family:var(--font-mono); font-size:0.78rem;">${r.displayOrder ?? "—"}</span>
        </div>
      </td>
      <td class="wrap">${escapeHTML(r.name?.en || "")}</td>
      <td><span class="tag">${escapeHTML(r.code || "")}</span></td>
      <td>${T(CATEGORY_LABELS[r.category] || "admin_cat_free_elective")}</td>
      <td>${r.creditHours ?? "—"}</td>
      <td>${statusBadge}</td>
      <td>${actionsCellHTML(me, "requirements", r)}</td>
    </tr>
  `;
}

function render() {
  const filtered = applyFilters(allReqs);
  const tbl = document.querySelector("[data-table]");
  const body = document.querySelector("[data-table-body]");
  const mount = document.querySelector("[data-state-mount]");

  if (!filtered.length) {
    tbl.hidden = true;
    mount.innerHTML = UI().stateHTML("empty", { title: T("admin_empty_title"), body: T("admin_empty_body") });
    return;
  }
  mount.innerHTML = "";
  tbl.hidden = false;
  body.innerHTML = filtered.map((r, i) => rowHTML(r, i, filtered)).join("");
}

async function loadAll() {
  const mount = document.querySelector("[data-state-mount]");
  mount.innerHTML = UI().stateHTML("loading", { title: "", body: T("state_loading") });
  document.querySelector("[data-table]").hidden = true;
  try {
    allReqs = await getAllRequirements();
    render();
  } catch (err) {
    console.error("[ICC Admin] Failed to load requirements:", err);
    mount.innerHTML = UI().stateHTML("error", { title: T("state_error_title"), body: T("state_error_body") });
  }
}

function requirementFormHTML(r) {
  const req = r || {};
  const categoryOptions = Object.entries(CATEGORY_LABELS)
    .map(([value, key]) => `<option value="${value}" ${req.category === value ? "selected" : ""}>${T(key)}</option>`)
    .join("");
  return `
    <form data-req-form class="admin-form" novalidate>
      <div class="form-field" data-field="category">
        <label>${T("admin_field_category")} *</label>
        <select name="category" required>
          <option value="">—</option>
          ${categoryOptions}
        </select>
        <p class="form-field__error">${T("admin_field_required")}</p>
      </div>
      <div class="admin-form__row">
        <div class="form-field" data-field="name_en">
          <label>${T("admin_field_name_en")} *</label>
          <input type="text" name="name_en" value="${escapeHTML(req.name?.en || "")}" required>
          <p class="form-field__error">${T("admin_field_required")}</p>
        </div>
        <div class="form-field" data-field="name_ar">
          <label>${T("admin_field_name_ar")} *</label>
          <input type="text" name="name_ar" dir="rtl" value="${escapeHTML(req.name?.ar || "")}" required>
          <p class="form-field__error">${T("admin_field_required")}</p>
        </div>
      </div>
      <div class="admin-form__row">
        <div class="form-field" data-field="code">
          <label>${T("admin_field_code")}</label>
          <input type="text" name="code" value="${escapeHTML(req.code || "")}">
        </div>
        <div class="form-field" data-field="creditHours">
          <label>${T("admin_field_credit_hours")} *</label>
          <input type="number" name="creditHours" min="0" step="1" value="${req.creditHours ?? ""}" required>
          <p class="form-field__error">${T("admin_field_required")}</p>
        </div>
      </div>
      <div class="admin-form__row">
        <div class="form-field">
          <label>${T("admin_field_prerequisite_en")}</label>
          <input type="text" name="prerequisite_en" value="${escapeHTML(req.prerequisite?.en || "")}">
        </div>
        <div class="form-field">
          <label>${T("admin_field_prerequisite_ar")}</label>
          <input type="text" name="prerequisite_ar" dir="rtl" value="${escapeHTML(req.prerequisite?.ar || "")}">
        </div>
      </div>
      <div class="admin-form__row">
        <div class="form-field">
          <label>${T("admin_field_description_en")}</label>
          <textarea name="description_en">${escapeHTML(req.description?.en || "")}</textarea>
        </div>
        <div class="form-field">
          <label>${T("admin_field_description_ar")}</label>
          <textarea name="description_ar" dir="rtl">${escapeHTML(req.description?.ar || "")}</textarea>
        </div>
      </div>
      <div class="admin-form__row">
        <div class="form-field">
          <label>${T("admin_field_course_url")}</label>
          <input type="url" name="courseUrl" value="${escapeHTML(req.courseUrl || "")}">
        </div>
        <div class="form-field">
          <label>${T("admin_field_display_order")}</label>
          <input type="number" name="displayOrder" value="${req.displayOrder ?? allReqs.length}">
        </div>
      </div>
      <div class="form-field">
        <span class="form-check">
          <input type="checkbox" name="active" ${req.active !== false ? "checked" : ""}>
          <label>${T("admin_field_active")}</label>
        </span>
      </div>
      <div class="admin-form__actions">
        <button type="button" class="btn btn--outline" data-cancel>${T("admin_cancel")}</button>
        <button type="submit" class="btn btn--primary" data-submit>${T("admin_save")}</button>
      </div>
    </form>
  `;
}

function readReqForm(form) {
  const fd = new FormData(form);
  return {
    category: fd.get("category"),
    name: { en: (fd.get("name_en") || "").trim(), ar: (fd.get("name_ar") || "").trim() },
    code: (fd.get("code") || "").trim(),
    creditHours: Number(fd.get("creditHours")) || 0,
    prerequisite: { en: (fd.get("prerequisite_en") || "").trim(), ar: (fd.get("prerequisite_ar") || "").trim() },
    description: { en: (fd.get("description_en") || "").trim(), ar: (fd.get("description_ar") || "").trim() },
    courseUrl: (fd.get("courseUrl") || "").trim(),
    displayOrder: Number(fd.get("displayOrder")) || 0,
    active: fd.get("active") === "on",
  };
}

function validateReqForm(form) {
  UI().clearAllErrors(form);
  let ok = true;
  const required = [
    ["category", "category"],
    ["name_en", "name_en"],
    ["name_ar", "name_ar"],
    ["creditHours", "creditHours"],
  ];
  for (const [inputName, fieldKey] of required) {
    const input = form.querySelector(`[name="${inputName}"]`);
    const wrap = form.querySelector(`[data-field="${fieldKey}"]`);
    if (!String(input.value).trim()) {
      UI().setFieldError(wrap, T("admin_field_required"));
      ok = false;
    }
  }
  return ok;
}

function openReqForm(req) {
  const wrap = document.createElement("div");
  wrap.innerHTML = requirementFormHTML(req);
  const form = wrap.querySelector("[data-req-form]");
  wrap.querySelector("[data-cancel]").addEventListener("click", () => UI().closeModal());

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validateReqForm(form)) return;
    const data = readReqForm(form);
    const submitBtn = wrap.querySelector("[data-submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = T("admin_saving");
    try {
      if (req?.id) {
        await updateRequirement(req.id, data);
        await logAction({
          action: "update",
          section: "requirements",
          entityId: req.id,
          entityLabel: data.name?.en || req.name?.en || req.id,
          before: req,
          after: { ...req, ...data },
        });
        UI().successToast(T("admin_updated_success"));
      } else {
        const newId = await createRequirement(data);
        await logAction({
          action: "create",
          section: "requirements",
          entityId: newId,
          entityLabel: data.name?.en || newId,
          after: data,
        });
        UI().successToast(T("admin_created_success"));
      }
      UI().closeModal();
      await loadAll();
    } catch (err) {
      console.error("[ICC Admin] Save requirement failed:", err);
      UI().errorToast(T("admin_error_generic"));
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = T("admin_save");
    }
  });

  UI().openModal({
    title: req?.id ? T("admin_requirement_form_title_edit") : T("admin_requirement_form_title_add"),
    bodyEl: wrap,
  });
}

async function handleDelete(req) {
  const ok = await UI().confirmDialog({
    title: T("admin_confirm_delete_title"),
    message: `${T("admin_confirm_delete_msg")} — "${req.name?.en || req.id}"`,
    danger: true,
  });
  if (!ok) return;
  try {
    await deleteRequirement(req.id);
    await logAction({
      action: "delete",
      section: "requirements",
      entityId: req.id,
      entityLabel: req.name?.en || req.id,
      before: req,
    });
    UI().successToast(T("admin_deleted_success"));
    await loadAll();
  } catch (err) {
    console.error("[ICC Admin] Delete requirement failed:", err);
    UI().errorToast(T("admin_error_generic"));
  }
}

async function moveReq(req, direction) {
  const scoped = allReqs
    .filter((r) => r.category === req.category)
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  const idx = scoped.findIndex((r) => r.id === req.id);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= scoped.length) return;
  const neighbor = scoped[swapIdx];
  const a = req.displayOrder ?? idx;
  const b = neighbor.displayOrder ?? swapIdx;
  try {
    await Promise.all([updateRequirement(req.id, { displayOrder: b }), updateRequirement(neighbor.id, { displayOrder: a })]);
    await loadAll();
  } catch (err) {
    console.error("[ICC Admin] Reorder failed:", err);
    UI().errorToast(T("admin_error_generic"));
  }
}

function wireTableActions() {
  document.querySelector("[data-table-body]").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.closest("tr").getAttribute("data-id");
    const req = allReqs.find((r) => r.id === id);
    if (!req) return;

    const action = btn.getAttribute("data-action");

    // The buttons above are already filtered by permission; this re-checks
    // before acting, so a handler reached any other way (a stale row, the
    // console) still can't perform an action the viewer doesn't hold.
    const NEEDED = {
      edit: ACTIONS.EDIT,
      up: ACTIONS.EDIT,
      down: ACTIONS.EDIT,
      delete: ACTIONS.DELETE,
      toggle: ACTIONS.PUBLISH,
    };
    if (NEEDED[action] && !can(me, "requirements", NEEDED[action])) {
      UI().errorToast(T("admin_error_permission"));
      return;
    }

    if (action === "edit") openReqForm(req);
    else if (action === "delete") handleDelete(req);
    else if (action === "up") moveReq(req, "up");
    else if (action === "down") moveReq(req, "down");
    else if (action === "toggle") {
      try {
        await updateRequirement(req.id, { active: !req.active });
        await logAction({
          action: req.active ? "deactivate" : "activate",
          section: "requirements",
          entityId: req.id,
          entityLabel: req.name?.en || req.id,
          before: { active: req.active },
          after: { active: !req.active },
        });
        UI().successToast(T("admin_status_updated_success"));
        await loadAll();
      } catch (err) {
        console.error("[ICC Admin] Toggle active failed:", err);
        UI().errorToast(T("admin_error_generic"));
      }
    }
  });
}

function wireToolbar() {
  document.querySelector("[data-add-btn]")?.addEventListener("click", () => openReqForm(null));
  document.querySelector("[data-category-filter]")?.addEventListener("change", render);
  document.querySelector("[data-search]")?.addEventListener("input", render);
}

document.addEventListener("DOMContentLoaded", () => {
  protectAdminPage("requirements", async (_user, profile) => {
    me = profile;
    caps = gateToolbar(me, "requirements");
    wireTableActions();
    wireToolbar();
    await loadAll();
    document.addEventListener("icc:languagechange", loadAll);

    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1" && caps.create) openReqForm(null);
  });
});
