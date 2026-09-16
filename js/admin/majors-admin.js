/**
 * majors-admin.js — admin/majors.html
 * -----------------------------------------------------------------------
 * Full Majors CRUD: create, edit, activate/deactivate, delete (with a
 * dependent-record safety check against semesters/subjects), duplicate,
 * and reorder (swap displayOrder with a neighbor via up/down buttons).
 * ------------------------------------------------------------------------
 */

import { protectAdminPage } from "./admin-guard.js";
import { logAction } from "./audit-log.js";
import {
  saveRecord,
  deleteRecord,
  transitionRecord,
  rowActionsHTML,
  stateBadge,
  ownershipNoticeHTML,
  NotAuthorizedError,
} from "./resource-ops.js";
import { openVersionHistory } from "./version-history.js";
import {
  initBulkActions,
  bulkCellHTML,
  bulkHeaderHTML,
  bulkAvailable,
} from "./bulk-actions.js";
import {
  can,
  filterOwned,
  stateOf,
  WORKFLOW,
  WORKFLOW_STATES,
  ACTIONS,
} from "../permissions.js";
import {
  getMajors,
  createMajor,
  updateMajor,
  deleteMajor,
  getAllSemestersForMajor,
  getSubjectsForMajor,
} from "../firestore.js";
import { normalizeDriveImageUrl } from "../drive-utils.js";
import { icon } from "../icons.js";

const UI = () => window.ICC_ADMIN_UI;
const T = (key) => window.ICC_I18N.t(key, lang());
function lang() {
  return (window.ICC_I18N && window.ICC_I18N.getStoredLang()) || "en";
}

let allMajors = [];
let me = null;      // signed-in profile
let bulk = null;    // bulk-actions controller

function tableBody() {
  return document.querySelector("[data-table-body]");
}
function table() {
  return document.querySelector("[data-table]");
}
function stateMount() {
  return document.querySelector("[data-state-mount]");
}

function applyFilters(list) {
  const search = (document.querySelector("[data-search]")?.value || "").trim().toLowerCase();
  const status = document.querySelector("[data-status-filter]")?.value || "all";

  // Ownership is applied FIRST and unconditionally: a restricted admin
  // never has an out-of-scope record rendered, so it can't be selected for
  // a bulk action or opened by accident either.
  const scoped = filterOwned(me, "majors", list);

  return scoped.filter((m) => {
    const state = stateOf(m);
    if (status !== "all" && status !== state) return false;
    if (!search) return true;
    const hay = `${m.name?.en || ""} ${m.name?.ar || ""} ${m.code || ""}`.toLowerCase();
    return hay.includes(search);
  });
}

function rowHTML(m, index, list) {
  return `
    <tr data-id="${m.id}">
      ${bulk ? bulkCellHTML(m) : ""}
      <td>
        <div style="display:flex; gap:4px; align-items:center;">
          <button class="icon-btn" data-action="up" ${index === 0 ? "disabled" : ""} aria-label="Move up">${icon("arrow-up")}</button>
          <button class="icon-btn" data-action="down" ${index === list.length - 1 ? "disabled" : ""} aria-label="Move down">${icon("arrow-down")}</button>
          <span style="margin-inline-start:4px; color:var(--icc-ink-soft); font-family:var(--font-mono); font-size:0.78rem;">${m.displayOrder ?? "—"}</span>
        </div>
      </td>
      <td class="wrap">${escapeHTML(m.name?.en || "")}</td>
      <td class="wrap" dir="rtl">${escapeHTML(m.name?.ar || "")}</td>
      <td><span class="tag">${escapeHTML(m.code || "")}</span></td>
      <td>${escapeHTML(m.college || "")}</td>
      <td>${stateBadge(m)}</td>
      <td>
        <div class="admin-table__actions">${rowActionsHTML(me, "majors", m)}</div>
      </td>
    </tr>
  `;
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function render() {
  const filtered = applyFilters(allMajors);
  const tbl = table();
  const body = tableBody();
  const mount = stateMount();

  if (!allMajors.length) {
    tbl.hidden = true;
    mount.innerHTML = UI().stateHTML("empty", { title: T("admin_empty_title"), body: T("admin_empty_body") });
    return;
  }
  if (!filtered.length) {
    tbl.hidden = true;
    mount.innerHTML = UI().stateHTML("empty", { title: T("admin_empty_title"), body: T("admin_empty_body") });
    return;
  }
  mount.innerHTML = "";
  tbl.hidden = false;
  body.innerHTML = filtered.map((m, i) => rowHTML(m, i, filtered)).join("");
}

async function loadMajors() {
  const mount = stateMount();
  mount.innerHTML = UI().stateHTML("loading", { title: "", body: T("state_loading") });
  table().hidden = true;
  try {
    allMajors = await getMajors();
    render();
  } catch (err) {
    console.error("[ICC Admin] Failed to load majors:", err);
    mount.innerHTML = UI().stateHTML("error", { title: T("state_error_title"), body: T("state_error_body") });
  }
}

/* ------------------------------------------------------------------ */
/* Form modal                                                          */
/* ------------------------------------------------------------------ */
function majorFormHTML(major) {
  const m = major || {};
  return `
    <form data-major-form class="admin-form" novalidate>
      <div class="admin-form__row">
        <div class="form-field" data-field="name_en">
          <label>${T("admin_field_name_en")} *</label>
          <input type="text" name="name_en" value="${escapeHTML(m.name?.en || "")}" required>
          <p class="form-field__error">${T("admin_field_required")}</p>
        </div>
        <div class="form-field" data-field="name_ar">
          <label>${T("admin_field_name_ar")} *</label>
          <input type="text" name="name_ar" dir="rtl" value="${escapeHTML(m.name?.ar || "")}" required>
          <p class="form-field__error">${T("admin_field_required")}</p>
        </div>
      </div>
      <div class="admin-form__row">
        <div class="form-field" data-field="code">
          <label>${T("admin_field_code")} *</label>
          <input type="text" name="code" value="${escapeHTML(m.code || "")}" required>
          <p class="form-field__error">${T("admin_field_required")}</p>
        </div>
        <div class="form-field" data-field="college">
          <label>${T("admin_field_college")}</label>
          <input type="text" name="college" value="${escapeHTML(m.college || "")}">
        </div>
      </div>
      <div class="admin-form__row">
        <div class="form-field">
          <label>${T("admin_field_description_en")}</label>
          <textarea name="description_en">${escapeHTML(m.description?.en || "")}</textarea>
        </div>
        <div class="form-field">
          <label>${T("admin_field_description_ar")}</label>
          <textarea name="description_ar" dir="rtl">${escapeHTML(m.description?.ar || "")}</textarea>
        </div>
      </div>
      <div class="admin-form__row">
        <div class="form-field">
          <label>${T("admin_field_curriculum_image")}</label>
          <input type="url" name="curriculumImageUrl" value="${escapeHTML(m.curriculumImageUrl || "")}" data-curriculum-input>
          <p class="hint">${T("admin_field_curriculum_image_hint")}</p>
          <div class="image-preview" data-curriculum-preview hidden>
            <div class="image-preview__frame">
              <img alt="" data-curriculum-preview-img>
              <div class="image-preview__placeholder" data-curriculum-preview-placeholder hidden>
                <span data-curriculum-preview-message>${T("admin_curriculum_preview_invalid")}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="form-field">
          <label>${T("admin_field_slug")}</label>
          <input type="text" name="slug" value="${escapeHTML(m.slug || "")}">
        </div>
      </div>
      <div class="admin-form__row">
        <div class="form-field">
          <label>${T("admin_field_display_order")}</label>
          <input type="number" name="displayOrder" value="${m.displayOrder ?? allMajors.length}">
        </div>
        <div class="form-field">
          <!-- No "active" checkbox any more: visibility is the workflow
               state, set by the Save-as-draft / Publish buttons below, so
               the two can never disagree. -->
          <label>${T("admin_field_state")}</label>
          <p class="form-state">${major ? T(`wf_${stateOf(major)}`) : T("wf_draft")}</p>
        </div>
      </div>
      <div class="admin-form__actions">
        <button type="button" class="btn btn--outline" data-cancel>${T("admin_cancel")}</button>
        <button type="submit" class="btn btn--outline" data-submit data-intent="draft">${T("wf_save_draft")}</button>
        ${
          can(me, "majors", ACTIONS.PUBLISH)
            ? `<button type="submit" class="btn btn--primary" data-submit data-intent="publish">${T("wf_save_publish")}</button>`
            : `<button type="submit" class="btn btn--primary" data-submit data-intent="publish">${T("wf_submit_review")}</button>`
        }
      </div>
    </form>
  `;
}

function readMajorForm(form) {
  const fd = new FormData(form);
  return {
    name: { en: (fd.get("name_en") || "").trim(), ar: (fd.get("name_ar") || "").trim() },
    code: (fd.get("code") || "").trim(),
    college: (fd.get("college") || "").trim(),
    description: { en: (fd.get("description_en") || "").trim(), ar: (fd.get("description_ar") || "").trim() },
    curriculumImageUrl: (fd.get("curriculumImageUrl") || "").trim(),
    slug: (fd.get("slug") || "").trim(),
    displayOrder: Number(fd.get("displayOrder")) || 0,
  };
}

function validateMajorForm(form) {
  UI().clearAllErrors(form);
  let ok = true;
  const required = [
    ["name_en", "name_en"],
    ["name_ar", "name_ar"],
    ["code", "code"],
  ];
  for (const [inputName, fieldKey] of required) {
    const input = form.querySelector(`[name="${inputName}"]`);
    const wrap = form.querySelector(`[data-field="${fieldKey}"]`);
    if (!input.value.trim()) {
      UI().setFieldError(wrap, T("admin_field_required"));
      ok = false;
    }
  }
  return ok;
}

function openMajorForm(major) {
  const wrap = document.createElement("div");
  wrap.innerHTML = majorFormHTML(major);
  const form = wrap.querySelector("[data-major-form]");
  wrap.querySelector("[data-cancel]").addEventListener("click", () => UI().closeModal());

  initCurriculumPreview(form, major?.curriculumImageUrl || "");

  let intent = "keep";
  wrap.querySelectorAll("[data-submit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      intent = btn.getAttribute("data-intent") || "keep";
    });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validateMajorForm(form)) return;
    const data = readMajorForm(form);
    const submitBtns = wrap.querySelectorAll("[data-submit]");
    submitBtns.forEach((b) => (b.disabled = true));

    try {
      // One call applies the matrix check, the ownership check, the
      // workflow decision, the version snapshot and the audit entry.
      const result = await saveRecord({
        profile: me,
        section: "majors",
        collection: "majors",
        existing: major || null,
        data,
        intent,
        label: data.name?.en || major?.name?.en || "",
        create: (payload) => createMajor(payload),
        update: (id, payload) => updateMajor(id, payload),
      });

      UI().successToast(
        result.pending
          ? T("wf_submitted_toast")
          : major?.id
          ? T("admin_updated_success")
          : T("admin_created_success")
      );
      UI().closeModal();
      await loadMajors();
    } catch (err) {
      if (err instanceof NotAuthorizedError) {
        UI().errorToast(err.message);
      } else {
        console.error("[ICC Admin] Save major failed:", err);
        UI().errorToast(T("admin_error_permission"));
      }
    } finally {
      submitBtns.forEach((b) => (b.disabled = false));
    }
  });

  UI().openModal({
    title: major?.id ? T("admin_major_form_title_edit") : T("admin_major_form_title_add"),
    bodyEl: wrap,
  });
}

/* ------------------------------------------------------------------ */
/* Curriculum image preview (Phase 4A)                                 */
/* ------------------------------------------------------------------ */
function debounce(fn, wait) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/**
 * Live-previews the curriculumImageUrl field: accepts a direct image URL
 * or a Google Drive sharing URL (normalized client-side, no Drive API/
 * OAuth/credentials involved — see js/drive-utils.js), and shows a clear
 * placeholder/error message if the URL is empty or the image can't load.
 * Never uploads anything; this is a read-only preview of what the public
 * major page will show.
 */
function initCurriculumPreview(form, initialUrl) {
  const input = form.querySelector("[data-curriculum-input]");
  const preview = form.querySelector("[data-curriculum-preview]");
  if (!input || !preview) return;

  const img = preview.querySelector("[data-curriculum-preview-img]");
  const placeholder = preview.querySelector("[data-curriculum-preview-placeholder]");
  const message = preview.querySelector("[data-curriculum-preview-message]");

  const setPreview = (rawUrl) => {
    const url = (rawUrl || "").trim();
    if (!url) {
      preview.hidden = true;
      return;
    }
    preview.hidden = false;
    img.hidden = true;
    placeholder.hidden = true;

    const resolved = normalizeDriveImageUrl(url);
    const probe = new Image();
    probe.onload = () => {
      if (input.value.trim() !== url) return; // input changed again while probing
      img.src = resolved;
      img.hidden = false;
      placeholder.hidden = true;
    };
    probe.onerror = () => {
      if (input.value.trim() !== url) return;
      message.textContent = T("admin_curriculum_preview_invalid");
      img.hidden = true;
      placeholder.hidden = false;
    };
    probe.src = resolved;
  };

  input.addEventListener("input", debounce(() => setPreview(input.value), 350));
  setPreview(initialUrl);
}

/* ------------------------------------------------------------------ */
/* Duplicate                                                            */
/* ------------------------------------------------------------------ */
async function duplicateMajor(major) {
  if (!can(me, "majors", ACTIONS.CREATE)) {
    UI().errorToast(T("err_no_create"));
    return;
  }
  const copy = {
    name: { en: `${major.name?.en || ""} (Copy)`, ar: `${major.name?.ar || ""} (نسخة)` },
    code: `${major.code || ""}-COPY`,
    college: major.college || "",
    description: { en: major.description?.en || "", ar: major.description?.ar || "" },
    curriculumImageUrl: major.curriculumImageUrl || "",
    slug: major.slug ? `${major.slug}-copy` : "",
    displayOrder: (major.displayOrder ?? 0) + 1,
    // A duplicate is always a draft: copying a published major should
    // never put a second, half-edited copy straight onto the public site.
    status: WORKFLOW.DRAFT,
    active: false,
  };
  try {
    const copyId = await createMajor(copy);
    await logAction({
      action: "create",
      section: "majors",
      entityId: copyId,
      entityLabel: copy.name?.en || copyId,
      summary: `Duplicated from "${major.name?.en || major.id}"`,
      after: copy,
    });
    UI().successToast(T("admin_duplicated_success"));
    await loadMajors();
  } catch (err) {
    console.error("[ICC Admin] Duplicate major failed:", err);
    UI().errorToast(T("admin_error_generic"));
  }
}

/* ------------------------------------------------------------------ */
/* Delete (with dependent-record safety check)                         */
/* ------------------------------------------------------------------ */
async function handleDelete(major) {
  // deleteRecord() runs the dependency check, shows what the major is
  // holding up, and offers archive / cascade / cancel before anything
  // irreversible happens.
  try {
    await deleteRecord({
      profile: me,
      section: "majors",
      collection: "majors",
      record: major,
      label: major.name?.en || major.id,
      remove: (id) => deleteMajor(id),
      update: (id, patch) => updateMajor(id, patch),
    });
    await loadMajors();
  } catch (err) {
    if (err instanceof NotAuthorizedError) UI().errorToast(err.message);
    else {
      console.error("[ICC Admin] Delete major failed:", err);
      UI().errorToast(T("admin_error_permission"));
    }
  }
}

/* ------------------------------------------------------------------ */
/* Reorder (swap displayOrder with neighbor)                            */
/* ------------------------------------------------------------------ */
async function moveMajor(major, direction) {
  const sorted = [...allMajors].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  const idx = sorted.findIndex((m) => m.id === major.id);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= sorted.length) return;
  const neighbor = sorted[swapIdx];
  const a = major.displayOrder ?? idx;
  const b = neighbor.displayOrder ?? swapIdx;
  try {
    await Promise.all([
      updateMajor(major.id, { displayOrder: b }),
      updateMajor(neighbor.id, { displayOrder: a }),
    ]);
    await logAction({
      action: "reorder",
      section: "majors",
      entityId: major.id,
      entityLabel: major.name?.en || major.id,
      before: { displayOrder: a },
      after: { displayOrder: b },
    });
    await loadMajors();
  } catch (err) {
    console.error("[ICC Admin] Reorder failed:", err);
    UI().errorToast(T("admin_error_generic"));
  }
}

/* ------------------------------------------------------------------ */
/* Wiring                                                               */
/* ------------------------------------------------------------------ */
function wireTableActions() {
  tableBody().addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const row = btn.closest("tr");
    const id = row.getAttribute("data-id");
    const major = allMajors.find((m) => m.id === id);
    if (!major) return;

    const action = btn.getAttribute("data-action");
    if (action === "edit") openMajorForm(major);
    else if (action === "duplicate") duplicateMajor(major);
    else if (action === "delete") handleDelete(major);
    else if (action === "up") moveMajor(major, "up");
    else if (action === "down") moveMajor(major, "down");
    else if (action === "history") {
      openVersionHistory({
        profile: me,
        section: "majors",
        collection: "majors",
        record: major,
        label: major.name?.en || major.id,
        onRestored: loadMajors,
      });
    } else if (action === "publish" || action === "unpublish") {
      try {
        await transitionRecord({
          profile: me,
          section: "majors",
          collection: "majors",
          record: major,
          toState: action === "publish" ? WORKFLOW.PUBLISHED : WORKFLOW.UNPUBLISHED,
          update: (id, patch) => updateMajor(id, patch),
          label: major.name?.en || major.id,
        });
        UI().successToast(T("admin_status_updated_success"));
        await loadMajors();
      } catch (err) {
        if (err instanceof NotAuthorizedError) UI().errorToast(err.message);
        else {
          console.error("[ICC Admin] Transition failed:", err);
          UI().errorToast(T("admin_error_permission"));
        }
      }
    }
  });
}

function wireToolbar() {
  const addBtn = document.querySelector("[data-add-btn]");
  if (can(me, "majors", ACTIONS.CREATE)) {
    addBtn.addEventListener("click", () => openMajorForm(null));
  } else {
    addBtn.hidden = true;
  }
  document.querySelector("[data-search]")?.addEventListener("input", render);
  document.querySelector("[data-status-filter]")?.addEventListener("change", render);
}

document.addEventListener("DOMContentLoaded", () => {
  protectAdminPage("majors", async (user, profile) => {
    me = profile;

    // Bulk actions appear only if this admin has an action worth batching.
    if (bulkAvailable(me, "majors")) {
      bulk = initBulkActions({
        profile: me,
        section: "majors",
        collection: "majors",
        getRecords: () => allMajors,
        onDone: loadMajors,
      });
      document.querySelector("[data-bulk-header]").innerHTML = bulkHeaderHTML();
    }

    const notice = ownershipNoticeHTML(me, "majors");
    if (notice) document.querySelector("[data-ownership-notice]").innerHTML = notice;

    wireTableActions();
    wireToolbar();
    await loadMajors();
    document.addEventListener("icc:languagechange", loadMajors);

    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") openMajorForm(null);
  });
});
