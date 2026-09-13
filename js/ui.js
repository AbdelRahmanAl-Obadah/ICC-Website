/**
 * ui.js
 * -----------------------------------------------------------------------
 * Shared, page-agnostic UI behavior: mobile navigation, the curriculum
 * image lightbox, and small helpers for showing loading/empty/error
 * states. Kept deliberately small — page-specific rendering (majors,
 * subjects) lives in its own module so this file never grows into a
 * dumping ground.
 * ------------------------------------------------------------------------
 */

function initMobileNav() {
  const burger = document.querySelector("[data-nav-burger]");
  const mobile = document.querySelector("[data-nav-mobile]");
  if (!burger || !mobile) return;

  const close = () => {
    burger.setAttribute("aria-expanded", "false");
    mobile.classList.remove("is-open");
    document.body.classList.remove("no-scroll");
  };

  const open = () => {
    burger.setAttribute("aria-expanded", "true");
    mobile.classList.add("is-open");
    document.body.classList.add("no-scroll");
  };

  burger.addEventListener("click", () => {
    const isOpen = burger.getAttribute("aria-expanded") === "true";
    isOpen ? close() : open();
  });

  mobile.querySelectorAll("a").forEach((link) => link.addEventListener("click", close));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
}

function initLightbox() {
  const frame = document.querySelector("[data-curriculum-frame]");
  const lightbox = document.querySelector("[data-lightbox]");
  if (!frame || !lightbox) return;

  const img = lightbox.querySelector("img");
  const closeBtn = lightbox.querySelector("[data-lightbox-close]");
  const sourceImg = frame.querySelector("img");

  const open = () => {
    if (sourceImg) img.src = sourceImg.src;
    lightbox.classList.add("is-open");
    document.body.classList.add("no-scroll");
    closeBtn.focus();
  };

  const close = () => {
    lightbox.classList.remove("is-open");
    document.body.classList.remove("no-scroll");
    frame.focus();
  };

  frame.addEventListener("click", open);
  frame.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  });
  closeBtn.addEventListener("click", close);
  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && lightbox.classList.contains("is-open")) close();
  });
}

/**
 * Toggle between loading / content / empty / error states for a section.
 * Expects sibling elements marked with data-state="loading|content|empty|error"
 * inside the given container.
 */
function setSectionState(container, state) {
  if (!container) return;
  container.querySelectorAll("[data-state]").forEach((el) => {
    el.hidden = el.getAttribute("data-state") !== state;
  });
}

function initNavCurrentPage() {
  const page = document.body.getAttribute("data-page");
  if (!page) return;
  document.querySelectorAll(`[data-nav-key="${page}"]`).forEach((link) => {
    link.setAttribute("aria-current", "page");
  });
}

/**
 * Reveal-on-scroll: any element with [data-reveal] fades/slides in once it
 * enters the viewport. Falls back to instantly visible if IntersectionObserver
 * isn't available; prefers-reduced-motion users get instant visibility via CSS.
 */
function initRevealOnScroll() {
  const items = document.querySelectorAll("[data-reveal]");
  if (!items.length) return;

  if (!("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );

  items.forEach((el) => observer.observe(el));
}

document.addEventListener("DOMContentLoaded", () => {
  initMobileNav();
  initLightbox();
  initNavCurrentPage();
  initRevealOnScroll();
});

window.ICC_UI = { setSectionState };
