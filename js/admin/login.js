/**
 * login.js — admin/login.html
 * -----------------------------------------------------------------------
 * Handles email/password sign-in, Google sign-in, and password reset.
 * After a successful sign-in, checks admins/{uid} before letting the user
 * into the panel — a signed-in Google user who isn't an allowlisted admin
 * is immediately signed back out with a clear error, never silently let in.
 * ------------------------------------------------------------------------
 */

import {
  signInAdmin,
  getProfile,
  signInWithGoogle,
  sendAdminPasswordReset,
  isCurrentUserAdmin,
  signOutAdmin,
  friendlyAuthError,
  AuthNotConfiguredError,
} from "../auth.js";
import { redirectIfAlreadyAdmin } from "./admin-guard.js";
import { landingPage } from "../permissions.js";

function lang() {
  return (window.ICC_I18N && window.ICC_I18N.getStoredLang()) || "en";
}

function showError(message) {
  const el = document.querySelector("[data-login-error]");
  if (!el) return;
  el.textContent = message;
  el.classList.add("is-visible");
}

function clearError() {
  const el = document.querySelector("[data-login-error]");
  if (!el) return;
  el.textContent = "";
  el.classList.remove("is-visible");
}

/**
 * PHASE 5 — explain WHY sign-in didn't get them into the panel.
 *
 * "Incorrect email or password" for someone whose credentials were fine but
 * whose account is awaiting approval sends them round in circles. The
 * account states are not secrets from the account's own owner, so each one
 * gets its own message. Note the user is signed straight back out in every
 * failing branch — being left half-signed-in is its own confusion.
 */
async function afterSignIn(user) {
  const profile = await getProfile(user);

  if (!profile) {
    await signOutAdmin().catch(() => {});
    showError(window.ICC_I18N.t("admin_not_admin_error", lang()));
    return;
  }

  const REASON_KEY = {
    pending: "admin_login_pending",
    disabled: "admin_login_disabled",
    rejected: "admin_login_rejected",
  };
  if (profile.status !== "active") {
    await signOutAdmin().catch(() => {});
    showError(window.ICC_I18N.t(REASON_KEY[profile.status] || "admin_not_admin_error", lang()));
    return;
  }

  // A normal registered user isn't an error — they just belong on the
  // public account page, not in the panel.
  if (profile.role === "user") {
    window.location.href = "../signup.html";
    return;
  }

  const adminDoc = await isCurrentUserAdmin(user);
  if (!adminDoc) {
    await signOutAdmin().catch(() => {});
    showError(window.ICC_I18N.t("admin_login_no_permissions", lang()));
    return;
  }
  // Not necessarily the dashboard: an admin may hold sections without
  // holding the overview itself. Send them to the first page they can open.
  window.location.href = landingPage(profile);
}

function handleAuthError(err) {
  console.error("[ICC Admin] Auth error:", err);
  if (err instanceof AuthNotConfiguredError) {
    showError(window.ICC_I18N.t("admin_error_not_configured", lang()));
    return;
  }
  const msg = friendlyAuthError(err);
  showError(msg[lang()] || msg.en);
}

function initEmailForm() {
  const form = document.querySelector("[data-login-form]");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();
    const email = form.email.value.trim();
    const password = form.password.value;
    if (!email || !password) return;

    const submitBtn = document.querySelector("[data-login-submit]");
    submitBtn.disabled = true;
    try {
      const user = await signInAdmin(email, password);
      await afterSignIn(user);
    } catch (err) {
      handleAuthError(err);
    } finally {
      submitBtn.disabled = false;
    }
  });
}

function initGoogleButton() {
  const btn = document.querySelector("[data-google-signin]");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    clearError();
    btn.disabled = true;
    try {
      const user = await signInWithGoogle();
      await afterSignIn(user);
    } catch (err) {
      handleAuthError(err);
    } finally {
      btn.disabled = false;
    }
  });
}

function initForgotPassword() {
  const trigger = document.querySelector("[data-forgot-password]");
  if (!trigger) return;

  trigger.addEventListener("click", () => {
    clearError();
    const body = document.createElement("div");
    const t = window.ICC_I18N.t;
    body.innerHTML = `
      <p>${t("admin_reset_lede", lang())}</p>
      <form data-reset-form class="admin-form">
        <div class="form-field">
          <label for="resetEmail">${t("admin_field_email", lang())}</label>
          <input type="email" id="resetEmail" name="email" required>
        </div>
        <div class="admin-form__actions">
          <button type="submit" class="btn btn--primary" data-reset-submit>${t("admin_reset_send", lang())}</button>
        </div>
      </form>
    `;
    body.querySelector("[data-reset-form]").addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = e.target.email.value.trim();
      if (!email) return;
      const submitBtn = body.querySelector("[data-reset-submit]");
      submitBtn.disabled = true;
      try {
        await sendAdminPasswordReset(email);
        window.ICC_ADMIN_UI.successToast(t("admin_reset_sent", lang()));
        window.ICC_ADMIN_UI.closeModal();
      } catch (err) {
        handleAuthError(err);
      } finally {
        submitBtn.disabled = false;
      }
    });
    window.ICC_ADMIN_UI.openModal({ title: t("admin_reset_title", lang()), bodyEl: body, small: true });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  redirectIfAlreadyAdmin();
  initEmailForm();
  initGoogleButton();
  initForgotPassword();

  // The guard redirects here with a reason when it turns someone away.
  const params = new URLSearchParams(window.location.search);
  const REASONS = {
    "not-admin": "admin_not_admin_error",
    pending: "admin_login_pending",
    disabled: "admin_login_disabled",
    rejected: "admin_login_rejected",
    "no-permissions": "admin_login_no_permissions",
  };
  const reason = params.get("reason");
  if (reason && REASONS[reason]) {
    showError(window.ICC_I18N.t(REASONS[reason], lang()));
  }
});
