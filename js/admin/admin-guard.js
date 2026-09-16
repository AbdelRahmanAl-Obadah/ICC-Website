/**
 * admin-guard.js
 * -----------------------------------------------------------------------
 * Route protection for every /admin/*.html page (except login.html).
 *
 * PHASE 5 upgrade: the gate no longer asks only "is this person an
 * admin?" — it asks "is this person an active admin who holds the specific
 * permission this page requires?".
 *
 * Every protected page:
 *   1. Shows a full-screen gate while Firebase reports auth state.
 *   2. No user signed in                    -> /admin/login.html
 *   3. Signed in but no profile / not an
 *      admin / status not "active"          -> sign out, back to login
 *   4. Admin, but lacks THIS page's
 *      permission                           -> 403 screen, stay signed in,
 *                                              offer the sections they can
 *                                              actually reach
 *   5. All checks pass                      -> render the nav for their
 *                                              permissions, arm the audit
 *                                              actor, run the page callback
 *
 * Step 4 is deliberately not a redirect-to-dashboard: silently bouncing a
 * person who typed a URL makes them think the panel is broken. Telling
 * them plainly that they don't have access to that section — and what they
 * do have — is both clearer and no less secure.
 *
 * Layered enforcement, in order of what actually matters:
 *   firestore.rules (server, authoritative) > this guard > hidden nav links.
 * ------------------------------------------------------------------------
 */

import { onAuthStateChanged, getProfile, signOutAdmin, recordLogin } from "../auth.js";
import {
  hasPermission,
  hasAnyPermission,
  isAdminRole,
  isSuperAdmin,
  allowedPermissions,
  landingPage,
  STATUS,
} from "../permissions.js";
import { renderAdminNav, wireAdminNavLanguage } from "./admin-nav.js";
import { setAuditActor } from "./audit-log.js";

const LOGIN_PATH = "login.html";

function lang() {
  return (window.ICC_I18N && window.ICC_I18N.getStoredLang()) || "en";
}
function T(key) {
  return window.ICC_I18N ? window.ICC_I18N.t(key, lang()) : key;
}

/* ---------------------------------------------------------------------
   Gate
   --------------------------------------------------------------------- */
function showGate() {
  let gate = document.querySelector("[data-admin-gate]");
  if (!gate) {
    gate = document.createElement("div");
    gate.className = "admin-gate";
    gate.setAttribute("data-admin-gate", "");
    gate.innerHTML = `
      <div class="admin-gate__spinner" aria-hidden="true"></div>
      <p>${lang() === "ar" ? "جارٍ التحقق من صلاحياتك…" : "Checking your access…"}</p>
    `;
    document.body.prepend(gate);
  }
  gate.hidden = false;
  const shell = document.querySelector("[data-admin-shell]");
  if (shell) shell.style.visibility = "hidden";
}

function hideGate() {
  const gate = document.querySelector("[data-admin-gate]");
  if (gate) gate.hidden = true;
  const shell = document.querySelector("[data-admin-shell]");
  if (shell) shell.style.visibility = "visible";
}

function goToLogin(reason) {
  const suffix = reason ? `?reason=${encodeURIComponent(reason)}` : "";
  window.location.replace(`${LOGIN_PATH}${suffix}`);
}

function showAccessError(error) {
  console.error("[ICC Admin] Authorization check failed:", error);
  const gate = document.querySelector("[data-admin-gate]");
  if (!gate) return;
  gate.innerHTML = `
    <div class="admin-forbidden">
      <div class="admin-forbidden__code">!</div>
      <h1>${T("admin_access_check_failed")}</h1>
      <p>${T("admin_access_check_failed_body")}</p>
      <button type="button" class="btn btn--primary" onclick="location.reload()">${T("admin_try_again")}</button>
    </div>`;
  gate.hidden = false;
}

function withTimeout(promise, milliseconds) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Authorization request timed out")), milliseconds)),
  ]);
}

/* ---------------------------------------------------------------------
   403 — signed in, authorized for the panel, not for THIS page
   --------------------------------------------------------------------- */
function showForbidden(profile, permissionKey) {
  const gate = document.querySelector("[data-admin-gate]");
  const available = allowedPermissions(profile).filter((p) => p.page && p.page !== "index.html");
  const links = available
    .map((p) => `<a class="btn btn--outline" href="${p.page}">${T(p.labelKey)}</a>`)
    .join("");

  // The Dashboard is itself a permission now, so it is only offered as an
  // escape route when the viewer actually holds it. Otherwise the first
  // section they DO hold becomes the primary action.
  const home = landingPage(profile);
  const homeLabel =
    home === "index.html"
      ? T("admin_nav_dashboard")
      : T(allowedPermissions(profile).find((p) => p.page === home)?.labelKey || "admin_nav_dashboard");

  const body = `
    <div class="admin-forbidden">
      <div class="admin-forbidden__code">403</div>
      <h1>${T("admin_forbidden_title")}</h1>
      <p>${T("admin_forbidden_body").replace("{section}", T(`perm_${permissionKey}`))}</p>
      <div class="admin-forbidden__actions">
        <a class="btn btn--primary" href="${home}">${homeLabel}</a>
        ${links}
      </div>
      <p class="admin-forbidden__hint">${T("admin_forbidden_hint")}</p>
    </div>
  `;

  if (gate) {
    gate.innerHTML = body;
    gate.hidden = false;
  } else {
    document.body.innerHTML = body;
  }
  const shell = document.querySelector("[data-admin-shell]");
  if (shell) shell.style.visibility = "hidden";
}

/* ---------------------------------------------------------------------
   Chrome (user block, sign-out)
   --------------------------------------------------------------------- */
function populateUserChrome(user, profile) {
  const nameEl = document.querySelector("[data-admin-user-name]");
  const emailEl = document.querySelector("[data-admin-user-email]");
  if (nameEl) nameEl.textContent = profile?.displayName || user.displayName || "Admin";
  if (emailEl) emailEl.textContent = user.email || "";

  const signOutBtn = document.querySelector("[data-admin-signout]");
  if (signOutBtn && !signOutBtn.dataset.wired) {
    signOutBtn.dataset.wired = "1";
    signOutBtn.addEventListener("click", async () => {
      try {
        await signOutAdmin();
      } catch (err) {
        console.error("[ICC Admin] Sign out failed:", err);
      }
      goToLogin();
    });
  }
}

/* ---------------------------------------------------------------------
   Public API
   --------------------------------------------------------------------- */

/**
 * Protect an admin page.
 *
 * @param {string|null} permissionKey  permission required to view this
 *        page, e.g. "majors". Pass null for pages every authorized admin
 *        may see (the dashboard).
 * @param {function} onReady  fires once, with (user, profile), only after
 *        every check passes.
 *
 * Also accepts the Phase 3B signature protectAdminPage(onReady) so older
 * page modules keep working untouched.
 */
export function protectAdminPage(permissionKey, onReady) {
  // Backwards compatibility with the Phase 3B one-argument form.
  if (typeof permissionKey === "function") {
    onReady = permissionKey;
    permissionKey = null;
  }

  showGate();
  let settled = false;
  const accessTimeout = setTimeout(() => {
    if (!settled) showAccessError(new Error("Firebase Auth initialization timed out"));
  }, 10000);

  onAuthStateChanged(async (user) => {
    if (settled) return;
    settled = true;
    clearTimeout(accessTimeout);
    if (!user) {
      goToLogin();
      return;
    }

    let profile;
    try {
      profile = await withTimeout(getProfile(user), 10000);
    } catch (error) {
      showAccessError(error);
      return;
    }

    // Not a recognized account at all.
    if (!profile) {
      console.warn("[ICC Admin] Signed-in user has no profile. Signing out.");
      await signOutAdmin().catch(() => {});
      goToLogin("not-admin");
      return;
    }

    // A pending or rejected registration is a normal site user, not staff.
    if (!isAdminRole(profile)) {
      await signOutAdmin().catch(() => {});
      const reason =
        profile.status === STATUS.PENDING
          ? "pending"
          : profile.status === STATUS.DISABLED
          ? "disabled"
          : profile.status === STATUS.REJECTED
          ? "rejected"
          : "not-admin";
      goToLogin(reason);
      return;
    }

    // An admin with every permission revoked has nothing to manage.
    if (!hasAnyPermission(profile)) {
      await signOutAdmin().catch(() => {});
      goToLogin("no-permissions");
      return;
    }

    populateUserChrome(user, profile);
    renderAdminNav(profile);
    wireAdminNavLanguage(profile);
    setAuditActor(profile);
    recordLogin(profile);

    // Per-page permission check.
    if (permissionKey && !hasPermission(profile, permissionKey)) {
      console.warn(`[ICC Admin] Missing permission "${permissionKey}" — blocking page.`);
      showForbidden(profile, permissionKey);
      return;
    }

    hideGate();
    try {
      await onReady(user, profile);
    } catch (err) {
      console.error("[ICC Admin] onReady callback failed:", err);
    }
  });
}

/**
 * login.html only: if the visitor is already a signed-in, authorized
 * admin, skip the login form and go straight to the dashboard. Everyone
 * else is left on the form with the relevant message.
 */
export function redirectIfAlreadyAdmin() {
  onAuthStateChanged(async (user) => {
    if (!user) return;
    const profile = await getProfile(user);
    if (profile && isAdminRole(profile) && hasAnyPermission(profile)) {
      window.location.replace(landingPage(profile));
    }
  });
}

/** Re-export so page modules can gate individual buttons on a permission. */
export { hasPermission, isSuperAdmin, landingPage };
