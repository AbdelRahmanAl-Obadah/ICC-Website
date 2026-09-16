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
        <button type="button" class="admin-modal__close" data-modal-close aria-label="Close">${window.ICC_ICONS.icon("close")}</button>
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
  // Was "⚠" / "—" / "…" typed straight into the markup. The dashes were
  // not icons at all, just punctuation standing in for one, and the
  // warning sign rendered as a colour emoji on some platforms and a black
  // outline on others. All three are proper SVGs now.
  const name = kind === "error" ? "alert-triangle" : kind === "empty" ? "layers" : "clock";
  const glyph = window.ICC_ICONS ? window.ICC_ICONS.icon(name) : "";
  return `
    <div class="admin-state" role="${kind === "error" ? "alert" : "status"}">
      <div class="admin-state__icon">${glyph}</div>
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
  if (!burger || !sidebar) return;

  let scrim = document.querySelector(".admin-scrim");
  if (!scrim) {
    scrim = document.createElement("div");
    scrim.className = "admin-scrim";
    document.body.appendChild(scrim);
  }

  const t = (key, fallback) =>
    (window.ICC_I18N && window.ICC_I18N.t(key, window.ICC_I18N.getStoredLang())) || fallback;

  let lastFocused = null;
  const isOpen = () => sidebar.classList.contains("is-open");

  const close = ({ restoreFocus = true } = {}) => {
    if (!isOpen()) return;
    sidebar.classList.remove("is-open");
    scrim.classList.remove("is-open");
    burger.setAttribute("aria-expanded", "false");
    burger.setAttribute("aria-label", t("nav_menu_open", "Open menu"));
    if (restoreFocus && lastFocused) lastFocused.focus({ preventScroll: true });
  };

  const open = () => {
    if (isOpen()) return;
    lastFocused = document.activeElement;
    sidebar.classList.add("is-open");
    scrim.classList.add("is-open");
    burger.setAttribute("aria-expanded", "true");
    burger.setAttribute("aria-label", t("nav_menu_close", "Close menu"));
    // Focus goes into the drawer, so the first Tab lands on a nav link
    // rather than on the page hidden behind it.
    sidebar.querySelector("a, button")?.focus({ preventScroll: true });
  };

  burger.addEventListener("click", () => (isOpen() ? close() : open()));
  scrim.addEventListener("click", () => close());

  // Delegated on purpose. The sidebar's links are rendered by
  // admin-nav.js AFTER this runs, and re-rendered on every language
  // switch — binding each <a> directly (which is what this used to do)
  // meant the drawer stayed open on top of the page just navigated to.
  sidebar.addEventListener("click", (e) => {
    if (e.target.closest("a")) close({ restoreFocus: false });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) close();
  });

  // The drawer is only a drawer below 900px; past that the CSS puts the
  // sidebar back in the layout, and a leftover open state would leave an
  // invisible scrim across the panel.
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (window.innerWidth > 900) close({ restoreFocus: false });
    }, 120);
  });

  document.addEventListener("icc:languagechange", () => {
    burger.setAttribute(
      "aria-label",
      isOpen() ? t("nav_menu_close", "Close menu") : t("nav_menu_open", "Open menu")
    );
  });
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
