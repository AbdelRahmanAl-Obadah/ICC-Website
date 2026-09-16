/**
 * admin-ui.js
 * -----------------------------------------------------------------------
 * Shared, page-agnostic Admin Panel UI helpers: toasts, a generic modal
 * (used both for forms and confirmations), mobile sidebar toggle, and a
 * couple of small form-validation utilities reused by every CRUD page.
 * Loaded as a plain (non-module) script before each page's module script,
 * so it attaches everything to window.ICC_ADMIN_UI.
 * ------------------------------------------------------------------------
 */

function lang() {
  return (window.ICC_I18N && window.ICC_I18N.getStoredLang()) || "en";
}

/* ---------------------------------------------------------------------
   Toasts
   --------------------------------------------------------------------- */
function ensureToastHost() {
  let host = document.querySelector(".admin-toasts");
  if (!host) {
    host = document.createElement("div");
    host.className = "admin-toasts";
    host.setAttribute("aria-live", "polite");
    document.body.appendChild(host);
  }
  return host;
}

function toast(message, type = "info", timeout = 4200) {
  const host = ensureToastHost();
  const el = document.createElement("div");
  el.className = `admin-toast admin-toast--${type}`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => el.remove(), timeout);
}

const successToast = (msg) => toast(msg, "success");
const errorToast = (msg) => toast(msg, "error");

/* ---------------------------------------------------------------------
   Generic modal (form modal or confirm modal share this shell)
   --------------------------------------------------------------------- */
function ensureModalHost() {
  let modal = document.querySelector("[data-admin-modal]");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.className = "admin-modal";
  modal.setAttribute("data-admin-modal", "");
  modal.innerHTML = `
    <div class="admin-modal__box" data-modal-box>
      <div class="admin-modal__head">
        <h3 data-modal-title></h3>
        <button type="button" class="admin-modal__close" data-modal-close aria-label="Close">✕</button>
      </div>
      <div class="admin-modal__body" data-modal-body></div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
  modal.querySelector("[data-modal-close]").addEventListener("click", closeModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("is-open")) closeModal();
  });

  return modal;
}

function openModal({ title, bodyEl, small = false }) {
  const modal = ensureModalHost();
  const box = modal.querySelector("[data-modal-box]");
  box.classList.toggle("admin-modal__box--sm", !!small);
  modal.querySelector("[data-modal-title]").textContent = title || "";
  const bodyMount = modal.querySelector("[data-modal-body]");
  bodyMount.innerHTML = "";
  if (bodyEl) bodyMount.appendChild(bodyEl);
  modal.classList.add("is-open");
  const focusable = modal.querySelector("input, select, textarea, button");
  if (focusable) setTimeout(() => focusable.focus(), 30);
  return modal;
}

function closeModal() {
  const modal = document.querySelector("[data-admin-modal]");
  if (modal) modal.classList.remove("is-open");
}

/**
 * Show a confirmation dialog. Returns a Promise<boolean>.
 * opts: { title, message, warning (optional extra warning text),
 *         confirmLabel, cancelLabel, danger (bool) }
 */
function confirmDialog(opts = {}) {
  const {
    title = lang() === "ar" ? "تأكيد" : "Confirm",
    message = "",
    warning = "",
    confirmLabel = lang() === "ar" ? "تأكيد" : "Confirm",
    cancelLabel = lang() === "ar" ? "إلغاء" : "Cancel",
    danger = false,
  } = opts;

  return new Promise((resolve) => {
    const body = document.createElement("div");
    body.innerHTML = `
      <p>${message}</p>
      ${warning ? `<div class="admin-modal__warning">${warning}</div>` : ""}
      <div class="admin-form__actions">
        <button type="button" class="btn btn--outline" data-cancel>${cancelLabel}</button>
        <button type="button" class="btn ${danger ? "btn--danger" : "btn--primary"}" data-confirm>${confirmLabel}</button>
      </div>
    `;
    body.querySelector("[data-cancel]").addEventListener("click", () => {
      closeModal();
      resolve(false);
    });
    body.querySelector("[data-confirm]").addEventListener("click", () => {
      closeModal();
      resolve(true);
    });
    openModal({ title, bodyEl: body, small: true });
  });
}

/* ---------------------------------------------------------------------
   Form validation helpers
   --------------------------------------------------------------------- */
function setFieldError(fieldWrap, message) {
  if (!fieldWrap) return;
  fieldWrap.classList.add("form-field--invalid");
  const errEl = fieldWrap.querySelector(".form-field__error");
  if (errEl) errEl.textContent = message || "";
}

function clearFieldError(fieldWrap) {
  if (!fieldWrap) return;
  fieldWrap.classList.remove("form-field--invalid");
}

function clearAllErrors(form) {
  form.querySelectorAll(".form-field--invalid").forEach((el) => el.classList.remove("form-field--invalid"));
}

/* ---------------------------------------------------------------------
   Section state (loading/empty/error) for table panels
   --------------------------------------------------------------------- */
function stateHTML(kind, { title, body } = {}) {
  const icon = kind === "error" ? "⚠" : kind === "empty" ? "—" : "…";
  return `
    <div class="admin-state" role="${kind === "error" ? "alert" : "status"}">
      <div class="admin-state__icon">${icon}</div>
      <strong>${title || ""}</strong>
      <p>${body || ""}</p>
    </div>
  `;
}

/* ---------------------------------------------------------------------
   Mobile sidebar toggle
   --------------------------------------------------------------------- */
function initAdminSidebar() {
  const burger = document.querySelector("[data-admin-burger]");
  const sidebar = document.querySelector("[data-admin-sidebar]");
  let scrim = document.querySelector(".admin-scrim");
  if (!scrim) {
    scrim = document.createElement("div");
    scrim.className = "admin-scrim";
    document.body.appendChild(scrim);
  }
  if (!burger || !sidebar) return;

  const close = () => {
    sidebar.classList.remove("is-open");
    scrim.classList.remove("is-open");
  };
  const open = () => {
    sidebar.classList.add("is-open");
    scrim.classList.add("is-open");
  };
  burger.addEventListener("click", () => {
    sidebar.classList.contains("is-open") ? close() : open();
  });
  scrim.addEventListener("click", close);
  sidebar.querySelectorAll("a").forEach((a) => a.addEventListener("click", close));
}

document.addEventListener("DOMContentLoaded", initAdminSidebar);

window.ICC_ADMIN_UI = {
  toast,
  successToast,
  errorToast,
  openModal,
  closeModal,
  confirmDialog,
  setFieldError,
  clearFieldError,
  clearAllErrors,
  stateHTML,
};
