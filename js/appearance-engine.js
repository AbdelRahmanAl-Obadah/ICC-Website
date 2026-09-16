/**
 * appearance-engine.js
 * -----------------------------------------------------------------------
 * PHASE 7 (Part 2) — the pure appearance renderer: turns a validated
 * appearance object into CSS custom properties and data attributes on a
 * root element.
 *
 * SPLIT OUT OF appearance.js ON PURPOSE.
 * The public site's appearance.js has side effects — it loads the CMS on
 * import and themes document.documentElement on DOMContentLoaded. That is
 * exactly right for the public site and exactly wrong for the Admin Panel,
 * which imports this renderer to drive its live preview: importing the
 * public module would have re-themed the panel itself with the published
 * public theme, so an admin previewing a dark theme would find the form
 * they were editing had gone dark underneath them.
 *
 * So this file contains no side effects at all. It exports functions and
 * does nothing on import. Both the public site and the admin preview call
 * applyAppearance() from here, which is what guarantees the preview is the
 * real renderer rather than a look-alike maintained separately.
 * ------------------------------------------------------------------------ */

import { APPEARANCE_OPTIONS } from "./cms-schema.js";

/* ==========================================================================
   TOKEN MAPPING
   ==========================================================================
   Left side: the CSS custom property the stylesheets already consume.
   Right side: the appearance field that feeds it.

   Some tokens are fed by a derived value rather than a stored one —
   --icc-blue-dim and --icc-blue-tint are shades of the primary colour, and
   asking an admin to pick three colours that must stay in a particular
   relationship is asking them to make a mistake. They are computed below.
   ========================================================================== */

const COLOR_TOKENS = {
  "--icc-blue": "color_primary",
  "--icc-gray": "color_secondary",
  "--icc-accent": "color_accent",
  "--icc-white": "color_bg",
  "--icc-gray-soft": "color_surface",
  "--icc-ink": "color_text",
  "--icc-ink-soft": "color_text_soft",
  "--icc-border-color": "color_border",
};

const SIZE_TOKENS = {
  "--radius": ["radius", "px"],
  "--content-width": ["container_width", "px"],
  "--section-spacing": ["section_spacing", "px"],
  "--border-width": ["border_width", "px"],
};

/** Option fields that become data-* attributes on <html>. */
const ATTRIBUTE_FIELDS = [
  "button_style",
  "card_style",
  "header_style",
  "navbar_style",
  "footer_style",
  "hero_style",
  "shadow_style",
  "font_pairing",
  "density",
];

/* ==========================================================================
   COLOUR MATHS
   ==========================================================================
   Deriving the hover shade and the pale tint from the primary colour, so
   one colour choice produces a coherent set rather than three fields an
   admin has to keep in sync by eye.
   ========================================================================== */

function hexToRgb(hex) {
  const clean = (hex || "").replace("#", "");
  if (clean.length !== 6) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }) {
  const to = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** Mix a colour toward black (amount < 0) or white (amount > 0). */
function shade(hex, amount) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const target = amount > 0 ? 255 : 0;
  const t = Math.abs(amount);
  return rgbToHex({
    r: rgb.r + (target - rgb.r) * t,
    g: rgb.g + (target - rgb.g) * t,
    b: rgb.b + (target - rgb.b) * t,
  });
}

/**
 * Relative luminance, used to decide whether text on a coloured button
 * should be black or white.
 *
 * Worth doing properly rather than assuming white: an admin who picks a
 * pale yellow primary gets white-on-yellow text if this is hard-coded,
 * which is unreadable. The CMS shouldn't be able to produce an
 * inaccessible site through a choice that looked reasonable.
 */
function luminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const channel = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

function readableOn(hex) {
  return luminance(hex) > 0.5 ? "#14171a" : "#ffffff";
}

/* ==========================================================================
   APPLICATION
   ========================================================================== */

/**
 * Apply an appearance object to a root element.
 *
 * Takes the root as a parameter so the Admin Panel's live preview can
 * apply a candidate theme to a preview container using this exact
 * function. A preview maintained separately from the real renderer drifts,
 * and then it is showing admins something the site will not actually do.
 */
export function applyAppearance(values, root = document.documentElement) {
  if (!values || !root) return;

  // --- Colours ---------------------------------------------------------
  Object.entries(COLOR_TOKENS).forEach(([token, field]) => {
    if (values[field]) root.style.setProperty(token, values[field]);
  });

  // Derived shades, so one primary colour yields a coherent set.
  const primary = values.color_primary;
  if (primary) {
    root.style.setProperty("--icc-blue-dim", shade(primary, -0.18));
    root.style.setProperty("--icc-blue-tint", shade(primary, 0.88));
    root.style.setProperty("--icc-on-primary", readableOn(primary));
  }
  if (values.color_accent) {
    root.style.setProperty("--icc-on-accent", readableOn(values.color_accent));
  }

  // The composite --border token is built from its two parts, since the
  // stylesheets use it as a shorthand.
  if (values.color_border) {
    root.style.setProperty("--border", `${values.border_width}px solid ${values.color_border}`);
  }

  // --- Sizes -----------------------------------------------------------
  Object.entries(SIZE_TOKENS).forEach(([token, [field, unit]]) => {
    if (values[field] !== undefined) root.style.setProperty(token, `${values[field]}${unit}`);
  });

  // --- Shadows ---------------------------------------------------------
  // Mapped to a token rather than an attribute as well, because several
  // components compose their own shadow from this value.
  const SHADOWS = {
    none: "none",
    subtle: "0 1px 2px rgba(20, 23, 26, 0.04)",
    soft: "0 4px 14px rgba(20, 23, 26, 0.08)",
    strong: "0 10px 30px rgba(20, 23, 26, 0.16)",
  };
  root.style.setProperty("--shadow-card", SHADOWS[values.shadow_style] || SHADOWS.subtle);

  // --- Typography ------------------------------------------------------
  // The font scale moves the root font-size, and the type scale in
  // style.css is expressed in rem — so one value moves every size in
  // proportion instead of needing a rule per element.
  if (values.font_scale) root.style.fontSize = `${values.font_scale}%`;

  // --- Option attributes ----------------------------------------------
  ATTRIBUTE_FIELDS.forEach((field) => {
    const allowed = APPEARANCE_OPTIONS[field] || [];
    const value = allowed.includes(values[field]) ? values[field] : allowed[0];
    if (value) root.setAttribute(`data-${field.replace(/_/g, "-")}`, value);
  });

  applyColorMode(values.color_mode, root);
}

/**
 * Light / dark / auto.
 *
 * "auto" defers to the visitor's OS preference via a media query in
 * css/appearance.css rather than being resolved here, so a visitor who
 * changes their system theme mid-session sees the site follow without a
 * reload — and so the decision isn't frozen at page-load time.
 */
function applyColorMode(mode, root = document.documentElement) {
  const value = ["light", "dark", "auto"].includes(mode) ? mode : "light";
  root.setAttribute("data-color-mode", value);
}
