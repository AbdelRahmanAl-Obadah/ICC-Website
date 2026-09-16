/**
 * appearance.js
 * -----------------------------------------------------------------------
 * PHASE 7 (Part 2) — applies the published appearance configuration to the
 * public site.
 *
 * ==========================================================================
 * HOW A SETTING REACHES EVERY PAGE
 * ==========================================================================
 * Two mechanisms, and no third:
 *
 *   1. CSS CUSTOM PROPERTIES for anything continuous — colours, radius,
 *      spacing, container width, border width. The stylesheets already
 *      read these tokens (see the :root block in css/style.css), so
 *      overriding a token changes every button, card and link that uses
 *      it, everywhere, with no new CSS and no per-page wiring. That is
 *      what makes "change the primary colour" a one-field operation
 *      instead of a find-and-replace.
 *
 *   2. DATA ATTRIBUTES ON <html> for anything that is a choice between
 *      looks — button style, card style, header, navbar, footer, hero,
 *      shadows, density, typography, light/dark. css/appearance.css holds
 *      one block per option. The admin picks a token; the rules that token
 *      selects were written and reviewed here.
 *
 * Neither path can carry arbitrary CSS. There is no field in the schema
 * whose contents become a style rule, which is why an admin cannot inject
 * one — the range of possible looks is fixed in reviewed code, and the CMS
 * only chooses among them.
 *
 * ==========================================================================
 * FAIL-SOFT
 * ==========================================================================
 * Values arrive already validated by normalizeAppearance() in cms-schema.js,
 * which substitutes the ICC default for anything missing or malformed. So
 * this module always has a complete, valid object to apply — including
 * when Firestore is unreachable, in which case that object IS the ICC
 * default and the site renders exactly as it shipped.
 * ------------------------------------------------------------------------ */

import { loadCms, getAppearance, currentLang } from "./cms.js";
import { applyAppearance } from "./appearance-engine.js";
import { safeUrl } from "./cms-schema.js";

// Re-exported so existing importers keep working and there is still one
// obvious place to reach the renderer from.
export { applyAppearance };

/* ==========================================================================
   BRANDING ASSETS
   ========================================================================== */

/**
 * Swap the logo and favicon when the CMS supplies replacements.
 *
 * Only ever an override: with no configured logo the markup's own image is
 * left exactly as it is. Removing the shipped logo because the CMS field
 * is blank would be the CMS making the site worse by being empty.
 */
function applyBranding(values) {
  const logo = safeUrl(values.logo_url);
  const logoDark = safeUrl(values.logo_dark_url);

  if (logo) {
    document.querySelectorAll("[data-site-logo]").forEach((img) => {
      img.src = logo;
    });
  }
  if (logoDark) {
    document.querySelectorAll("[data-site-logo-dark]").forEach((img) => {
      img.src = logoDark;
    });
  }

  const favicon = safeUrl(values.favicon_url);
  if (favicon) {
    let link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = favicon;
  }
}

/* ==========================================================================
   MAINTENANCE BANNER
   ========================================================================== */

/**
 * Show the maintenance notice when the setting is on.
 *
 * Deliberately a BANNER, not a blocking screen. This is a static site with
 * no server-side gate: a "maintenance wall" rendered in JavaScript stops
 * nobody who can open developer tools, so implementing one would create a
 * false impression of access control. A clear notice is honest about what
 * it is, and it keeps the site — and the Admin Panel that turns the flag
 * back off — reachable.
 *
 * Text is inserted with textContent, never innerHTML: an admin-editable
 * string that reaches every visitor must not be able to carry markup.
 */
function applyMaintenanceBanner(settings) {
  const existing = document.querySelector("[data-site-banner]");
  const m = settings.maintenance || {};
  const lang = currentLang();
  const text = (lang === "ar" ? m.maintenance_message_ar : m.maintenance_message_en) || "";

  if (!m.maintenance_mode || !text.trim()) {
    if (existing) existing.remove();
    return;
  }

  const banner = existing || document.createElement("div");
  if (!existing) {
    banner.className = "site-banner";
    banner.setAttribute("data-site-banner", "");
    banner.setAttribute("role", "status");
    document.body.prepend(banner);
  }
  banner.textContent = text;
}

/* ==========================================================================
   BOOTSTRAP
   ========================================================================== */

async function init() {
  // Shares the single CMS read with every other consumer — see js/cms.js.
  const cms = await loadCms();
  applyAppearance(getAppearance());
  applyBranding(getAppearance());
  applyMaintenanceBanner(cms.settings);
}

document.addEventListener("DOMContentLoaded", init);

// The maintenance message is bilingual, so it follows the language toggle.
document.addEventListener("icc:languagechange", () => {
  const cms = window.__ICC_CMS__;
  if (cms) applyMaintenanceBanner(cms.settings);
});

// Exposed so the language listener above and the admin preview can reach
// the loaded config without a second import cycle.
loadCms().then((cms) => {
  window.__ICC_CMS__ = cms;
});
