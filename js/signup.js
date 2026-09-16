/**
 * signup.js — signup.html
 * -----------------------------------------------------------------------
 * PHASE 5 — public self-service registration.
 *
 * THE ONE THING THIS FILE MUST GET RIGHT
 *   Registering creates a NORMAL user awaiting approval. It never creates
 *   an admin, and it never grants a permission. signUpUser() in js/auth.js
 *   hard-codes role "user" / status "pending", and firestore.rules refuses
 *   any self-created profile with a different role, a different status, or
 *   a non-empty permissions map. So the guarantee doesn't rest on this
 *   file behaving — someone who rewrites this page's JavaScript in their
 *   own browser still cannot register themselves as an administrator.
 *
 * After registering, the same page switches to a status view showing where
 * the request stands: pending, approved, rejected or disabled. That's
 * deliberate — a sign-up form that succeeds and then dumps you back on the
 * homepage leaves people wondering whether it worked.
 * ------------------------------------------------------------------------
 */

import {
  signUpUser,
  signInUser,
  signOutAdmin,
  onAuthStateChanged,
  getProfile,
  friendlyAuthError,
  AuthNotConfiguredError,
} from "./auth.js";
import { STATUS, isAdminRole } from "./permissions.js";

function lang() {
  return (window.ICC_I18N && window.ICC_I18N.getStoredLang()) || "en";
}
const T = (key) => window.ICC_I18N.t(key, lang());

const MIN_PASSWORD_LENGTH = 8;

function showError(message) {
  const el = document.querySelector("[data-signup-error]");
  if (!el) return;
  el.textContent = message;
  el.classList.add("is-visible");
}

function clearError() {
  const el = document.querySelector("[data-signup-error]");
  if (!el) return;
  el.textContent = "";
  el.classList.remove("is-visible");
}

function handleAuthError(err) {
  console.error("[ICC] Sign-up error:", err);
  if (err instanceof AuthNotConfiguredError) {
    showError(T("admin_error_not_configured"));
    return;
  }
  const msg = friendlyAuthError(err);
  showError(msg[lang()] || msg.en);
}

/* ------------------------------------------------------------------ */
/* Status view                                                         */
/* ------------------------------------------------------------------ */

const STATUS_VIEW = {
  [STATUS.PENDING]: { icon: "◷", titleKey: "signup_status_pending_title", bodyKey: "signup_status_pending_body" },
  [STATUS.ACTIVE]: { icon: "✓", titleKey: "signup_status_active_title", bodyKey: "signup_status_active_body" },
  [STATUS.REJECTED]: { icon: "✕", titleKey: "signup_status_rejected_title", bodyKey: "signup_status_rejected_body" },
  [STATUS.DISABLED]: { icon: "⏸", titleKey: "signup_status_disabled_title", bodyKey: "signup_status_disabled_body" },
};

function showStatus(profile) {
  const formPanel = document.querySelector("[data-signup-panel]");
  const statusPanel = document.querySelector("[data-status-panel]");
  if (!formPanel || !statusPanel) return;

  const view = STATUS_VIEW[profile.status] || STATUS_VIEW[STATUS.PENDING];
  formPanel.hidden = true;
  statusPanel.hidden = false;

  statusPanel.querySelector("[data-status-icon]").textContent = view.icon;
  statusPanel.querySelector("[data-status-title]").textContent = T(view.titleKey);
  statusPanel.querySelector("[data-status-body]").textContent = T(view.bodyKey);
  statusPanel.querySelector("[data-status-email]").textContent = profile.email || "";

  // An approved administrator gets a direct route into the panel rather
  // than being told to go and find it.
  const panelLink = statusPanel.querySelector("[data-status-panel-link]");
  panelLink.hidden = !isAdminRole(profile);
}

/* ------------------------------------------------------------------ */
/* Form                                                                */
/* ------------------------------------------------------------------ */

function validate(form) {
  const name = form.displayName.value.trim();
  const email = form.email.value.trim();
  const password = form.password.value;
  const confirm = form.confirmPassword.value;

  if (!name) return T("signup_error_name");
  if (!email) return T("signup_error_email");
  if (password.length < MIN_PASSWORD_LENGTH) return T("signup_error_password_short");
  if (password !== confirm) return T("signup_error_password_match");
  if (!form.terms.checked) return T("signup_error_terms");
  return null;
}

function initForm() {
  const form = document.querySelector("[data-signup-form]");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();

    const problem = validate(form);
    if (problem) {
      showError(problem);
      return;
    }

    const submitBtn = form.querySelector("[data-signup-submit]");
    submitBtn.disabled = true;
    try {
      await signUpUser({
        email: form.email.value.trim(),
        password: form.password.value,
        displayName: form.displayName.value.trim(),
      });
      // The profile was just written as pending; show that immediately
      // rather than re-reading it back over the network.
      showStatus({ email: form.email.value.trim(), status: STATUS.PENDING, role: "user" });
    } catch (err) {
      handleAuthError(err);
    } finally {
      submitBtn.disabled = false;
    }
  });
}

/* ------------------------------------------------------------------ */
/* Sign-in (for people who already registered)                          */
/* ------------------------------------------------------------------ */

function initSignIn() {
  const trigger = document.querySelector("[data-signin-toggle]");
  const signinPanel = document.querySelector("[data-signin-panel]");
  const signupPanel = document.querySelector("[data-signup-panel]");
  if (!trigger || !signinPanel) return;

  trigger.addEventListener("click", () => {
    clearError();
    const showingSignIn = !signinPanel.hidden;
    signinPanel.hidden = showingSignIn;
    signupPanel.hidden = !showingSignIn;
    trigger.textContent = showingSignIn ? T("signup_have_account") : T("signup_no_account");
  });

  const form = document.querySelector("[data-signin-form]");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();
    const btn = form.querySelector("[data-signin-submit]");
    btn.disabled = true;
    try {
      const user = await signInUser(form.email.value.trim(), form.password.value);
      const profile = await getProfile(user);
      if (profile) {
        signinPanel.hidden = true;
        showStatus(profile);
      } else {
        // Signed in, but no profile document — an account created before
        // Phase 5, or one whose profile was deleted. Sign back out rather
        // than leaving them in an undefined state.
        await signOutAdmin().catch(() => {});
        showError(T("signup_error_no_profile"));
      }
    } catch (err) {
      handleAuthError(err);
    } finally {
      btn.disabled = false;
    }
  });
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function initSignOut() {
  const btn = document.querySelector("[data-status-signout]");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    await signOutAdmin().catch(() => {});
    window.location.reload();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initForm();
  initSignIn();
  initSignOut();

  // Already signed in? Skip the form and show where their account stands.
  onAuthStateChanged(async (user) => {
    if (!user) return;
    const profile = await getProfile(user);
    if (profile) showStatus(profile);
  });
});
