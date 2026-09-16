/**
 * tree-admin.js — admin/tree.html
 * -----------------------------------------------------------------------
 * PHASE 5 — the dynamic academic structure manager.
 *
 * Builds an arbitrarily deep hierarchy — faculty → department → major →
 * sub-specialization, or whatever shape the club actually needs — and
 * stores it in Firestore so the public site renders the current structure
 * without anyone editing HTML.
 *
 * STORAGE SHAPE
 *   Flat documents with a parentId pointer, not nested subcollections.
 *   The whole tree loads in one query, reparenting a branch is a single
 *   field write instead of a recursive copy-and-delete, and depth is not
 *   capped by the schema. Sibling order lives in displayOrder, rewritten
 *   as a contiguous 0..n-1 sequence whenever a level changes so gaps from
 *   deletions never accumulate.
 *
 * CYCLE SAFETY
 *   A node may not be moved under its own descendant — that would orphan
 *   the branch from the root and make it invisible and unrecoverable in
 *   the UI. isDescendant() below refuses those moves before any write.
 *
 * Every mutation is permission-checked by firestore.rules against the
 * `tree` permission, and written to the audit log.
 * ------------------------------------------------------------------------
 */

import { protectAdminPage } from "./admin-guard.js";
import { logAction } from "./audit-log.js";
import { can, ACTIONS } from "../permissions.js";
import { gateToolbar } from "./academic-shared.js";
import {
  getAllTreeNodes,
  createTreeNode,
  updateTreeNode,
  deleteTreeNode,
  reorderTreeNodes,
  getMajors,
} from "../firestore.js";

const UI = () => window.ICC_ADMIN_UI;
function lang() {
  return (window.ICC_I18N && window.ICC_I18N.getStoredLang()) || "en";
}
const T = (key) => window.ICC_I18N.t(key, lang());

const NODE_TYPES = ["faculty", "department", "major", "track", "custom"];

let me = null;   // signed-in profile
let caps = {};   // what this admin may do on the tree
let nodes = [];
let majors = [];
const collapsed = new Set();

function escapeHTML(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

/* ------------------------------------------------------------------ */
/* Tree maths                                                          */
/* ------------------------------------------------------------------ */

function childrenOf(parentId) {
  return nodes
    .filter((n) => (n.parentId || null) === (parentId || null))
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
}

/** True when `candidateId` sits anywhere beneath `nodeId`. */
function isDescendant(nodeId, candidateId) {
  if (!candidateId) return false;
  let current = nodes.find((n) => n.id === candidateId);
  const seen = new Set();
  while (current && current.parentId) {
    if (seen.has(current.id)) return false; // defensive: corrupt data
    seen.add(current.id);
    if (current.parentId === nodeId) return true;
    current = nodes.find((n) => n.id === current.parentId);
  }
  return false;
}

/** Every node beneath this one, for delete warnings. */
function descendantsOf(nodeId) {
  const out = [];
  const walk = (id) => {
    childrenOf(id).forEach((child) => {
      out.push(child);
      walk(child.id);
    });
  };
  walk(nodeId);
  return out;
}

function nodeLabel(n) {
  return n.name?.[lang()] || n.name?.en || n.name?.ar || "—";
}

/* ------------------------------------------------------------------ */
/* Render                                                              */
/* ------------------------------------------------------------------ */

function matchesFilters(n) {
  const search = (document.querySelector("[data-search]")?.value || "").trim().toLowerCase();
  const status = document.querySelector("[data-status-filter]")?.value || "all";
  if (status === "active" && !n.active) return false;
  if (status === "inactive" && n.active) return false;
  if (!search) return true;
  return `${n.name?.en || ""} ${n.name?.ar || ""} ${n.type || ""}`.toLowerCase().includes(search);
}

/**
 * A node is shown when it matches the filters OR any of its descendants
 * does — otherwise searching for a leaf would hide the branch containing
 * it and the result would look like "not found".
 */
function shouldShow(n) {
  if (matchesFilters(n)) return true;
  return descendantsOf(n.id).some(matchesFilters);
}

function branchHTML(parentId, depth) {
  const kids = childrenOf(parentId).filter(shouldShow);
  if (!kids.length) return "";

  return kids
    .map((n, index) => {
      const kidCount = childrenOf(n.id).length;
      const isCollapsed = collapsed.has(n.id);
      return `
      <div class="tree-node${n.active ? "" : " is-inactive"}" data-id="${n.id}" style="--depth:${depth}">
        <div class="tree-node__row">
          <button class="tree-node__toggle" data-action="collapse" ${
            kidCount ? "" : 'disabled aria-hidden="true"'
          } aria-label="${T("admin_tree_toggle")}">${kidCount ? (isCollapsed ? "▸" : "▾") : "·"}</button>

          <span class="tree-node__type">${T(`tree_type_${n.type || "custom"}`)}</span>
          <span class="tree-node__name">${escapeHTML(nodeLabel(n))}</span>
          ${
            n.linkedMajorId
              ? `<span class="tag tag--link" title="${T("admin_tree_linked")}">↗ ${escapeHTML(
                  majors.find((m) => m.id === n.linkedMajorId)?.name?.en || n.linkedMajorId
                )}</span>`
              : ""
          }
          ${
            n.active
              ? `<span class="badge badge--active">${T("admin_active")}</span>`
              : `<span class="badge badge--inactive">${T("admin_inactive")}</span>`
          }
          ${kidCount ? `<span class="tag tag--count">${kidCount}</span>` : ""}

          <div class="tree-node__actions">
            ${
              // Each control is gated on the action it actually performs.
              // Reordering and re-parenting are writes to the nodes, so they
              // need EDIT; toggling a node changes what the public tree
              // shows, so it needs PUBLISH.
              caps.edit
                ? `<button class="icon-btn" data-action="up" ${index === 0 ? "disabled" : ""} aria-label="${T(
                    "admin_move_up"
                  )}">↑</button>
            <button class="icon-btn" data-action="down" ${
              index === kids.length - 1 ? "disabled" : ""
            } aria-label="${T("admin_move_down")}">↓</button>`
                : ""
            }
            ${
              caps.create
                ? `<button class="icon-btn" data-action="add-child" title="${T("admin_tree_add_child")}">＋</button>`
                : ""
            }
            ${
              caps.edit
                ? `<button class="icon-btn" data-action="move" title="${T("admin_tree_move")}">⇄</button>
            <button class="icon-btn" data-action="edit" title="${T("admin_edit")}">✎</button>`
                : ""
            }
            ${
              caps.publish
                ? `<button class="icon-btn" data-action="toggle" title="${
                    n.active ? T("admin_deactivate") : T("admin_activate")
                  }">${n.active ? "⏸" : "▶"}</button>`
                : ""
            }
            ${
              caps.delete
                ? `<button class="icon-btn icon-btn--danger" data-action="delete" title="${T("admin_delete")}">🗑</button>`
                : ""
            }
          </div>
        </div>
        ${isCollapsed ? "" : branchHTML(n.id, depth + 1)}
      </div>`;
    })
    .join("");
}

function render() {
  const mount = document.querySelector("[data-tree-mount]");
  const stateMount = document.querySelector("[data-state-mount]");

  if (!nodes.length) {
    mount.innerHTML = "";
    stateMount.innerHTML = UI().stateHTML("empty", {
      title: T("admin_tree_empty_title"),
      body: T("admin_tree_empty_body"),
    });
    return;
  }

  const html = branchHTML(null, 0);
  if (!html) {
    mount.innerHTML = "";
    stateMount.innerHTML = UI().stateHTML("empty", {
      title: T("admin_empty_title"),
      body: T("admin_empty_body"),
    });
    return;
  }
  stateMount.innerHTML = "";
  mount.innerHTML = html;
}

async function loadTree() {
  const stateMount = document.querySelector("[data-state-mount]");
  stateMount.innerHTML = UI().stateHTML("loading", { title: "", body: T("state_loading") });
  try {
    [nodes, majors] = await Promise.all([getAllTreeNodes(), getMajors().catch(() => [])]);
    render();
  } catch (err) {
    console.error("[ICC Admin] Failed to load tree:", err);
    stateMount.innerHTML = UI().stateHTML("error", {
      title: T("state_error_title"),
      body: T("state_error_body"),
    });
  }
}

/* ------------------------------------------------------------------ */
/* Node form                                                           */
/* ------------------------------------------------------------------ */

function nodeFormHTML(node, parentId) {
  const n = node || {};
  const parentOptions = [`<option value="">${T("admin_tree_root_option")}</option>`]
    .concat(
      nodes
        .filter((candidate) => {
          if (!node) return true;
          if (candidate.id === node.id) return false;
          return !isDescendant(node.id, candidate.id);
        })
        .map(
          (candidate) =>
            `<option value="${candidate.id}" ${
              (node ? node.parentId : parentId) === candidate.id ? "selected" : ""
            }>${escapeHTML(nodeLabel(candidate))}</option>`
        )
    )
    .join("");

  return `
    <form data-node-form class="admin-form" novalidate>
      <div class="admin-form__row">
        <div class="form-field" data-field="name_en">
          <label>${T("admin_field_name_en")} *</label>
          <input type="text" name="name_en" value="${escapeHTML(n.name?.en || "")}" required>
          <p class="form-field__error">${T("admin_field_required")}</p>
        </div>
        <div class="form-field" data-field="name_ar">
          <label>${T("admin_field_name_ar")} *</label>
          <input type="text" name="name_ar" dir="rtl" value="${escapeHTML(n.name?.ar || "")}" required>
          <p class="form-field__error">${T("admin_field_required")}</p>
        </div>
      </div>

      <div class="admin-form__row">
        <div class="form-field">
          <label>${T("admin_field_node_type")}</label>
          <select name="type">
            ${NODE_TYPES.map(
              (t) => `<option value="${t}" ${n.type === t ? "selected" : ""}>${T(`tree_type_${t}`)}</option>`
            ).join("")}
          </select>
        </div>
        <div class="form-field">
          <label>${T("admin_field_parent")}</label>
          <select name="parentId">${parentOptions}</select>
          <p class="hint">${T("admin_tree_parent_hint")}</p>
        </div>
      </div>

      <div class="admin-form__row">
        <div class="form-field">
          <label>${T("admin_field_linked_major")}</label>
          <select name="linkedMajorId">
            <option value="">${T("admin_none")}</option>
            ${majors
              .map(
                (m) =>
                  `<option value="${m.id}" ${n.linkedMajorId === m.id ? "selected" : ""}>${escapeHTML(
                    m.name?.en || m.id
                  )}</option>`
              )
              .join("")}
          </select>
          <p class="hint">${T("admin_tree_link_hint")}</p>
        </div>
        <div class="form-field">
          <span class="form-check" style="margin-top:28px;">
            <input type="checkbox" name="active" ${n.active !== false ? "checked" : ""}>
            <label>${T("admin_field_active")}</label>
          </span>
        </div>
      </div>

      <div class="admin-form__actions">
        <button type="button" class="btn btn--outline" data-cancel>${T("admin_cancel")}</button>
        <button type="submit" class="btn btn--primary" data-submit>${T("admin_save")}</button>
      </div>
    </form>`;
}

function openNodeForm(node, parentId = null) {
  const wrap = document.createElement("div");
  wrap.innerHTML = nodeFormHTML(node, parentId);
  const form = wrap.querySelector("[data-node-form]");
  wrap.querySelector("[data-cancel]").addEventListener("click", () => UI().closeModal());

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    UI().clearAllErrors(form);

    const nameEn = form.name_en.value.trim();
    const nameAr = form.name_ar.value.trim();
    let valid = true;
    if (!nameEn) {
      UI().setFieldError(form.querySelector('[data-field="name_en"]'), T("admin_field_required"));
      valid = false;
    }
    if (!nameAr) {
      UI().setFieldError(form.querySelector('[data-field="name_ar"]'), T("admin_field_required"));
      valid = false;
    }
    if (!valid) return;

    const newParent = form.parentId.value || null;
    if (node && newParent && isDescendant(node.id, newParent)) {
      UI().errorToast(T("admin_tree_cycle_error"));
      return;
    }

    const siblings = childrenOf(newParent).filter((s) => s.id !== node?.id);
    const data = {
      name: { en: nameEn, ar: nameAr },
      type: form.type.value,
      parentId: newParent,
      linkedMajorId: form.linkedMajorId.value || "",
      active: form.active.checked,
      displayOrder: node ? node.displayOrder ?? siblings.length : siblings.length,
    };

    const submitBtn = form.querySelector("[data-submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = T("admin_saving");

    try {
      if (node?.id) {
        await updateTreeNode(node.id, data);
        await logAction({
          action: "update",
          section: "tree",
          entityId: node.id,
          entityLabel: data.name.en,
          before: node,
          after: { ...node, ...data },
        });
        UI().successToast(T("admin_updated_success"));
      } else {
        const id = await createTreeNode(data);
        await logAction({
          action: "create",
          section: "tree",
          entityId: id,
          entityLabel: data.name.en,
          after: data,
        });
        UI().successToast(T("admin_created_success"));
      }
      UI().closeModal();
      await loadTree();
    } catch (err) {
      console.error("[ICC Admin] Save tree node failed:", err);
      UI().errorToast(T("admin_error_permission"));
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = T("admin_save");
    }
  });

  UI().openModal({
    title: node ? T("admin_tree_form_edit") : T("admin_tree_form_add"),
    bodyEl: wrap,
  });
}

/* ------------------------------------------------------------------ */
/* Reorder / move / delete                                             */
/* ------------------------------------------------------------------ */

async function moveWithinLevel(node, direction) {
  const siblings = childrenOf(node.parentId || null);
  const index = siblings.findIndex((s) => s.id === node.id);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= siblings.length) return;

  // Rewrite the whole level as a clean 0..n-1 sequence. Swapping two
  // displayOrder values only works if they were contiguous to begin with;
  // resequencing is immune to gaps left behind by deleted siblings.
  const reordered = [...siblings];
  [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];

  try {
    await reorderTreeNodes(reordered.map((s, i) => ({ id: s.id, displayOrder: i })));
    await logAction({
      action: "reorder",
      section: "tree",
      entityId: node.id,
      entityLabel: nodeLabel(node),
      before: { displayOrder: index },
      after: { displayOrder: swapWith },
    });
    await loadTree();
  } catch (err) {
    console.error("[ICC Admin] Reorder failed:", err);
    UI().errorToast(T("admin_error_permission"));
  }
}

function openMoveDialog(node) {
  const candidates = nodes.filter((n) => n.id !== node.id && !isDescendant(node.id, n.id));
  const body = document.createElement("div");
  body.innerHTML = `
    <p>${T("admin_tree_move_msg").replace("{name}", escapeHTML(nodeLabel(node)))}</p>
    <div class="form-field">
      <label for="moveParent">${T("admin_field_parent")}</label>
      <select id="moveParent">
        <option value="">${T("admin_tree_root_option")}</option>
        ${candidates
          .map(
            (c) =>
              `<option value="${c.id}" ${c.id === node.parentId ? "selected" : ""}>${escapeHTML(
                nodeLabel(c)
              )}</option>`
          )
          .join("")}
      </select>
    </div>
    <div class="admin-form__actions">
      <button type="button" class="btn btn--outline" data-cancel>${T("admin_cancel")}</button>
      <button type="button" class="btn btn--primary" data-confirm>${T("admin_tree_move")}</button>
    </div>`;

  body.querySelector("[data-cancel]").addEventListener("click", () => UI().closeModal());
  body.querySelector("[data-confirm]").addEventListener("click", async () => {
    const newParent = body.querySelector("#moveParent").value || null;
    if (newParent === (node.parentId || null)) {
      UI().closeModal();
      return;
    }
    const siblings = childrenOf(newParent);
    try {
      await updateTreeNode(node.id, { parentId: newParent, displayOrder: siblings.length });
      await logAction({
        action: "update",
        section: "tree",
        entityId: node.id,
        entityLabel: nodeLabel(node),
        summary: "Moved to a new parent",
        before: { parentId: node.parentId || null },
        after: { parentId: newParent },
      });
      UI().successToast(T("admin_updated_success"));
      UI().closeModal();
      await loadTree();
    } catch (err) {
      console.error("[ICC Admin] Move failed:", err);
      UI().errorToast(T("admin_error_permission"));
    }
  });

  UI().openModal({ title: T("admin_tree_move"), bodyEl: body, small: true });
}

async function removeNode(node) {
  const kids = descendantsOf(node.id);
  const ok = await UI().confirmDialog({
    title: T("admin_confirm_delete_title"),
    message: `${T("admin_confirm_delete_msg")} — "${nodeLabel(node)}"`,
    warning: kids.length
      ? T("admin_tree_delete_children").replace("{count}", kids.length)
      : "",
    danger: true,
  });
  if (!ok) return;

  try {
    // Depth-first: children before parents, so an interrupted run never
    // leaves nodes pointing at a parent that no longer exists.
    for (const child of [...kids].reverse()) {
      await deleteTreeNode(child.id);
    }
    await deleteTreeNode(node.id);
    await logAction({
      action: "delete",
      section: "tree",
      entityId: node.id,
      entityLabel: nodeLabel(node),
      summary: kids.length ? `Deleted with ${kids.length} descendant node(s)` : "",
      before: node,
    });
    UI().successToast(T("admin_deleted_success"));
    await loadTree();
  } catch (err) {
    console.error("[ICC Admin] Delete node failed:", err);
    UI().errorToast(T("admin_error_permission"));
  }
}

async function toggleNode(node) {
  try {
    await updateTreeNode(node.id, { active: !node.active });
    await logAction({
      action: node.active ? "deactivate" : "activate",
      section: "tree",
      entityId: node.id,
      entityLabel: nodeLabel(node),
      before: { active: node.active },
      after: { active: !node.active },
    });
    UI().successToast(T("admin_status_updated_success"));
    await loadTree();
  } catch (err) {
    console.error("[ICC Admin] Toggle node failed:", err);
    UI().errorToast(T("admin_error_permission"));
  }
}

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

function wire() {
  document.querySelector("[data-tree-mount]").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.closest(".tree-node").getAttribute("data-id");
    const node = nodes.find((n) => n.id === id);
    if (!node) return;

    const action = btn.getAttribute("data-action");

    // "collapse" is a view-state change and needs nothing; everything else
    // is re-checked before it runs.
    const NEEDED = {
      edit: ACTIONS.EDIT,
      move: ACTIONS.EDIT,
      up: ACTIONS.EDIT,
      down: ACTIONS.EDIT,
      "add-child": ACTIONS.CREATE,
      delete: ACTIONS.DELETE,
      toggle: ACTIONS.PUBLISH,
    };
    if (NEEDED[action] && !can(me, "tree", NEEDED[action])) {
      UI().errorToast(T("admin_error_permission"));
      return;
    }

    if (action === "collapse") {
      collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id);
      render();
    } else if (action === "edit") openNodeForm(node);
    else if (action === "add-child") openNodeForm(null, node.id);
    else if (action === "move") openMoveDialog(node);
    else if (action === "delete") removeNode(node);
    else if (action === "toggle") toggleNode(node);
    else if (action === "up") moveWithinLevel(node, "up");
    else if (action === "down") moveWithinLevel(node, "down");
  });

  document.querySelector("[data-add-root]")?.addEventListener("click", () => openNodeForm(null, null));
  document.querySelector("[data-search]").addEventListener("input", render);
  document.querySelector("[data-status-filter]").addEventListener("change", render);
  document.querySelector("[data-expand-all]").addEventListener("click", () => {
    collapsed.clear();
    render();
  });
  document.querySelector("[data-collapse-all]").addEventListener("click", () => {
    nodes.forEach((n) => collapsed.add(n.id));
    render();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  protectAdminPage("tree", async (_user, profile) => {
    me = profile;
    caps = gateToolbar(me, "tree", { add: "[data-add-root]" });
    wire();
    await loadTree();
    document.addEventListener("icc:languagechange", render);
  });
});
