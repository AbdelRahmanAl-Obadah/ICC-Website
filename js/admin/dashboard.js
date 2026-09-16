/**
 * dashboard.js — admin/index.html
 * -----------------------------------------------------------------------
 * Shows real Firestore counts (never fake numbers) for majors, semesters,
 * subjects and requirements, plus quick-add shortcuts into each CRUD page.
 *
 * PHASE 5 — the dashboard is the one page every authorized admin can
 * open, so it must render correctly for a Super Admin and for an Admin who
 * holds a single permission. Each block is therefore loaded independently
 * and only when the viewer holds the relevant permission:
 *
 *   - academic counts     → always (readable by any active admin)
 *   - account totals      → `users`
 *   - pending alert       → `users`
 *   - recent activity     → `audit`
 *
 * Loading them in one call would mean an Admin without `users` has their
 * entire dashboard fail on a permission error they can't do anything
 * about. Independent blocks degrade to "this section isn't shown" instead.
 * ------------------------------------------------------------------------
 */

import { protectAdminPage } from "./admin-guard.js";
import { getDashboardCounts, getGovernanceCounts, getAuditLogs } from "../firestore.js";
import { hasPermission, isSuperAdmin, allowedPermissions } from "../permissions.js";

/**
 * Which permission section each stat card reports on. A card whose section
 * the viewer cannot VIEW is removed from the DOM before anything loads, and
 * its collection is never queried — see filterStatCards() and loadCounts().
 */
const STAT_SECTIONS = {
  majors: "majors",
  specializations: "specializations",
  academicYears: "academicYears",
  semesters: "semesters",
  subjects: "subjects",
  requirements: "requirements",
};

function lang() {
  return (window.ICC_I18N && window.ICC_I18N.getStoredLang()) || "en";
}
const T = (key) => window.ICC_I18N.t(key, lang());

let me = null;

function escapeHTML(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function fmtWhen(ts) {
  if (!ts) return "—";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(lang() === "ar" ? "ar-JO" : "en-GB", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ------------------------------------------------------------------ */
/* Academic counts                                                     */
/* ------------------------------------------------------------------ */

/**
 * Remove the cards this admin has no VIEW permission for.
 *
 * Runs BEFORE loadCounts so the removed sections are never queried. A card
 * showing "—" for a section you aren't allowed to see still tells you the
 * section exists and that someone is counting it; removing it is what the
 * brief asks for and is also simply more honest about the shape of your
 * access.
 */
function filterStatCards() {
  document.querySelectorAll("[data-stat]").forEach((el) => {
    const section = STAT_SECTIONS[el.getAttribute("data-stat")];
    if (section && !hasPermission(me, section)) el.closest(".admin-stat-card")?.remove();
  });
  const grid = document.querySelector(".admin-stats");
  if (grid && !grid.children.length) grid.remove();
}

/** The sections whose counts this viewer is actually allowed to read. */
function permittedStatSections() {
  return Object.values(STAT_SECTIONS).filter((section) => hasPermission(me, section));
}

async function loadCounts() {
  const mount = document.querySelector("[data-dash-state-mount] .admin-panel__body");
  const wanted = permittedStatSections();
  if (!wanted.length) return;
  try {
    const counts = await getDashboardCounts(wanted);
    document.querySelectorAll("[data-stat]").forEach((el) => {
      const key = el.getAttribute("data-stat");
      // A null means the count could not be read (no permission, or the
      // collection isn't in use yet). Showing "0" would assert something
      // false — that the section is empty — so it renders as a dash.
      if (key in counts) el.textContent = counts[key] === null ? "—" : counts[key];
    });
  } catch (err) {
    console.error("[ICC Admin] Failed to load dashboard counts:", err);
    document.querySelectorAll("[data-stat]").forEach((el) => (el.textContent = "—"));
    if (mount) {
      mount.innerHTML = window.ICC_ADMIN_UI.stateHTML("error", {
        title: T("state_error_title"),
        body: T("state_error_body"),
      });
    }
  }
}

/* ------------------------------------------------------------------ */
/* Quick actions — only the ones this admin may actually perform       */
/* ------------------------------------------------------------------ */

/**
 * Offering "Add major" to an admin who can't manage majors just produces a
 * 403 one click later, so the shortcuts are filtered to the viewer's
 * permissions like the sidebar is.
 */
function filterQuickActions() {
  const map = {
    "majors.html": "majors",
    "specializations.html": "specializations",
    "academic-years.html": "academicYears",
    "curriculum.html": "curriculum",
    "semesters.html": "semesters",
    "subjects.html": "subjects",
    "requirements.html": "requirements",
  };
  document.querySelectorAll(".admin-quick-actions a").forEach((link) => {
    const page = (link.getAttribute("href") || "").split("?")[0];
    const perm = map[page];
    if (perm && !hasPermission(me, perm)) link.remove();
  });
  const wrap = document.querySelector(".admin-quick-actions");
  if (wrap && !wrap.children.length) {
    wrap.closest(".admin-panel")?.remove();
  }
}

/* ------------------------------------------------------------------ */
/* Governance: account totals + pending alert                          */
/* ------------------------------------------------------------------ */

async function loadGovernance() {
  if (!hasPermission(me, "users")) return;
  const panel = document.querySelector("[data-governance-panel]");
  if (panel) panel.hidden = false;

  try {
    const counts = await getGovernanceCounts();
    const usersEl = document.querySelector('[data-gov-stat="users"]');
    const pendingEl = document.querySelector('[data-gov-stat="pending"]');
    if (usersEl) usersEl.textContent = counts.users;
    if (pendingEl) pendingEl.textContent = counts.pending;

    if (counts.pending > 0) {
      const alert = document.querySelector("[data-pending-alert]");
      if (alert) {
        alert.querySelector("[data-pending-text]").textContent = T(
          "admin_dash_pending_alert"
        ).replace("{n}", counts.pending);
        alert.hidden = false;
      }
    }
  } catch (err) {
    console.warn("[ICC Admin] Governance counts unavailable:", err);
    if (panel) panel.hidden = true;
  }
}

/* ------------------------------------------------------------------ */
/* Recent activity                                                     */
/* ------------------------------------------------------------------ */

async function loadActivity() {
  if (!hasPermission(me, "audit")) return;
  const panel = document.querySelector("[data-activity-panel]");
  const mount = document.querySelector("[data-activity-mount]");
  if (!panel || !mount) return;
  panel.hidden = false;

  try {
    const { rows } = await getAuditLogs({ pageSize: 8 });
    if (!rows.length) {
      mount.innerHTML = `<p class="hint">${T("admin_dash_no_activity")}</p>`;
      return;
    }
    mount.innerHTML = `<div class="admin-activity">${rows
      .map((r) => {
        const actor = escapeHTML(r.actorName || r.actorEmail || "—");
        const verb = T(`audit_action_${r.action}`);
        const label = escapeHTML(r.entityLabel || r.targetEmail || r.entityId || "");
        return `
          <div class="admin-activity__row">
            <span class="admin-activity__when">${fmtWhen(r.at)}</span>
            <span class="admin-activity__text"><strong>${actor}</strong> ${verb} ${label}</span>
          </div>`;
      })
      .join("")}</div>`;
  } catch (err) {
    console.warn("[ICC Admin] Recent activity unavailable:", err);
    panel.hidden = true;
  }
}

/* ------------------------------------------------------------------ */
/* Access summary                                                      */
/* ------------------------------------------------------------------ */

function renderAccessSummary() {
  const mount = document.querySelector("[data-access-summary]");
  if (!mount) return;
  if (isSuperAdmin(me)) {
    mount.innerHTML = `<p>${T("admin_dash_your_access_super")}</p>`;
    return;
  }
  const sections = allowedPermissions(me)
    .filter((p) => p.page)
    .map((p) => `<span class="tag">${T(p.labelKey)}</span>`)
    .join(" ");
  mount.innerHTML = `<p>${T("admin_dash_your_access_admin")}</p><div class="admin-quick-actions">${sections}</div>`;
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

async function loadAll() {
  await Promise.all([loadCounts(), loadGovernance(), loadActivity()]);
  renderAccessSummary();
}

document.addEventListener("DOMContentLoaded", () => {
  // PHASE 8: the dashboard is a permissioned section like any other, so it
  // gets a real key rather than the "every admin may see this" null.
  protectAdminPage("dashboard", async (user, profile) => {
    me = profile;
    filterStatCards();
    filterQuickActions();
    await loadAll();
    document.addEventListener("icc:languagechange", loadAll);
  });
});
