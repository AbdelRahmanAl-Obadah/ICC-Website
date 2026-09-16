/**
 * admin-nav.js
 * -----------------------------------------------------------------------
 * PHASE 5 — builds the Admin Panel sidebar from the signed-in user's
 * permissions instead of a hard-coded list baked into every HTML file.
 *
 * Each admin page now ships an empty <nav data-admin-nav></nav> and this
 * module fills it in. A Super Admin sees every section; an Admin sees only
 * the sections they hold a permission for.
 *
 * To be very clear about what this is and isn't: hiding a link is a
 * courtesy, not a control. Typing /admin/users.html directly still lands
 * on a page whose own guard re-checks the permission (admin-guard.js), and
 * even if that were patched out in the browser, every read and write the
 * page attempts is evaluated against firestore.rules server-side. Three
 * independent layers, of which this is the least important.
 * ------------------------------------------------------------------------
 */

import { PERMISSIONS, PERMISSION_GROUPS, hasPermission, isSuperAdmin } from "../permissions.js";
import { icon } from "../icons.js";

function lang() {
  return (window.ICC_I18N && window.ICC_I18N.getStoredLang()) || "en";
}

function T(key) {
  return window.ICC_I18N ? window.ICC_I18N.t(key, lang()) : key;
}

function currentFile() {
  const parts = window.location.pathname.split("/");
  return parts[parts.length - 1] || "index.html";
}

/**
 * Render the sidebar navigation for this profile.
 *
 * PHASE 8: the Dashboard is no longer a hard-coded link outside the
 * permission system. It is a section like any other (`dashboard`), so an
 * admin who hasn't been granted it doesn't see it — which is what makes
 * "the sidebar shows only what you can VIEW" true without exceptions.
 */
export function renderAdminNav(profile) {
  const nav = document.querySelector("[data-admin-nav]");
  if (!nav) return;

  const here = currentFile();
  // `iconName` is a key in js/icons.js — see the note above PERMISSIONS for
  // why these are names rather than the Unicode glyphs they used to be.
  const linkHTML = (href, iconName, label, active) => `
    <a class="admin-nav__link${active ? " is-active" : ""}" href="${href}"${active ? ' aria-current="page"' : ""}>
      <span class="icn" aria-hidden="true">${icon(iconName)}</span><span>${label}</span>
    </a>`;

  let html = "";

  // A section appears in the sidebar if it owns a page, or if it deep-links
  // into someone else's page via navHref (see the `permissions` entry in
  // permissions.js). For the latter, `navFor` names the file it lands on so
  // the active state is still correct — and the owning section's own link
  // is only highlighted when no deep-link on that file matches the current
  // query string, so the two never both light up.
  const search = window.location.search;

  PERMISSION_GROUPS.forEach((group) => {
    const items = PERMISSIONS.filter(
      (p) => p.group === group.key && (p.page || p.navHref) && hasPermission(profile, p.key)
    );
    if (!items.length) return;

    const deepLinkActive = items.some(
      (p) => p.navHref && p.navFor === here && search && p.navHref.endsWith(search)
    );

    // "Overview" holds only the Dashboard and sits at the top, where a
    // group heading above a single link is just noise.
    if (group.key !== "overview") {
      html += `<div class="admin-nav__group">${T(group.labelKey)}</div>`;
    }
    items.forEach((p) => {
      const href = p.navHref || p.page;
      const active = p.navHref
        ? p.navFor === here && search !== "" && p.navHref.endsWith(search)
        : here === p.page && !deepLinkActive;
      html += linkHTML(href, p.icon, T(p.labelKey), active);
    });
  });

  nav.innerHTML = html;

  // Role badge next to the user block, so it's always obvious which level
  // you're operating at — a Super Admin doing routine edits should see it.
  const badgeMount = document.querySelector("[data-admin-role-badge]");
  if (badgeMount) {
    const superAdmin = isSuperAdmin(profile);
    badgeMount.textContent = superAdmin ? T("role_superadmin") : T("role_admin");
    badgeMount.className = `badge ${superAdmin ? "badge--super" : "badge--admin"}`;
  }
}

/** Re-render on language switch so the sidebar labels follow the toggle. */
export function wireAdminNavLanguage(profile) {
  document.addEventListener("icc:languagechange", () => renderAdminNav(profile));
}
