/**
 * users-admin.js — admin/users.html
 * -----------------------------------------------------------------------
 * PHASE 5 — account management and the granular permission editor.
 *
 * WHAT THIS SCREEN DOES
 *   - Shows every account: normal users, Admins and the Super Admin.
 *   - Surfaces pending registration requests and lets an authorized
 *     administrator approve or reject them.
 *   - Lets the Super Admin promote an account to Admin, tick exactly which
 *     sections that Admin may manage, change those permissions later, and
 *     revoke administrator access entirely.
 *   - Lets the Super Admin activate/deactivate accounts and delete them.
 *   - Migrates legacy Phase-3B admins/{uid} records into real profiles.
 *
 * TWO TIERS OF CAPABILITY ON ONE SCREEN
 *   An Admin holding the `users` permission sees the list and can work the
 *   approval queue for NORMAL users. Everything touching roles or
 *   permissions is Super-Admin-only, hidden here and — far more
 *   importantly — rejected by firestore.rules if attempted anyway. See the
 *   users/{uid} update rules: a non-Super-Admin write is constrained to
 *   status/approval fields on a role=="user" document, so an Admin cannot
 *   promote themselves, promote a friend, or edit a colleague's
 *   permissions no matter what request they hand-craft.
 *
 * WHY "ADD ADMIN" WORKS THE WAY IT DOES
 *   This is a static site. Creating a Firebase Auth user for somebody else
 *   requires the Admin SDK and a service-account key, which must never sit
 *   in browser code. So the flow is: the person registers themselves on
 *   the public Sign Up page, and the Super Admin then promotes that
 *   existing account and assigns permissions. The authorization half is
 *   fully managed here; only the credential half stays with its owner.
 * ------------------------------------------------------------------------
 */

import { protectAdminPage } from "./admin-guard.js";
import { logAction } from "./audit-log.js";
import {
  getAllUsers,
  updateUserProfile,
  setAdminProfile,
  getLegacyAdmins,
  migrateLegacyAdmin,
} from "../firestore.js";
import { doc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../firebase-init.js";
import {
  ROLES,
  STATUS,
  GRANTABLE_PERMISSIONS,
  PERMISSION_GROUPS,
  ACTION_LIST,
  OWNERSHIP_SCOPES,
  isSuperAdmin,
  sanitizePermissions,
  countPermissions,
  normalizePermissions,
  normalizeOwnership,
} from "../permissions.js";
import { getMajors } from "../firestore.js";
import { icon } from "../icons.js";

const UI = () => window.ICC_ADMIN_UI;
function lang() {
  return (window.ICC_I18N && window.ICC_I18N.getStoredLang()) || "en";
}
const T = (key) => window.ICC_I18N.t(key, lang());

let allUsers = [];
let legacyAdmins = [];
let allMajors = []; // ownership targets
let me = null; // the signed-in profile

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function escapeHTML(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function fmtDate(ts) {
  if (!ts) return "—";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(lang() === "ar" ? "ar-JO" : "en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function roleBadge(user) {
  const map = {
    [ROLES.SUPER_ADMIN]: ["badge--super", "role_superadmin"],
    [ROLES.ADMIN]: ["badge--admin", "role_admin"],
    [ROLES.USER]: ["badge--user", "role_user"],
  };
  const [cls, key] = map[user.role] || map[ROLES.USER];
  return `<span class="badge ${cls}">${T(key)}</span>`;
}

function statusBadge(user) {
  const map = {
    [STATUS.ACTIVE]: ["badge--active", "status_active"],
    [STATUS.PENDING]: ["badge--pending", "status_pending"],
    [STATUS.DISABLED]: ["badge--inactive", "status_disabled"],
    [STATUS.REJECTED]: ["badge--danger", "status_rejected"],
  };
  const [cls, key] = map[user.status] || map[STATUS.PENDING];
  return `<span class="badge ${cls}">${T(key)}</span>`;
}

function permissionSummary(user) {
  if (user.role === ROLES.SUPER_ADMIN) {
    return `<span class="tag tag--super">${T("perm_all")}</span>`;
  }
  if (user.role !== ROLES.ADMIN) return "—";
  const count = countPermissions(user);
  const restricted = user.ownership?.enabled === true;
  const scope = restricted
    ? ` <span class="tag tag--warn" title="${T("ownership_notice")}">${T(
        "ownership_badge"
      ).replace("{n}", (user.ownership.majors || []).length)}</span>`
    : "";
  if (!count) return `<span class="tag tag--warn">${T("perm_none")}</span>${scope}`;
  return `<span class="tag">${T("perm_count").replace("{n}", count)}</span>${scope}`;
}

/** Is the signed-in person allowed to edit roles and permissions? */
function canGovern() {
  return isSuperAdmin(me);
}

/* ------------------------------------------------------------------ */
/* Stats                                                               */
/* ------------------------------------------------------------------ */

function renderStats() {
  const counts = {
    pending: allUsers.filter((u) => u.status === STATUS.PENDING).length,
    admins: allUsers.filter((u) => u.role === ROLES.ADMIN || u.role === ROLES.SUPER_ADMIN).length,
    active: allUsers.filter((u) => u.status === STATUS.ACTIVE).length,
    total: allUsers.length,
  };
  document.querySelectorAll("[data-stat]").forEach((el) => {
    el.textContent = counts[el.getAttribute("data-stat")] ?? 0;
  });
}

/* ------------------------------------------------------------------ */
/* Pending approvals                                                   */
/* ------------------------------------------------------------------ */

function renderPending() {
  const panel = document.querySelector("[data-pending-panel]");
  const body = document.querySelector("[data-pending-body]");
  const pending = allUsers.filter((u) => u.status === STATUS.PENDING);

  if (!pending.length) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  body.innerHTML = pending
    .map(
      (u) => `
      <tr data-id="${u.id}">
        <td class="wrap">${escapeHTML(u.displayName || "—")}</td>
        <td class="wrap">${escapeHTML(u.email || "")}</td>
        <td>${fmtDate(u.createdAt)}</td>
        <td>
          <div class="admin-table__actions">
            <button class="btn btn--primary btn--xs" data-action="approve">${T("admin_approve")}</button>
            <button class="btn btn--outline btn--xs" data-action="reject">${T("admin_reject")}</button>
          </div>
        </td>
      </tr>`
    )
    .join("");
}

async function decideRegistration(user, approve) {
  const ok = await UI().confirmDialog({
    title: approve ? T("admin_approve_title") : T("admin_reject_title"),
    message: (approve ? T("admin_approve_msg") : T("admin_reject_msg")).replace(
      "{email}",
      user.email || user.id
    ),
    confirmLabel: approve ? T("admin_approve") : T("admin_reject"),
    danger: !approve,
  });
  if (!ok) return;

  const patch = approve
    ? { status: STATUS.ACTIVE, approvedAt: new Date(), approvedBy: me.email || me.uid }
    : { status: STATUS.REJECTED, approvedAt: new Date(), approvedBy: me.email || me.uid };

  try {
    await updateUserProfile(user.id, patch);
    await logAction({
      action: approve ? "approve" : "reject",
      section: "users",
      entityId: user.id,
      entityLabel: user.displayName || user.email || user.id,
      targetUid: user.id,
      targetEmail: user.email || "",
      before: { status: user.status },
      after: { status: patch.status },
    });
    UI().successToast(approve ? T("admin_approved_success") : T("admin_rejected_success"));
    await loadUsers();
  } catch (err) {
    console.error("[ICC Admin] Approval decision failed:", err);
    UI().errorToast(T("admin_error_permission"));
  }
}

/* ------------------------------------------------------------------ */
/* Main table                                                          */
/* ------------------------------------------------------------------ */

function applyFilters(list) {
  const search = (document.querySelector("[data-search]")?.value || "").trim().toLowerCase();
  const role = document.querySelector("[data-role-filter]")?.value || "all";
  const status = document.querySelector("[data-status-filter]")?.value || "all";

  return list.filter((u) => {
    if (role !== "all" && u.role !== role) return false;
    if (status !== "all" && u.status !== status) return false;
    if (!search) return true;
    return `${u.displayName || ""} ${u.email || ""}`.toLowerCase().includes(search);
  });
}

function rowHTML(u) {
  const isSelf = u.id === me.uid;
  const isSuper = u.role === ROLES.SUPER_ADMIN;
  const govern = canGovern();

  // A Super Admin's own row never offers self-destructive actions: the
  // platform must always retain at least one account able to manage the
  // others, and the rules enforce the same thing independently.
  const actions = [];
  if (govern && !isSelf) {
    actions.push(
      `<button class="icon-btn" data-action="permissions" title="${T("admin_edit_permissions")}">${icon("key")}</button>`
    );
  }
  if (govern && !isSelf && !isSuper) {
    actions.push(
      `<button class="icon-btn" data-action="toggle" title="${
        u.status === STATUS.ACTIVE ? T("admin_deactivate") : T("admin_activate")
      }">${u.status === STATUS.ACTIVE ? icon("pause") : icon("play")}</button>`
    );
    if (u.role === ROLES.ADMIN) {
      actions.push(
        `<button class="icon-btn" data-action="revoke" title="${T("admin_revoke_admin")}">${icon("ban")}</button>`
      );
    }
    actions.push(
      `<button class="icon-btn icon-btn--danger" data-action="delete" title="${T("admin_delete")}">${icon("trash")}</button>`
    );
  }
  if (!govern && u.role === ROLES.USER && !isSelf) {
    actions.push(
      `<button class="icon-btn" data-action="toggle" title="${
        u.status === STATUS.ACTIVE ? T("admin_deactivate") : T("admin_activate")
      }">${u.status === STATUS.ACTIVE ? icon("pause") : icon("play")}</button>`
    );
  }

  return `
    <tr data-id="${u.id}">
      <td class="wrap">${escapeHTML(u.displayName || "—")}${
    isSelf ? ` <span class="tag tag--you">${T("admin_you")}</span>` : ""
  }</td>
      <td class="wrap">${escapeHTML(u.email || "")}</td>
      <td><code class="admin-uid" title="${escapeHTML(u.id || "")}">${escapeHTML(
        u.id || "—"
      )}</code></td>
      <td>${roleBadge(u)}</td>
      <td>${statusBadge(u)}</td>
      <td class="nowrap">${fmtDate(u.createdAt)}</td>
      <td class="nowrap">${fmtDate(u.updatedAt)}</td>
      <td>${permissionSummary(u)}</td>
      <td><div class="admin-table__actions">${actions.join("") || "—"}</div></td>
    </tr>`;
}

function render() {
  const table = document.querySelector("[data-table]");
  const body = document.querySelector("[data-table-body]");
  const mount = document.querySelector("[data-state-mount]");
  const filtered = applyFilters(allUsers);

  renderStats();
  renderPending();

  if (!filtered.length) {
    table.hidden = true;
    mount.innerHTML = UI().stateHTML("empty", {
      title: T("admin_empty_title"),
      body: T("admin_empty_body"),
    });
    return;
  }
  mount.innerHTML = "";
  table.hidden = false;
  body.innerHTML = filtered.map(rowHTML).join("");

  renderLegacyPanel();
}

async function loadUsers() {
  const mount = document.querySelector("[data-state-mount]");
  mount.innerHTML = UI().stateHTML("loading", { title: "", body: T("state_loading") });
  try {
    allUsers = await getAllUsers();
    if (canGovern()) {
      allMajors = await getMajors().catch(() => []);
      try {
        legacyAdmins = await getLegacyAdmins();
      } catch (err) {
        legacyAdmins = [];
      }
    }
    render();
  } catch (err) {
    console.error("[ICC Admin] Failed to load users:", err);
    mount.innerHTML = UI().stateHTML("error", {
      title: T("state_error_title"),
      body: T("state_error_body"),
    });
  }
}

/* ------------------------------------------------------------------ */
/* Permission editor                                                   */
/* ------------------------------------------------------------------ */

/**
 * Build the permission checkbox grid, grouped exactly the way the sidebar
 * is grouped so "what I tick here" maps visibly onto "what they will see".
 */
/**
 * The permission MATRIX editor.
 *
 * One row per section, one checkbox per action, so "can edit courses but
 * not delete or publish them" is expressible directly rather than being
 * approximated by a single on/off switch.
 *
 * Two behaviours worth knowing:
 *   - Ticking any action auto-ticks `view`, because an admin who may edit
 *     a record they cannot load is a bug, not a configuration.
 *   - Sections only show the actions that mean something for them. A
 *     settings document cannot be created or deleted by an admin, so those
 *     boxes aren't offered — an unusable toggle is a lie about what the
 *     system does.
 */
function permissionGridHTML(current) {
  const matrix = normalizePermissions(current || {});

  return PERMISSION_GROUPS.map((group) => {
    const items = GRANTABLE_PERMISSIONS.filter((p) => p.group === group.key);
    if (!items.length) return "";

    return `
      <fieldset class="perm-group">
        <legend>
          ${T(group.labelKey)}
          <button type="button" class="btn btn--ghost btn--xs" data-group-toggle="${group.key}">${T(
      "admin_toggle_all"
    )}</button>
        </legend>

        <div class="matrix-wrap">
          <table class="matrix">
            <thead>
              <tr>
                <th class="matrix__section">${T("admin_field_section")}</th>
                ${ACTION_LIST.map(
                  (a) => `<th class="matrix__action" title="${T(a.descKey)}">${T(a.labelKey)}</th>`
                ).join("")}
              </tr>
            </thead>
            <tbody>
              ${items
                .map((p) => {
                  const grants = matrix[p.key] || {};
                  return `
                  <tr>
                    <th scope="row" class="matrix__section">
                      <strong>${T(p.labelKey)}</strong>
                      <em>${T(`perm_${p.key}_desc`)}</em>
                    </th>
                    ${ACTION_LIST.map((a) => {
                      if (!p.actions.includes(a.key)) {
                        return `<td class="matrix__cell matrix__cell--na" title="${T(
                          "matrix_na"
                        )}">—</td>`;
                      }
                      return `<td class="matrix__cell">
                        <input type="checkbox"
                               name="perm_${p.key}_${a.key}"
                               data-perm-section="${p.key}"
                               data-perm-action="${a.key}"
                               data-perm-group="${group.key}"
                               ${grants[a.key] === true ? "checked" : ""}
                               aria-label="${T(p.labelKey)} — ${T(a.labelKey)}">
                      </td>`;
                    }).join("")}
                  </tr>`;
                })
                .join("")}
            </tbody>
          </table>
        </div>
      </fieldset>`;
  }).join("");
}

function readPermissionGrid(form) {
  const raw = {};
  form.querySelectorAll("[data-perm-section]").forEach((input) => {
    if (!input.checked) return;
    const section = input.getAttribute("data-perm-section");
    const action = input.getAttribute("data-perm-action");
    raw[section] = raw[section] || {};
    raw[section][action] = true;
  });
  // Normalize against the catalog: unknown sections/actions and
  // Super-Admin-only sections are stripped before anything is written.
  return sanitizePermissions(raw);
}

/**
 * The OWNERSHIP editor.
 *
 * Ownership narrows what an admin may touch; it never grants anything. So
 * it is presented as an opt-in restriction ("limit this admin to...")
 * rather than as a list of grants, which is how it actually behaves.
 */
function ownershipHTML(current) {
  const own = normalizeOwnership(current);
  const scope = OWNERSHIP_SCOPES[0]; // majors today; more scopes drop in here

  return `
    <fieldset class="perm-group">
      <legend>${T("ownership_title")}</legend>
      <span class="form-check">
        <input type="checkbox" name="ownership_enabled" data-ownership-toggle ${
          own.enabled ? "checked" : ""
        }>
        <label>${T("ownership_enable")}</label>
      </span>
      <p class="hint">${T("ownership_hint")}</p>

      <div data-ownership-list ${own.enabled ? "" : "hidden"}>
        <p class="hint"><strong>${T(scope.labelKey)}</strong></p>
        ${
          allMajors.length
            ? `<div class="perm-grid">${allMajors
                .map(
                  (m) => `
              <label class="perm-item">
                <input type="checkbox" name="own_majors_${m.id}" data-own-major="${m.id}" ${
                    own.majors.includes(m.id) ? "checked" : ""
                  }>
                <span><strong>${escapeHTML(m.name?.en || m.id)}</strong><em>${escapeHTML(
                    m.code || ""
                  )}</em></span>
              </label>`
                )
                .join("")}</div>`
            : `<p class="hint">${T("ownership_no_majors")}</p>`
        }
        <p class="hint">${T("ownership_warning")}</p>
      </div>
    </fieldset>`;
}

function readOwnership(form) {
  const enabled = form.querySelector("[data-ownership-toggle]")?.checked === true;
  const majors = [];
  form.querySelectorAll("[data-own-major]").forEach((cb) => {
    if (cb.checked) majors.push(cb.getAttribute("data-own-major"));
  });
  return { enabled, majors };
}

function openPermissionEditor(user) {
  const wrap = document.createElement("div");
  const isPromotion = user.role !== ROLES.ADMIN && user.role !== ROLES.SUPER_ADMIN;

  wrap.innerHTML = `
    <form data-perm-form class="admin-form" novalidate>
      <div class="perm-subject">
        <strong>${escapeHTML(user.displayName || user.email || user.id)}</strong>
        <span>${escapeHTML(user.email || "")}</span>
      </div>

      <div class="admin-form__row">
        <div class="form-field">
          <label for="permRole">${T("admin_field_role")}</label>
          <select id="permRole" name="role">
            <option value="user" ${user.role === ROLES.USER ? "selected" : ""}>${T("role_user")}</option>
            <option value="admin" ${user.role === ROLES.ADMIN ? "selected" : ""}>${T("role_admin")}</option>
            <option value="superadmin" ${
              user.role === ROLES.SUPER_ADMIN ? "selected" : ""
            }>${T("role_superadmin")}</option>
          </select>
          <p class="hint">${T("admin_role_hint")}</p>
        </div>
        <div class="form-field">
          <label for="permStatus">${T("admin_status")}</label>
          <select id="permStatus" name="status">
            <option value="active" ${user.status === STATUS.ACTIVE ? "selected" : ""}>${T("status_active")}</option>
            <option value="pending" ${user.status === STATUS.PENDING ? "selected" : ""}>${T("status_pending")}</option>
            <option value="disabled" ${user.status === STATUS.DISABLED ? "selected" : ""}>${T("status_disabled")}</option>
            <option value="rejected" ${user.status === STATUS.REJECTED ? "selected" : ""}>${T("status_rejected")}</option>
          </select>
        </div>
      </div>

      <div data-perm-section ${user.role === ROLES.SUPER_ADMIN ? "hidden" : ""}>
        <p class="hint">${T("admin_permissions_hint")}</p>
        ${permissionGridHTML(user.permissions || {})}
        ${ownershipHTML(user.ownership)}
      </div>

      <div class="admin-modal__warning" data-super-warning ${
        user.role === ROLES.SUPER_ADMIN ? "" : "hidden"
      }>${T("admin_superadmin_warning")}</div>

      <div class="admin-form__actions">
        <button type="button" class="btn btn--outline" data-cancel>${T("admin_cancel")}</button>
        <button type="submit" class="btn btn--primary" data-submit>${T("admin_save")}</button>
      </div>
    </form>`;

  const form = wrap.querySelector("[data-perm-form]");
  wrap.querySelector("[data-cancel]").addEventListener("click", () => UI().closeModal());

  // Super Admin holds everything implicitly, so the grid is meaningless
  // for that role — hide it rather than showing ticks that do nothing.
  const roleSelect = form.querySelector('[name="role"]');
  roleSelect.addEventListener("change", () => {
    const isSuper = roleSelect.value === ROLES.SUPER_ADMIN;
    form.querySelector("[data-perm-section]").hidden = isSuper;
    form.querySelector("[data-super-warning]").hidden = !isSuper;
  });

  // Any action implies view — enforced in the UI so the saved matrix and
  // what the Super Admin sees on screen always agree.
  form.addEventListener("change", (e) => {
    const box = e.target.closest("[data-perm-section]");
    if (!box || !box.checked) return;
    const section = box.getAttribute("data-perm-section");
    const viewBox = form.querySelector(
      `[data-perm-section="${section}"][data-perm-action="view"]`
    );
    if (viewBox) viewBox.checked = true;
  });

  const ownToggle = form.querySelector("[data-ownership-toggle]");
  if (ownToggle) {
    ownToggle.addEventListener("change", () => {
      form.querySelector("[data-ownership-list]").hidden = !ownToggle.checked;
    });
  }

  form.querySelectorAll("[data-group-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const groupKey = btn.getAttribute("data-group-toggle");
      const boxes = form.querySelectorAll(`[data-perm-group="${groupKey}"]`);
      const allOn = Array.from(boxes).every((b) => b.checked);
      boxes.forEach((b) => {
        b.checked = !allOn;
      });
    });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const role = form.role.value;
    const status = form.status.value;
    const permissions = role === ROLES.ADMIN ? readPermissionGrid(form) : {};
    const ownership = role === ROLES.ADMIN ? readOwnership(form) : { enabled: false, majors: [] };

    // A restriction that names nothing would lock the admin out of every
    // record in every ownership-scoped section — almost always a mistake,
    // so it's confirmed rather than silently saved.
    if (ownership.enabled && !ownership.majors.length) {
      const proceed = await UI().confirmDialog({
        title: T("ownership_empty_title"),
        message: T("ownership_empty_msg"),
        danger: true,
      });
      if (!proceed) return;
    }

    if (role === ROLES.ADMIN && Object.keys(permissions).length === 0) {
      const proceed = await UI().confirmDialog({
        title: T("admin_no_permissions_title"),
        message: T("admin_no_permissions_msg"),
        danger: true,
      });
      if (!proceed) return;
    }

    const submitBtn = form.querySelector("[data-submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = T("admin_saving");

    const before = {
      role: user.role,
      status: user.status,
      permissions: user.permissions || {},
      ownership: user.ownership || {},
    };
    const after = { role, status, permissions, ownership };

    try {
      if (isPromotion && role === ROLES.ADMIN) {
        await setAdminProfile(user.id, {
          email: user.email,
          displayName: user.displayName,
          permissions,
          status,
        });
        await updateUserProfile(user.id, { ownership });
      } else {
        await updateUserProfile(user.id, { role, status, permissions, ownership });
      }

      await logAction({
        action: "permissions",
        section: role === ROLES.USER ? "users" : "admins",
        entityId: user.id,
        entityLabel: user.displayName || user.email || user.id,
        targetUid: user.id,
        targetEmail: user.email || "",
        before,
        after,
      });

      UI().successToast(T("admin_permissions_saved"));
      UI().closeModal();
      await loadUsers();
    } catch (err) {
      console.error("[ICC Admin] Permission save failed:", err);
      UI().errorToast(T("admin_error_permission"));
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = T("admin_save");
    }
  });

  UI().openModal({ title: T("admin_edit_permissions"), bodyEl: wrap });
}

/* ------------------------------------------------------------------ */
/* Row actions                                                         */
/* ------------------------------------------------------------------ */

async function toggleStatus(user) {
  const next = user.status === STATUS.ACTIVE ? STATUS.DISABLED : STATUS.ACTIVE;
  try {
    await updateUserProfile(user.id, {
      status: next,
      ...(next === STATUS.DISABLED
        ? { disabledAt: new Date(), disabledBy: me.email || me.uid }
        : { approvedAt: new Date(), approvedBy: me.email || me.uid }),
    });
    await logAction({
      action: next === STATUS.ACTIVE ? "activate" : "deactivate",
      section: "users",
      entityId: user.id,
      entityLabel: user.displayName || user.email || user.id,
      targetUid: user.id,
      targetEmail: user.email || "",
      before: { status: user.status },
      after: { status: next },
    });
    UI().successToast(T("admin_status_updated_success"));
    await loadUsers();
  } catch (err) {
    console.error("[ICC Admin] Status change failed:", err);
    UI().errorToast(T("admin_error_permission"));
  }
}

async function revokeAdmin(user) {
  const ok = await UI().confirmDialog({
    title: T("admin_revoke_admin"),
    message: T("admin_revoke_msg").replace("{email}", user.email || user.id),
    warning: T("admin_revoke_warning"),
    danger: true,
  });
  if (!ok) return;
  try {
    await updateUserProfile(user.id, {
      role: ROLES.USER,
      permissions: {},
      ownership: { enabled: false, majors: [] },
    });
    await logAction({
      action: "permissions",
      section: "admins",
      entityId: user.id,
      entityLabel: user.displayName || user.email || user.id,
      targetUid: user.id,
      targetEmail: user.email || "",
      summary: "Administrator access revoked",
      before: { role: user.role, permissions: user.permissions || {} },
      after: { role: ROLES.USER, permissions: {} },
    });
    UI().successToast(T("admin_revoked_success"));
    await loadUsers();
  } catch (err) {
    console.error("[ICC Admin] Revoke failed:", err);
    UI().errorToast(T("admin_error_permission"));
  }
}

async function deleteAccount(user) {
  const ok = await UI().confirmDialog({
    title: T("admin_confirm_delete_title"),
    message: T("admin_delete_user_msg").replace("{email}", user.email || user.id),
    warning: T("admin_delete_user_warning"),
    danger: true,
  });
  if (!ok) return;
  try {
    await deleteDoc(doc(db, "users", user.id));
    await logAction({
      action: "delete",
      section: "users",
      entityId: user.id,
      entityLabel: user.displayName || user.email || user.id,
      targetUid: user.id,
      targetEmail: user.email || "",
      before: { role: user.role, status: user.status },
    });
    UI().successToast(T("admin_deleted_success"));
    await loadUsers();
  } catch (err) {
    console.error("[ICC Admin] Delete account failed:", err);
    UI().errorToast(T("admin_error_permission"));
  }
}

/* ------------------------------------------------------------------ */
/* Legacy Phase-3B admin migration                                     */
/* ------------------------------------------------------------------ */

/**
 * Legacy admins/{uid} records still grant full access through the rules'
 * compatibility bridge, but they carry no granular permissions. This panel
 * lists any that have no users/{uid} profile yet so the Super Admin can
 * convert them — after which the legacy document is ignored entirely.
 */
function renderLegacyPanel() {
  const existing = document.querySelector("[data-legacy-panel]");
  if (existing) existing.remove();
  if (!canGovern()) return;

  const profileIds = new Set(allUsers.map((u) => u.id));
  const unmigrated = legacyAdmins.filter((a) => !profileIds.has(a.id));
  if (!unmigrated.length) return;

  const section = document.createElement("section");
  section.className = "admin-panel admin-panel--warn";
  section.setAttribute("data-legacy-panel", "");
  section.innerHTML = `
    <div class="admin-panel__head">
      <h2>${T("admin_legacy_title")}</h2>
    </div>
    <div class="admin-panel__body">
      <p class="hint">${T("admin_legacy_body")}</p>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <tbody>
            ${unmigrated
              .map(
                (a) => `
              <tr data-legacy-id="${a.id}">
                <td class="wrap">${escapeHTML(a.displayName || "—")}</td>
                <td class="wrap">${escapeHTML(a.email || a.id)}</td>
                <td><button class="btn btn--primary btn--xs" data-migrate>${T("admin_legacy_migrate")}</button></td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </div>`;

  section.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-migrate]");
    if (!btn) return;
    const id = btn.closest("tr").getAttribute("data-legacy-id");
    const legacy = legacyAdmins.find((a) => a.id === id);
    const permissions = sanitizePermissions(
      Object.fromEntries(GRANTABLE_PERMISSIONS.map((p) => [p.key, true]))
    );
    try {
      await migrateLegacyAdmin(id, legacy, permissions);
      await logAction({
        action: "create",
        section: "admins",
        entityId: id,
        entityLabel: legacy?.email || id,
        targetUid: id,
        targetEmail: legacy?.email || "",
        summary: "Migrated legacy admin allowlist record into a profile",
        after: { role: ROLES.ADMIN, permissions },
      });
      UI().successToast(T("admin_legacy_migrated"));
      await loadUsers();
    } catch (err) {
      console.error("[ICC Admin] Legacy migration failed:", err);
      UI().errorToast(T("admin_error_permission"));
    }
  });

  document.querySelector(".admin-content").appendChild(section);
}

/* ------------------------------------------------------------------ */
/* Add admin (promote an existing registered account)                  */
/* ------------------------------------------------------------------ */

function openAddAdmin() {
  const candidates = allUsers.filter((u) => u.role === ROLES.USER);
  const wrap = document.createElement("div");

  if (!candidates.length) {
    wrap.innerHTML = `
      <p>${T("admin_add_admin_none")}</p>
      <div class="admin-form__actions">
        <button type="button" class="btn btn--primary" data-cancel>${T("admin_cancel")}</button>
      </div>`;
    wrap.querySelector("[data-cancel]").addEventListener("click", () => UI().closeModal());
    UI().openModal({ title: T("admin_users_add_admin"), bodyEl: wrap, small: true });
    return;
  }

  wrap.innerHTML = `
    <p class="hint">${T("admin_add_admin_hint")}</p>
    <div class="form-field">
      <label for="adminPick">${T("admin_add_admin_pick")}</label>
      <select id="adminPick">
        ${candidates
          .map(
            (u) =>
              `<option value="${u.id}">${escapeHTML(u.displayName || u.email || u.id)} — ${escapeHTML(
                u.email || ""
              )}</option>`
          )
          .join("")}
      </select>
    </div>
    <div class="admin-form__actions">
      <button type="button" class="btn btn--outline" data-cancel>${T("admin_cancel")}</button>
      <button type="button" class="btn btn--primary" data-next>${T("admin_next")}</button>
    </div>`;

  wrap.querySelector("[data-cancel]").addEventListener("click", () => UI().closeModal());
  wrap.querySelector("[data-next]").addEventListener("click", () => {
    const id = wrap.querySelector("#adminPick").value;
    const user = allUsers.find((u) => u.id === id);
    UI().closeModal();
    if (user) openPermissionEditor({ ...user, role: ROLES.ADMIN });
  });

  UI().openModal({ title: T("admin_users_add_admin"), bodyEl: wrap, small: true });
}

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

function wire() {
  document.querySelector("[data-table-body]").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.closest("tr").getAttribute("data-id");
    const user = allUsers.find((u) => u.id === id);
    if (!user) return;
    const action = btn.getAttribute("data-action");
    if (action === "permissions") openPermissionEditor(user);
    else if (action === "toggle") toggleStatus(user);
    else if (action === "revoke") revokeAdmin(user);
    else if (action === "delete") deleteAccount(user);
  });

  document.querySelector("[data-pending-body]").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.closest("tr").getAttribute("data-id");
    const user = allUsers.find((u) => u.id === id);
    if (!user) return;
    decideRegistration(user, btn.getAttribute("data-action") === "approve");
  });

  document.querySelector("[data-search]").addEventListener("input", render);
  document.querySelector("[data-role-filter]").addEventListener("change", render);
  document.querySelector("[data-status-filter]").addEventListener("change", render);

  const addBtn = document.querySelector("[data-add-admin]");
  if (canGovern()) {
    addBtn.hidden = false;
    addBtn.addEventListener("click", openAddAdmin);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  protectAdminPage("users", async (user, profile) => {
    me = profile;
    wire();
    await loadUsers();
    document.addEventListener("icc:languagechange", render);
  });
});
