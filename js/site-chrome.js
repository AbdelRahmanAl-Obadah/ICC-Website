/**
 * site-chrome.js
 * -----------------------------------------------------------------------
 * PHASE 7 (Part 2) — renders the CMS-managed parts of the public page
 * shell: primary navigation, footer links, and the homepage sections
 * built in the Homepage CMS.
 *
 * ==========================================================================
 * PROGRESSIVE ENHANCEMENT, NOT REPLACEMENT
 * ==========================================================================
 * Every one of these regions already exists in the HTML with working
 * content. This module replaces a region ONLY when the CMS actually has
 * something for it. The consequences of getting that backwards are worth
 * spelling out: if this module cleared the nav and then failed to load,
 * the site would have no navigation at all — a CMS outage would become a
 * total loss of the site's structure rather than a return to its defaults.
 *
 * So the shipped markup is the floor. The CMS raises it.
 *
 * ==========================================================================
 * NO innerHTML FOR CMS VALUES
 * ==========================================================================
 * Every element here is built with createElement and filled with
 * textContent, and every URL passes through safeUrl() a second time even
 * though cms-schema.js already validated it on load. Admin-authored
 * strings reach every visitor on every page; they are the highest-value
 * injection target on the site, and the cost of checking twice is nothing.
 * ------------------------------------------------------------------------ */

import { loadCms, getNavigation, getHomepageSections, localize, currentLang } from "./cms.js";
import { safeUrl, getSectionType } from "./cms-schema.js";

/* ==========================================================================
   HELPERS
   ========================================================================== */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/**
 * Build an anchor from a CMS link, or return null when it isn't usable.
 * Returning null rather than a dead <a> matters: a menu item that looks
 * clickable and does nothing is worse than one that isn't rendered.
 */
function linkFrom(item, className, language) {
  const href = safeUrl(item.url);
  const label = localize(item.label, language);
  if (!href || !label) return null;

  const a = el("a", className, label);
  a.href = href;

  if (item.newTab) {
    a.target = "_blank";
    // noopener stops the opened page reaching back through window.opener;
    // noreferrer keeps the referrer off third-party links. Both matter
    // because these destinations are admin-supplied and may be external.
    a.rel = "noopener noreferrer";
  }
  return a;
}

/* ==========================================================================
   NAVIGATION
   ========================================================================== */

/**
 * Mark the link matching the page being viewed.
 *
 * The shipped markup does this with `data-nav-key` attributes read by
 * js/ui.js, but CMS-authored links have no such key — an admin should not
 * have to know about an internal attribute to get a working active state.
 * So it is derived from the href instead, which is information the CMS
 * already has.
 */
function markCurrent(container) {
  const here = window.location.pathname.split("/").pop() || "index.html";
  container.querySelectorAll("a").forEach((a) => {
    const target = (a.getAttribute("href") || "").split("?")[0].split("#")[0];
    if (target === here || (here === "index.html" && target === "")) {
      a.setAttribute("aria-current", "page");
    }
  });
}

/**
 * Replace the primary nav links when the CMS defines any.
 *
 * Renders into BOTH the desktop nav and the mobile menu, which are
 * separate element lists in the markup. Updating only the desktop one
 * would leave phone visitors on the built-in menu — the two would
 * silently disagree, and the disagreement would only show up on the
 * devices least likely to be used for testing.
 */
function renderNav(language) {
  const items = getNavigation("primary");
  if (!items.length) return; // keep the markup's own nav

  const targets = [
    { selector: "[data-cms-nav]", className: "nav__link" },
    { selector: "[data-nav-mobile]", className: "nav__mobile-link" },
  ];

  targets.forEach(({ selector, className }) => {
    document.querySelectorAll(selector).forEach((container) => {
      const links = items.map((item) => linkFrom(item, className, language)).filter(Boolean);
      if (!links.length) return;

      container.textContent = "";
      links.forEach((a) => container.appendChild(a));
      markCurrent(container);

      // Closing the mobile menu on link click is no longer re-wired here.
      // js/ui.js listens on the panel instead of on each link, so links
      // that appear later — these ones — are already covered, and the
      // panel's own footer (the language switch) is no longer inside the
      // container being cleared above, so replacing the nav can't delete
      // it any more.
    });
  });
}

function renderFooterNav(language) {
  const items = getNavigation("footer");
  if (!items.length) return;

  document.querySelectorAll("[data-cms-footer-nav]").forEach((container) => {
    const list = items
      .map((item) => {
        const a = linkFrom(item, "", language);
        if (!a) return null;
        const li = el("li");
        li.appendChild(a);
        return li;
      })
      .filter(Boolean);
    if (!list.length) return;

    container.textContent = "";
    list.forEach((li) => container.appendChild(li));
  });
}

/* ==========================================================================
   HOMEPAGE SECTIONS
   ========================================================================== */

function sectionButtons(section, language) {
  const wrap = el("div", "cms-section__actions");
  const pairs = [
    [section.buttonText, section.buttonUrl, "btn btn--primary"],
    [section.buttonText2, section.buttonUrl2, "btn btn--outline"],
  ];

  pairs.forEach(([textValue, urlValue, className]) => {
    const label = localize(textValue, language);
    const href = safeUrl(urlValue);
    // Both halves are required. A button with a label and no destination
    // is decoration; a destination with no label is invisible.
    if (!label || !href) return;
    const a = el("a", className, label);
    a.href = href;
    wrap.appendChild(a);
  });

  return wrap.children.length ? wrap : null;
}

function sectionItems(section, language) {
  if (!Array.isArray(section.items) || !section.items.length) return null;
  const wrap = el("div", "cms-items");

  section.items.forEach((item) => {
    const value = localize(item.value, language);
    const label = localize(item.label, language);
    if (!value && !label) return;

    const card = el("div", "cms-item");
    if (value) card.appendChild(el("strong", "cms-item__value", value));
    if (label) card.appendChild(el("span", "cms-item__label", label));
    wrap.appendChild(card);
  });

  return wrap.children.length ? wrap : null;
}

/**
 * Build one homepage section.
 *
 * Each field is rendered only when it has content, so a CTA with no
 * subtitle produces no empty <p> — an admin leaving a field blank should
 * get a tighter section, not a gap.
 */
function buildSection(section, language) {
  const def = getSectionType(section.type);
  if (!def) return null;

  const wrapper = el("section", `cms-section cms-section--${section.type}`);
  wrapper.setAttribute("data-cms-section", section.id);

  const inner = el("div", "cms-section__inner");

  const eyebrow = localize(section.eyebrow, language);
  if (eyebrow) inner.appendChild(el("p", "cms-section__eyebrow", eyebrow));

  const title = localize(section.title, language);
  if (title) inner.appendChild(el("h2", "cms-section__title", title));

  const subtitle = localize(section.subtitle, language);
  if (subtitle) inner.appendChild(el("p", "cms-section__subtitle", subtitle));

  const description = localize(section.description, language);
  if (description) inner.appendChild(el("p", "cms-section__desc", description));

  const items = sectionItems(section, language);
  if (items) inner.appendChild(items);

  const buttons = sectionButtons(section, language);
  if (buttons) inner.appendChild(buttons);

  const image = safeUrl(section.image);
  if (image) {
    const img = el("img", "cms-section__image");
    img.src = image;
    img.alt = title || "";
    img.loading = "lazy";
    img.decoding = "async";
    inner.appendChild(img);
  }

  // A section with nothing but a wrapper is not worth a screenful of
  // padding on the live homepage.
  if (!inner.children.length) return null;

  wrapper.appendChild(inner);
  return wrapper;
}

/**
 * Render CMS homepage sections into their mount point.
 *
 * The mount is a dedicated empty container in index.html, NOT the existing
 * hand-built sections. CMS sections are added alongside what ships, so
 * turning the CMS on doesn't blank the homepage and turning it off doesn't
 * either. An admin who wants to replace a shipped section hides it
 * deliberately rather than having it vanish as a side effect.
 */
function renderHomepage(language) {
  const mount = document.querySelector("[data-cms-sections]");
  if (!mount) return;

  const sections = getHomepageSections();
  mount.textContent = "";
  if (!sections.length) {
    mount.hidden = true;
    return;
  }

  const nodes = sections.map((s) => buildSection(s, language)).filter(Boolean);
  if (!nodes.length) {
    mount.hidden = true;
    return;
  }

  mount.hidden = false;
  nodes.forEach((node) => mount.appendChild(node));
}

/* ==========================================================================
   BOOTSTRAP
   ========================================================================== */

function renderAll() {
  const language = currentLang();
  renderNav(language);
  renderFooterNav(language);
  renderHomepage(language);
}

async function init() {
  // Shares the single CMS read with appearance.js and site-content.js.
  await loadCms();
  renderAll();
}

document.addEventListener("DOMContentLoaded", init);

// Everything here is bilingual, so it all re-renders on a language switch.
document.addEventListener("icc:languagechange", renderAll);
