/**
 * workflow-admin.js — admin/workflow.html
 * -----------------------------------------------------------------------
 * PHASE 6 — the approval queue.
 *
 * Everything an administrator submitted but could not publish themselves
 * lands here, across every workflow-managed collection, for a reviewer to
 * approve (publish) or reject.
 *
 * WHY THIS SCREEN EXISTS AT ALL
 *   Because "create and edit, but not publish" is only a coherent
 *   permission if there is somewhere for the resulting work to go. Without
 *   a queue, an author without publish rights would save a draft and have
 *   no way to tell anyone it was ready, and a reviewer would have to go
 *   hunting through six tables filtered by state.
 *
 * AUTHORIZATION
 *   A reviewer needs workflow:publish, OR publish on the specific section.
 *   Both routes are honoured because they answer different questions: the
 *   first is "you review other people's work", the second is "this is your
 *   section anyway". Ownership still applies — a restricted reviewer only
 *   sees submissions inside their own scope.
 * ------------------------------------------------------------------------
 */

import { protectAdminPage } from "./admin-guard.js";
import { transitionRecord, NotAuthorizedError, escapeHTML } from "./resource-ops.js";
import { openVersionHistory } from "./version-history.js";
import { getPendingReview } from "../firestore.js";
import {
  WORKFLOW_SECTIONS,
  WORKFLOW,
  can,
  ownsRecord,
  filterOwned,
  ACTIONS,
} from "../permissions.js";
import {
  updateMajor,
  updateSemester,
  updateSubject,
  updateRequirement,
  updatePrerequisite,
  updateTreeNode,
} from "../firestore.js";

const UI = () => window.ICC_ADMIN_UI;
function lang() {
  return (window.ICC_I18N && window.ICC_I18N.getStoredLang()) || "en";
}
const T = (key) => window.ICC_I18N.t(key, lang());

/** Each section's own updater, so this screen never writes fields directly. */
const UPDATERS = {
  majors: updateMajor,
  semesters: updateSemester,
  subjects: updateSubject,
  requirements: updateRequirement,
  prerequisites: updatePrerequisite,
  tree: updateTreeNode,
};

let me = null;
let items = [];

function labelOf(record) {
  return (
    record.name?.[lang()] ||
    record.name?.en ||
    record.code ||
    record.title ||
    record.id
  );
}

function fmt(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(lang() === "ar" ? "ar-JO" : "en-GB", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** May the signed-in reviewer decide on this particular submission? */
function mayReview(item) {
  const allowed =
    can(me, "workflow", ACTIONS.PUBLISH) || can(me, item.__section, ACTIONS.PUBLISH);
  return allowed && ownsRecord(me, item.__section, item);
}

function applyFilters(list) {
  const search = (document.querySelector("[data-search]").value || "").trim().toLowerCase();
  const section = document.querySelector("[data-section-filter]").value;
  return list.filter((i) => {
    if (section && i.__section !== section) return false;
    if (!search) return true;
    return `${labelOf(i)} ${i.code || ""}`.toLowerCase().includes(search);
  });
}

function render() {
  const table = document.querySelector("[data-table]");
  const body = document.querySelector("[data-table-body]");
  const mount = document.querySelector("[data-state-mount]");
  const list = applyFilters(items);

  if (!list.length) {
    table.hidden = true;
    mount.innerHTML = UI().stateHTML("empty", {
      title: T("wf_queue_empty_title"),
      body: T("wf_queue_empty_body"),
    });
    return;
  }
  mount.innerHTML = "";
  table.hidden = false;
  body.innerHTML = list
    .map((i) => {
      const reviewable = mayReview(i);
      return `
      <tr data-id="${i.id}" data-section="${i.__section}">
        <td>${T(`perm_${i.__section}`)}</td>
        <td class="wrap">${escapeHTML(labelOf(i))}</td>
        <td><span class="badge badge--pending">${T("wf_pending")}</span></td>
        <td>${fmt(i.updatedAt)}</td>
        <td>
          <div class="admin-table__actions">
            <button class="icon-btn" data-action="history" title="${T("ver_history")}">⟲</button>
            ${
              reviewable
                ? `<button class="btn btn--primary btn--xs" data-action="approve">${T("wf_approve")}</button>
                   <button class="btn btn--outline btn--xs" data-action="reject">${T("wf_reject")}</button>`
                : `<span class="hint">${T("wf_not_reviewer")}</span>`
            }
          </div>
        </td>
      </tr>`;
    })
    .join("");
}

async function load() {
  const mount = document.querySelector("[data-state-mount]");
  mount.innerHTML = UI().stateHTML("loading", { title: "", body: T("state_loading") });
  try {
    // Only ask for the collections this reviewer can read at all; the data
    // layer tolerates a per-collection failure so one missing permission
    // doesn't blank the whole queue.
    const collections = WORKFLOW_SECTIONS.filter((s) => can(me, s.key, ACTIONS.VIEW)).map((s) => ({
      collection: s.collection,
      section: s.key,
    }));
    const raw = await getPendingReview(collections);
    // Ownership filter, per section, before anything is rendered.
    items = raw.filter((r) => ownsRecord(me, r.__section, r));
    render();
  } catch (err) {
    console.error("[ICC Admin] Failed to load review queue:", err);
    mount.innerHTML = UI().stateHTML("error", {
      title: T("state_error_title"),
      body: T("state_error_body"),
    });
  }
}

async function decide(item, approve) {
  const ok = await UI().confirmDialog({
    title: approve ? T("wf_approve") : T("wf_reject"),
    message: (approve ? T("wf_approve_msg") : T("wf_reject_msg")).replace(
      "{name}",
      labelOf(item)
    ),
    danger: !approve,
  });
  if (!ok) return;

  try {
    await transitionRecord({
      profile: me,
      section: item.__section,
      collection: item.__collection,
      record: item,
      toState: approve ? WORKFLOW.PUBLISHED : WORKFLOW.REJECTED,
      update: UPDATERS[item.__section],
      label: labelOf(item),
      reviewer: true,
    });
    UI().successToast(approve ? T("wf_approved_toast") : T("wf_rejected_toast"));
    await load();
  } catch (err) {
    if (err instanceof NotAuthorizedError) UI().errorToast(err.message);
    else {
      console.error("[ICC Admin] Review decision failed:", err);
      UI().errorToast(T("admin_error_permission"));
    }
  }
}

function wire() {
  const sectionSel = document.querySelector("[data-section-filter]");
  WORKFLOW_SECTIONS.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.key;
    opt.textContent = T(s.labelKey);
    sectionSel.appendChild(opt);
  });

  document.querySelector("[data-table-body]").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const row = btn.closest("tr");
    const item = items.find((i) => i.id === row.getAttribute("data-id"));
    if (!item) return;
    const action = btn.getAttribute("data-action");
    if (action === "history") {
      openVersionHistory({
        profile: me,
        section: item.__section,
        collection: item.__collection,
        record: item,
        label: labelOf(item),
        onRestored: load,
      });
    } else {
      decide(item, action === "approve");
    }
  });

  document.querySelector("[data-search]").addEventListener("input", render);
  sectionSel.addEventListener("change", render);
}

document.addEventListener("DOMContentLoaded", () => {
  protectAdminPage("workflow", async (user, profile) => {
    me = profile;
    wire();
    await load();
    document.addEventListener("icc:languagechange", render);
  });
});
