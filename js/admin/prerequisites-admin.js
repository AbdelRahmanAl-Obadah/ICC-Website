/**
 * prerequisites-admin.js — admin/prerequisites.html
 * -----------------------------------------------------------------------
 * PHASE 5 — structured prerequisite links between subjects.
 *
 * Phase 3B stored a prerequisite as free text on the subject ("CS201" typed
 * by hand). That is fine to read and impossible to query: you cannot ask
 * "what unlocks after this subject?" or detect a circular chain. These
 * documents are the structured layer — a real reference from one subject to
 * another — while the old text field is left untouched and still renders as
 * a fallback wherever no structured link exists.
 *
 * INTEGRITY CHECKS PERFORMED BEFORE WRITING
 *   - A subject cannot be its own prerequisite.
 *   - The same pair cannot be linked twice.
 *   - Circular chains (A needs B, B needs A) are refused, including
 *     indirect ones several hops long, because a curriculum containing one
 *     is unsatisfiable and the public site would render an infinite path.
 * ------------------------------------------------------------------------
 */

import { protectAdminPage } from "./admin-guard.js";
import { logAction } from "./audit-log.js";
import { can, ACTIONS } from "../permissions.js";
import { actionsCellHTML, gateToolbar } from "./academic-shared.js";
import {
  getAllPrerequisites,
  createPrerequisite,
  updatePrerequisite,
  deletePrerequisite,
  getAllSubjects,
  getMajors,
} from "../firestore.js";

const UI = () => window.ICC_ADMIN_UI;
function lang() {
  return (window.ICC_I18N && window.ICC_I18N.getStoredLang()) || "en";
}
const T = (key) => window.ICC_I18N.t(key, lang());

const TYPES = ["hard", "soft", "concurrent"];

let me = null;   // signed-in profile
let links = [];
let subjects = [];
let majors = [];

function escapeHTML(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function subjectById(id) {
  return subjects.find((s) => s.id === id) || null;
}

function subjectLabel(id) {
  const s = subjectById(id);
  if (!s) return `<span class="tag tag--warn">${T("admin_prereq_missing")}</span>`;
  const name = s.name?.[lang()] || s.name?.en || s.id;
  return `${escapeHTML(s.code || "")} — ${escapeHTML(name)}`;
}

/* ------------------------------------------------------------------ */
/* Cycle detection                                                     */
/* ------------------------------------------------------------------ */

/**
 * Would adding "subjectId requires prereqId" create a loop?
 * Walks the existing prerequisite graph upward from prereqId looking for
 * subjectId. Visited-set guards against a pre-existing cycle in the data
 * sending this into an infinite walk.
 */
function wouldCreateCycle(subjectId, prereqId, ignoreLinkId = null) {
  const visited = new Set();
  const stack = [prereqId];
  while (stack.length) {
    const current = stack.pop();
    if (current === subjectId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    links
      .filter((l) => l.id !== ignoreLinkId && l.subjectId === current)
      .forEach((l) => stack.push(l.prereqSubjectId));
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Render                                                              */
/* ------------------------------------------------------------------ */

function applyFilters(list) {
  const search = (document.querySelector("[data-search]")?.value || "").trim().toLowerCase();
  const majorId = document.querySelector("[data-major-filter]")?.value || "all";
  const status = document.querySelector("[data-status-filter]")?.value || "all";

  return list.filter((l) => {
    if (status === "active" && !l.active) return false;
    if (status === "inactive" && l.active) return false;
    if (majorId !== "all") {
      const s = subjectById(l.subjectId);
      if (!s || s.majorId !== majorId) return false;
    }
    if (!search) return true;
    const a = subjectById(l.subjectId);
    const b = subjectById(l.prereqSubjectId);
    return `${a?.code || ""} ${a?.name?.en || ""} ${b?.code || ""} ${b?.name?.en || ""}`
      .toLowerCase()
      .includes(search);
  });
}

function rowHTML(l) {
  return `
    <tr data-id="${l.id}">
      <td class="wrap">${subjectLabel(l.subjectId)}</td>
      <td class="wrap">${subjectLabel(l.prereqSubjectId)}</td>
      <td><span class="tag">${T(`prereq_type_${l.type || "hard"}`)}</span></td>
      <td>${
        l.active
          ? `<span class="badge badge--active">${T("admin_active")}</span>`
          : `<span class="badge badge--inactive">${T("admin_inactive")}</span>`
      }</td>
      <td>${actionsCellHTML(me, "prerequisites", l)}</td>
    </tr>`;
}

function render() {
  const table = document.querySelector("[data-table]");
  const body = document.querySelector("[data-table-body]");
  const mount = document.querySelector("[data-state-mount]");
  const filtered = applyFilters(links);

  if (!filtered.length) {
    table.hidden = true;
    mount.innerHTML = UI().stateHTML("empty", {
      title: T("admin_empty_title"),
      body: links.length ? T("admin_empty_body") : T("admin_prereq_empty_body"),
    });
    return;
  }
  mount.innerHTML = "";
  table.hidden = false;
  body.innerHTML = filtered.map(rowHTML).join("");
}

async function loadAll() {
  const mount = document.querySelector("[data-state-mount]");
  mount.innerHTML = UI().stateHTML("loading", { title: "", body: T("state_loading") });
  try {
    [links, subjects, majors] = await Promise.all([
      getAllPrerequisites(),
      getAllSubjects(),
      getMajors().catch(() => []),
    ]);
    populateMajorFilter();
    render();
  } catch (err) {
    console.error("[ICC Admin] Failed to load prerequisites:", err);
    mount.innerHTML = UI().stateHTML("error", {
      title: T("state_error_title"),
      body: T("state_error_body"),
    });
  }
}

function populateMajorFilter() {
  const sel = document.querySelector("[data-major-filter]");
  const current = sel.value;
  sel.innerHTML =
    `<option value="all">${T("admin_filter_all_majors")}</option>` +
    majors
      .map((m) => `<option value="${m.id}">${escapeHTML(m.name?.en || m.id)}</option>`)
      .join("");
  if (current) sel.value = current;
}

/* ------------------------------------------------------------------ */
/* Form                                                                */
/* ------------------------------------------------------------------ */

function subjectOptions(selectedId) {
  return subjects
    .slice()
    .sort((a, b) => (a.code || "").localeCompare(b.code || ""))
    .map(
      (s) =>
        `<option value="${s.id}" ${s.id === selectedId ? "selected" : ""}>${escapeHTML(
          `${s.code || ""} — ${s.name?.en || s.id}`
        )}</option>`
    )
    .join("");
}

function openForm(link) {
  const l = link || {};
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <form data-prereq-form class="admin-form" novalidate>
      <div class="admin-form__row">
        <div class="form-field">
          <label>${T("admin_field_subject")} *</label>
          <select name="subjectId">${subjectOptions(l.subjectId)}</select>
          <p class="hint">${T("admin_prereq_subject_hint")}</p>
        </div>
        <div class="form-field">
          <label>${T("admin_field_requires")} *</label>
          <select name="prereqSubjectId">${subjectOptions(l.prereqSubjectId)}</select>
          <p class="hint">${T("admin_prereq_requires_hint")}</p>
        </div>
      </div>
      <div class="admin-form__row">
        <div class="form-field">
          <label>${T("admin_field_prereq_type")}</label>
          <select name="type">
            ${TYPES.map(
              (t) =>
                `<option value="${t}" ${l.type === t ? "selected" : ""}>${T(`prereq_type_${t}`)}</option>`
            ).join("")}
          </select>
        </div>
        <div class="form-field">
          <span class="form-check" style="margin-top:28px;">
            <input type="checkbox" name="active" ${l.active !== false ? "checked" : ""}>
            <label>${T("admin_field_active")}</label>
          </span>
        </div>
      </div>
      <div class="admin-form__actions">
        <button type="button" class="btn btn--outline" data-cancel>${T("admin_cancel")}</button>
        <button type="submit" class="btn btn--primary" data-submit>${T("admin_save")}</button>
      </div>
    </form>`;

  const form = wrap.querySelector("[data-prereq-form]");
  wrap.querySelector("[data-cancel]").addEventListener("click", () => UI().closeModal());

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const subjectId = form.subjectId.value;
    const prereqSubjectId = form.prereqSubjectId.value;

    if (!subjectId || !prereqSubjectId) {
      UI().errorToast(T("admin_field_required"));
      return;
    }
    if (subjectId === prereqSubjectId) {
      UI().errorToast(T("admin_prereq_self_error"));
      return;
    }
    const duplicate = links.some(
      (x) =>
        x.id !== link?.id && x.subjectId === subjectId && x.prereqSubjectId === prereqSubjectId
    );
    if (duplicate) {
      UI().errorToast(T("admin_prereq_duplicate_error"));
      return;
    }
    if (wouldCreateCycle(subjectId, prereqSubjectId, link?.id)) {
      UI().errorToast(T("admin_prereq_cycle_error"));
      return;
    }

    const data = {
      subjectId,
      prereqSubjectId,
      type: form.type.value,
      active: form.active.checked,
    };
    const label = `${subjectById(subjectId)?.code || subjectId} ← ${
      subjectById(prereqSubjectId)?.code || prereqSubjectId
    }`;

    const submitBtn = form.querySelector("[data-submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = T("admin_saving");

    try {
      if (link?.id) {
        await updatePrerequisite(link.id, data);
        await logAction({
          action: "update",
          section: "prerequisites",
          entityId: link.id,
          entityLabel: label,
          before: link,
          after: { ...link, ...data },
        });
        UI().successToast(T("admin_updated_success"));
      } else {
        const id = await createPrerequisite(data);
        await logAction({
          action: "create",
          section: "prerequisites",
          entityId: id,
          entityLabel: label,
          after: data,
        });
        UI().successToast(T("admin_created_success"));
      }
      UI().closeModal();
      await loadAll();
    } catch (err) {
      console.error("[ICC Admin] Save prerequisite failed:", err);
      UI().errorToast(T("admin_error_permission"));
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = T("admin_save");
    }
  });

  UI().openModal({
    title: link ? T("admin_prereq_form_edit") : T("admin_prereq_form_add"),
    bodyEl: wrap,
  });
}

/* ------------------------------------------------------------------ */
/* Row actions                                                         */
/* ------------------------------------------------------------------ */

async function removeLink(link) {
  const label = `${subjectById(link.subjectId)?.code || link.subjectId} ← ${
    subjectById(link.prereqSubjectId)?.code || link.prereqSubjectId
  }`;
  const ok = await UI().confirmDialog({
    title: T("admin_confirm_delete_title"),
    message: `${T("admin_confirm_delete_msg")} — "${label}"`,
    danger: true,
  });
  if (!ok) return;
  try {
    await deletePrerequisite(link.id);
    await logAction({
      action: "delete",
      section: "prerequisites",
      entityId: link.id,
      entityLabel: label,
      before: link,
    });
    UI().successToast(T("admin_deleted_success"));
    await loadAll();
  } catch (err) {
    console.error("[ICC Admin] Delete prerequisite failed:", err);
    UI().errorToast(T("admin_error_permission"));
  }
}

async function toggleLink(link) {
  try {
    await updatePrerequisite(link.id, { active: !link.active });
    await logAction({
      action: link.active ? "deactivate" : "activate",
      section: "prerequisites",
      entityId: link.id,
      entityLabel: `${subjectById(link.subjectId)?.code || link.subjectId}`,
      before: { active: link.active },
      after: { active: !link.active },
    });
    UI().successToast(T("admin_status_updated_success"));
    await loadAll();
  } catch (err) {
    console.error("[ICC Admin] Toggle prerequisite failed:", err);
    UI().errorToast(T("admin_error_permission"));
  }
}

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

function wire() {
  document.querySelector("[data-table-body]").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.closest("tr").getAttribute("data-id");
    const link = links.find((l) => l.id === id);
    if (!link) return;
    const action = btn.getAttribute("data-action");

    // Re-checked here as well as when the buttons were rendered, so the
    // handler is safe regardless of how it was reached.
    const NEEDED = { edit: ACTIONS.EDIT, delete: ACTIONS.DELETE, toggle: ACTIONS.PUBLISH };
    if (NEEDED[action] && !can(me, "prerequisites", NEEDED[action])) {
      UI().errorToast(T("admin_error_permission"));
      return;
    }

    if (action === "edit") openForm(link);
    else if (action === "delete") removeLink(link);
    else if (action === "toggle") toggleLink(link);
  });

  document.querySelector("[data-add-btn]")?.addEventListener("click", () => {
    if (!subjects.length) {
      UI().errorToast(T("admin_prereq_no_subjects"));
      return;
    }
    openForm(null);
  });
  document.querySelector("[data-search]").addEventListener("input", render);
  document.querySelector("[data-major-filter]").addEventListener("change", render);
  document.querySelector("[data-status-filter]").addEventListener("change", render);
}

document.addEventListener("DOMContentLoaded", () => {
  protectAdminPage("prerequisites", async (_user, profile) => {
    me = profile;
    gateToolbar(me, "prerequisites");
    wire();
    await loadAll();
    document.addEventListener("icc:languagechange", render);
  });
});
