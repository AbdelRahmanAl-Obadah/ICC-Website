/**
 * tree.js
 * -----------------------------------------------------------------------
 * PHASE 5 — PUBLIC renderer for the academic structure built in the Admin
 * Panel's Tree manager.
 *
 * Mounts into any element carrying [data-academic-tree]. Reads only active
 * nodes (the security rules enforce that for unauthenticated visitors
 * anyway), rebuilds the hierarchy from the flat parentId pointers, and
 * renders a nested list.
 *
 * ORPHAN HANDLING
 *   A node whose parent is inactive or deleted would otherwise vanish
 *   silently, because the recursive build starts from parentId === null
 *   and never reaches it. Such nodes are promoted to the top level instead.
 *   Losing the intended nesting is a cosmetic problem; a major disappearing
 *   from the public site without anyone noticing is not.
 *
 * If there are no nodes yet, the section removes itself rather than
 * rendering an empty shell — the tree is additive to the existing site,
 * not a replacement for it.
 * ------------------------------------------------------------------------
 */

import { getActiveTreeNodes } from "./firestore.js";

function lang() {
  return (window.ICC_I18N && window.ICC_I18N.getStoredLang()) || "en";
}

function escapeHTML(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

let nodes = [];

function label(node) {
  return node.name?.[lang()] || node.name?.en || node.name?.ar || "";
}

function buildBranch(parentId, ids) {
  const children = nodes
    .filter((n) => {
      const parent = n.parentId || null;
      // Treat a node whose parent isn't visible as a root node.
      const effectiveParent = parent && ids.has(parent) ? parent : null;
      return effectiveParent === parentId;
    })
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

  if (!children.length) return "";

  return `<ul class="academic-tree__list">${children
    .map((node) => {
      const inner = buildBranch(node.id, ids);
      const href = node.linkedMajorId ? `major.html?id=${encodeURIComponent(node.linkedMajorId)}` : null;
      const name = escapeHTML(label(node));
      return `
        <li class="academic-tree__item academic-tree__item--${escapeHTML(node.type || "custom")}">
          <span class="academic-tree__node">
            ${href ? `<a href="${href}">${name}</a>` : name}
          </span>
          ${inner}
        </li>`;
    })
    .join("")}</ul>`;
}

function render(mount) {
  const ids = new Set(nodes.map((n) => n.id));
  const html = buildBranch(null, ids);
  if (!html) {
    mount.closest("[data-academic-tree-section]")?.remove();
    return;
  }
  mount.innerHTML = html;
}

async function load() {
  const mount = document.querySelector("[data-academic-tree]");
  if (!mount) return;
  try {
    nodes = await getActiveTreeNodes();
    if (!nodes.length) {
      mount.closest("[data-academic-tree-section]")?.remove();
      return;
    }
    render(mount);
    document.addEventListener("icc:languagechange", () => render(mount));
  } catch (err) {
    console.info("[ICC] Academic tree not loaded.", err?.message || err);
    mount.closest("[data-academic-tree-section]")?.remove();
  }
}

document.addEventListener("DOMContentLoaded", load);
