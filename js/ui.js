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

/* ==========================================================================
   Mobile navigation
   ==========================================================================
   Rewritten because the previous version opened and closed a panel and
   stopped there. The things it didn't do were the things people actually
   run into on a phone:
     - no way to dismiss it except the burger itself (no scrim, no tap-out)
     - the page behind it still scrolled back to the top, because the
       scroll lock was `overflow:hidden` on <body> with no position restore
     - focus stayed behind the overlay, so a keyboard or screen-reader user
       tabbed into links they couldn't see
     - it stayed open across a rotate/resize into the desktop layout, where
       the panel is hidden but was still holding the scroll lock
     - clicks were bound to the links present at startup, so CMS-rendered
       links (site-chrome.js) didn't close it
     - the current page was never marked in the mobile list
   ========================================================================== */

const NAV_BREAKPOINT = 880;

/* --------------------------------------------------------------------------
   Scroll lock

   Shared by the mobile menu and the curriculum lightbox, both of which
   cover the page and must stop it scrolling underneath. It is a counter,
   not a boolean, because both can be open at once (open the menu, tap a
   link to a major, open the image) and whichever closed first used to
   unlock the page for the other.

   `position: fixed` is the part that actually works on iOS Safari, where
   `overflow: hidden` on <body> is quietly ignored. The cost of fixing the
   body is that it jumps to the top, so the offset is stashed here and
   restored on unlock.
   -------------------------------------------------------------------------- */
let lockCount = 0;
let lockedScrollY = 0;

function lockScroll() {
  if (lockCount++ > 0) return;
  lockedScrollY = window.scrollY;
  document.body.style.top = `-${lockedScrollY}px`;
  document.body.classList.add("no-scroll");
}

/** Clear the lock unconditionally — for bfcache restores, where the page
 *  comes back locked but the counter has been reset to zero. */
function resetScrollLock() {
  lockCount = 0;
  document.body.classList.remove("no-scroll");
  document.body.style.top = "";
}

function unlockScroll() {
  if (lockCount === 0) return;
  if (--lockCount > 0) return;
  document.body.classList.remove("no-scroll");
  document.body.style.top = "";
  window.scrollTo(0, lockedScrollY);
}

function initMobileNav() {
  const burger = document.querySelector("[data-nav-burger]");
  // The panel and the link list are separate elements: the CMS re-renders
  // the list, and it must not be able to blow away the panel's footer.
  const panel = document.querySelector("[data-nav-panel]") || document.querySelector("[data-nav-mobile]");
  const scrim = document.querySelector("[data-nav-scrim]");
  if (!burger || !panel) return;

  let lastFocused = null;

  const t = (key, fallback) =>
    (window.ICC_I18N && window.ICC_I18N.t(key, window.ICC_I18N.getStoredLang())) || fallback;

  const isOpen = () => panel.classList.contains("is-open");

  const close = ({ restoreFocus = true } = {}) => {
    if (!isOpen()) return;
    burger.setAttribute("aria-expanded", "false");
    burger.setAttribute("aria-label", t("nav_menu_open", "Open menu"));
    panel.classList.remove("is-open");
    scrim?.classList.remove("is-open");
    unlockScroll();
    if (restoreFocus && lastFocused) lastFocused.focus({ preventScroll: true });
  };

  const open = () => {
    if (isOpen()) return;
    lastFocused = document.activeElement;
    burger.setAttribute("aria-expanded", "true");
    burger.setAttribute("aria-label", t("nav_menu_close", "Close menu"));
    panel.classList.add("is-open");
    scrim?.classList.add("is-open");
    lockScroll();
    // Move focus into the panel so the next Tab lands on a menu link and
    // not on whatever is underneath the overlay.
    panel.querySelector("a, button")?.focus({ preventScroll: true });
  };

  burger.addEventListener("click", () => (isOpen() ? close() : open()));
  scrim?.addEventListener("click", () => close());

  // Delegated, so links the CMS renders later close the menu too.
  panel.addEventListener("click", (e) => {
    if (e.target.closest("a")) close({ restoreFocus: false });
  });

  document.addEventListener("keydown", (e) => {
    if (!isOpen()) return;

    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }

    // Keep Tab inside the open panel (plus the burger, which is the way
    // back out). Without this, tabbing walks the hidden page behind it.
    if (e.key === "Tab") {
      const focusable = [
        burger,
        ...panel.querySelectorAll('a[href], button:not([disabled]), input, select, textarea'),
      ].filter((el) => el.offsetParent !== null || el === burger);
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  // Resizing or rotating past the breakpoint hides the panel in CSS; the
  // state has to follow, or the page stays scroll-locked behind a menu
  // that is no longer visible.
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (window.innerWidth > NAV_BREAKPOINT) close({ restoreFocus: false });
    }, 120);
  });

  // In-page anchors (requirements.html#college and friends) navigate
  // without a page load, so close on hash change as well.
  window.addEventListener("hashchange", () => close({ restoreFocus: false }));

  // Back/forward can restore a page straight out of the bfcache with the
  // menu still open and the body still locked, while the counter above has
  // been reset — so this clears the lock outright rather than decrementing.
  window.addEventListener("pageshow", (e) => {
    if (!e.persisted) return;
    panel.classList.remove("is-open");
    scrim?.classList.remove("is-open");
    burger.setAttribute("aria-expanded", "false");
    resetScrollLock();
  });

  // The burger's own label is language-dependent; keep it in sync.
  document.addEventListener("icc:languagechange", () => {
    burger.setAttribute("aria-label", isOpen() ? t("nav_menu_close", "Close menu") : t("nav_menu_open", "Open menu"));
  });
}

function initLightbox() {
  const frame = document.querySelector("[data-curriculum-frame]");
  const lightbox = document.querySelector("[data-lightbox]");
  if (!frame || !lightbox) return;

  const img = lightbox.querySelector("img");
  const closeBtn = lightbox.querySelector("[data-lightbox-close]");
  const sourceImg = frame.querySelector("img");

  const unzoom = () => {
    img.classList.remove("is-zoomed");
    img.style.transformOrigin = "";
  };

  const open = () => {
    if (sourceImg) img.src = sourceImg.src;
    unzoom();
    lightbox.classList.add("is-open");
    lockScroll();
    closeBtn.focus();
  };

  const close = () => {
    if (!lightbox.classList.contains("is-open")) return;
    lightbox.classList.remove("is-open");
    unlockScroll();
    unzoom();
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

  // Zoom (double-click / double-tap toggles a larger view, keeping the
  // tap point roughly centered). Plain vanilla JS, no library, and it
  // never interferes with the click-outside-to-close behavior above since
  // it's bound to the image itself, not the lightbox backdrop.
  img.addEventListener("dblclick", (e) => {
    if (!img.classList.contains("is-zoomed")) {
      const rect = img.getBoundingClientRect();
      const originX = ((e.clientX - rect.left) / rect.width) * 100;
      const originY = ((e.clientY - rect.top) / rect.height) * 100;
      img.style.transformOrigin = `${originX}% ${originY}%`;
      img.classList.add("is-zoomed");
    } else {
      unzoom();
    }
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
  // Applies to the desktop nav, the mobile menu and the footer alike —
  // every list now carries data-nav-key, so "which page am I on" is
  // answered the same way in all of them.
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

window.ICC_UI = { setSectionState, markCurrentNav: initNavCurrentPage };
