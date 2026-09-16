/**
 * icons.js
 * -----------------------------------------------------------------------
 * One place for every icon on the site.
 *
 * Before this file, icons were Unicode glyphs typed straight into markup
 * and template strings — "✎", "🗑", "▦", "→". That looked fine on the
 * machine it was written on and nowhere else: glyph coverage varies by
 * font and platform, Windows renders several of them as a fallback box,
 * "🗑" turns into a full-colour emoji on some systems and a mono outline
 * on others, and none of them scale or take a colour from CSS. A few of
 * them are also plain invisible in the Arabic font stack.
 *
 * So every icon is now an inline SVG from this map:
 *
 *   - 24x24 viewBox, stroked with `currentColor` — an icon inherits the
 *     colour of whatever it sits in, including hover and active states,
 *     with no per-icon CSS.
 *   - `fill="none"` + round caps/joins, one visual family throughout.
 *   - Sized in `em` by default (see css/icons.css), so an icon next to
 *     text is always proportional to that text.
 *   - `aria-hidden` unless given a label, because nearly every icon here
 *     sits beside a visible text label or on a button that already has
 *     its own aria-label. An icon announced twice is worse than silent.
 *
 * USAGE
 *   ES modules:   import { icon } from "./icons.js";   icon("trash")
 *   Classic JS:   window.ICC_ICONS.icon("trash")
 *   Static HTML:  paste the <svg> (this file stays the source of truth;
 *                 markup copies are the same 24x24 stroke style)
 *
 * Returns an HTML STRING, which is safe to interpolate: no argument of
 * it is ever attacker-controlled — `name` is looked up in the map below
 * and an unknown name returns the fallback dot, never the input.
 * ------------------------------------------------------------------------
 */

/* Path data only; the <svg> wrapper is added by icon() below. */
const PATHS = {
  /* --- navigation / chrome ------------------------------------------- */
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  "chevron-up": '<path d="M6 14.5l6-6 6 6"/>',
  "chevron-down": '<path d="M6 9.5l6 6 6-6"/>',
  "chevron-left": '<path d="M14.5 6l-6 6 6 6"/>',
  "chevron-right": '<path d="M9.5 6l6 6-6 6"/>',
  "arrow-up": '<path d="M12 19V5M6 11l6-6 6 6"/>',
  "arrow-down": '<path d="M12 5v14M6 13l6 6 6-6"/>',
  "arrow-left": '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  "arrow-right": '<path d="M5 12h14M13 6l6 6-6 6"/>',
  "external-link":
    '<path d="M14 5h5v5"/><path d="M19 5l-7.5 7.5"/><path d="M18 14.5V18a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V7.5A1.5 1.5 0 0 1 6 6h3.5"/>',

  /* --- actions -------------------------------------------------------- */
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3"/>',
  pencil:
    '<path d="M4.5 19.5h3.2l9.1-9.1a1.6 1.6 0 0 0 0-2.3l-1-1a1.6 1.6 0 0 0-2.3 0l-9 9.1z"/><path d="M13.6 6.9l3.5 3.5"/>',
  trash:
    '<path d="M4.5 7h15"/><path d="M10 4.5h4"/><path d="M6.5 7l.8 11.2A1.5 1.5 0 0 0 8.8 19.5h6.4a1.5 1.5 0 0 0 1.5-1.3L17.5 7"/><path d="M10.5 10.5v6M13.5 10.5v6"/>',
  play: '<path d="M8 5.5l10 6.5-10 6.5z"/>',
  pause: '<path d="M9.5 5.5v13M14.5 5.5v13"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  copy: '<rect x="9" y="9" width="10.5" height="10.5" rx="1.6"/><path d="M15 6.5A1.5 1.5 0 0 0 13.5 5H6a1.5 1.5 0 0 0-1.5 1.5V14A1.5 1.5 0 0 0 6 15.5"/>',
  ban: '<circle cx="12" cy="12" r="7.5"/><path d="M6.7 6.7l10.6 10.6"/>',
  "more-horizontal":
    '<circle cx="6" cy="12" r="1.15" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.15" fill="currentColor" stroke="none"/>',
  swap: '<path d="M5 9h12M14 6l3 3-3 3"/><path d="M19 15H7M10 12l-3 3 3 3"/>',
  "sort-vertical": '<path d="M8 4.5v15M8 4.5l-3 3M8 4.5l3 3"/><path d="M16 19.5v-15M16 19.5l-3-3M16 19.5l3-3"/>',
  refresh:
    '<path d="M19 12a7 7 0 1 1-2.1-5"/><path d="M19.5 4.5V9H15"/>',
  download: '<path d="M12 4.5v10M8 11l4 4 4-4"/><path d="M5 17.5v1A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-1"/>',
  upload: '<path d="M12 19.5v-10M8 13l4-4 4 4"/><path d="M5 6.5v-1A1.5 1.5 0 0 1 6.5 4h11A1.5 1.5 0 0 1 19 5.5v1"/>',
  key: '<circle cx="8" cy="12" r="3.5"/><path d="M11.5 12H20"/><path d="M17 12v3M14 12v2.5"/>',
  filter: '<path d="M4.5 6h15l-5.8 6.6v5.2l-3.4 1.7v-6.9z"/>',
  eye: '<path d="M2.8 12S6 6.5 12 6.5 21.2 12 21.2 12 18 17.5 12 17.5 2.8 12 2.8 12z"/><circle cx="12" cy="12" r="2.6"/>',

  /* --- status --------------------------------------------------------- */
  "alert-triangle":
    '<path d="M10.7 4.4L3.3 17.3A1.5 1.5 0 0 0 4.6 19.5h14.8a1.5 1.5 0 0 0 1.3-2.2L13.3 4.4a1.5 1.5 0 0 0-2.6 0z"/><path d="M12 9.5v4"/><circle cx="12" cy="16.4" r=".95" fill="currentColor" stroke="none"/>',
  info: '<circle cx="12" cy="12" r="7.8"/><path d="M12 11.3v4.4"/><circle cx="12" cy="8.5" r=".95" fill="currentColor" stroke="none"/>',
  "check-circle": '<circle cx="12" cy="12" r="7.8"/><path d="M8.4 12.2l2.5 2.5 4.7-4.9"/>',
  "x-circle": '<circle cx="12" cy="12" r="7.8"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5"/>',
  clock: '<circle cx="12" cy="12" r="7.8"/><path d="M12 7.6V12l2.9 1.8"/>',
  hourglass:
    '<path d="M7 4.5h10M7 19.5h10"/><path d="M8 4.5v2.6c0 1.6 1.4 2.5 2.7 3.6.9.7.9 1.9 0 2.6C9.4 14.4 8 15.3 8 16.9v2.6"/><path d="M16 4.5v2.6c0 1.6-1.4 2.5-2.7 3.6-.9.7-.9 1.9 0 2.6 1.3 1.1 2.7 2 2.7 3.6v2.6"/>',
  star: '<path d="M12 4.6l2.3 4.7 5.2.8-3.75 3.65.9 5.15L12 16.45 7.35 18.9l.9-5.15L4.5 10.1l5.2-.8z"/>',
  shield: '<path d="M12 4.2l6.5 2.4v5c0 4-2.7 6.7-6.5 8.2-3.8-1.5-6.5-4.2-6.5-8.2v-5z"/><path d="M9.3 12.1l1.9 1.9 3.5-3.7"/>',

  /* --- objects / sections --------------------------------------------- */
  grid: '<rect x="4.2" y="4.2" width="6.3" height="6.3" rx="1.3"/><rect x="13.5" y="4.2" width="6.3" height="6.3" rx="1.3"/><rect x="4.2" y="13.5" width="6.3" height="6.3" rx="1.3"/><rect x="13.5" y="13.5" width="6.3" height="6.3" rx="1.3"/>',
  layers: '<path d="M12 3.8l8 4.2-8 4.2-8-4.2z"/><path d="M4 12.2l8 4.2 8-4.2"/><path d="M4 16.3l8 4.2 8-4.2"/>',
  layout: '<rect x="4" y="4.5" width="16" height="15" rx="1.8"/><path d="M4 9.3h16"/><path d="M9.8 9.3v10.2"/>',
  list: '<path d="M8.5 7h11M8.5 12h11M8.5 17h11"/><circle cx="4.8" cy="7" r="1.05" fill="currentColor" stroke="none"/><circle cx="4.8" cy="12" r="1.05" fill="currentColor" stroke="none"/><circle cx="4.8" cy="17" r="1.05" fill="currentColor" stroke="none"/>',
  calendar:
    '<rect x="4" y="5.5" width="16" height="14" rx="1.8"/><path d="M4 10h16"/><path d="M8.5 3.5v3.6M15.5 3.5v3.6"/>',
  book: '<path d="M4.5 5.3A1.5 1.5 0 0 1 6 3.8h4.5A2.5 2.5 0 0 1 13 6.3v13a2 2 0 0 0-2-2H6a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M19.5 5.3A1.5 1.5 0 0 0 18 3.8h-2.5A2.5 2.5 0 0 0 13 6.3v13a2 2 0 0 1 2-2h3a1.5 1.5 0 0 0 1.5-1.5z"/>',
  "file-text":
    '<path d="M13.5 3.8H7A1.5 1.5 0 0 0 5.5 5.3v13.4A1.5 1.5 0 0 0 7 20.2h10a1.5 1.5 0 0 0 1.5-1.5V8.8z"/><path d="M13.5 3.8v5h5"/><path d="M8.8 13h6.4M8.8 16.3h4.4"/>',
  home: '<path d="M4.5 10.4L12 4.3l7.5 6.1v8.1a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M9.8 20v-6h4.4v6"/>',
  users:
    '<circle cx="9.3" cy="8.7" r="3.2"/><path d="M3.8 19.3a5.5 5.5 0 0 1 11 0"/><path d="M15.8 5.9a3.2 3.2 0 0 1 0 5.7"/><path d="M17 14.4a5.5 5.5 0 0 1 3.2 4.9"/>',
  user: '<circle cx="12" cy="8.5" r="3.6"/><path d="M5.5 19.7a6.5 6.5 0 0 1 13 0"/>',
  settings:
    '<circle cx="12" cy="12" r="2.9"/><path d="M12 3.6l1 2.2 2.4-.5 1 2.2 2.2 1-.5 2.4 1.7 1.7-1.7 1.7.5 2.4-2.2 1-1 2.2-2.4-.5-1 2.2-1-2.2-2.4.5-1-2.2-2.2-1 .5-2.4L3.2 12l1.7-1.7-.5-2.4 2.2-1 1-2.2 2.4.5z"/>',
  palette:
    '<path d="M12 20.2a8.2 8.2 0 1 1 8.2-8.2c0 2-1.7 2.8-3.2 2.8h-1.6a2 2 0 0 0-1.3 3.5 1.4 1.4 0 0 1-1 1.9 8.6 8.6 0 0 1-1.1 0z"/><circle cx="8" cy="11" r="1.05" fill="currentColor" stroke="none"/><circle cx="11.2" cy="7.6" r="1.05" fill="currentColor" stroke="none"/><circle cx="15.4" cy="9" r="1.05" fill="currentColor" stroke="none"/>',
  sitemap:
    '<rect x="9.2" y="3.6" width="5.6" height="4.2" rx="1.1"/><rect x="3.4" y="16.2" width="5.6" height="4.2" rx="1.1"/><rect x="15" y="16.2" width="5.6" height="4.2" rx="1.1"/><path d="M12 7.8v3.9"/><path d="M6.2 16.2v-2.3a1.4 1.4 0 0 1 1.4-1.4h8.8a1.4 1.4 0 0 1 1.4 1.4v2.3"/>',
  "git-branch":
    '<circle cx="7" cy="6.2" r="2.2"/><circle cx="7" cy="17.8" r="2.2"/><circle cx="17" cy="9.6" r="2.2"/><path d="M7 8.4v7.2"/><path d="M14.8 9.6H12a5 5 0 0 0-5 5"/>',
  link: '<path d="M10.2 13.8a3.6 3.6 0 0 0 5.1 0l2.6-2.6a3.6 3.6 0 0 0-5.1-5.1L11.4 7.5"/><path d="M13.8 10.2a3.6 3.6 0 0 0-5.1 0l-2.6 2.6a3.6 3.6 0 0 0 5.1 5.1l1.4-1.4"/>',
  image:
    '<rect x="4" y="5" width="16" height="14" rx="1.8"/><circle cx="9" cy="10" r="1.6"/><path d="M4.6 17l4.3-4.3a1.5 1.5 0 0 1 2.1 0L16 17.4"/><path d="M14 15.4l1.6-1.6a1.5 1.5 0 0 1 2.1 0l1.7 1.7"/>',
  database:
    '<ellipse cx="12" cy="6.4" rx="7" ry="2.8"/><path d="M5 6.4v11.2c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6.4"/><path d="M5 12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8"/>',
  archive:
    '<rect x="3.6" y="4.4" width="16.8" height="4.2" rx="1.2"/><path d="M5.2 8.6v9.4a1.6 1.6 0 0 0 1.6 1.6h10.4a1.6 1.6 0 0 0 1.6-1.6V8.6"/><path d="M10 12.3h4"/>',
  hash: '<path d="M9.4 4.2L7.6 19.8M16.4 4.2l-1.8 15.6"/><path d="M4.6 8.8h15M4 15.2h15"/>',
  tag: '<path d="M11.1 4.2H19a.8.8 0 0 1 .8.8v7.9a1.6 1.6 0 0 1-.47 1.13l-5.4 5.4a1.6 1.6 0 0 1-2.26 0l-6.43-6.43a1.6 1.6 0 0 1 0-2.26l5.4-5.4A1.6 1.6 0 0 1 11.1 4.2z"/><circle cx="15.6" cy="8.4" r="1.25"/>',
  sparkles:
    '<path d="M11 4l1.5 3.9L16.4 9.4 12.5 11 11 14.9 9.5 11 5.6 9.4 9.5 7.9z"/><path d="M17.6 14l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
  target: '<circle cx="12" cy="12" r="7.6"/><circle cx="12" cy="12" r="3.9"/><circle cx="12" cy="12" r="1.05" fill="currentColor" stroke="none"/>',
  history:
    '<path d="M4.6 12a7.4 7.4 0 1 0 2.2-5.3L4.5 9"/><path d="M4.2 4.8v4.4h4.4"/><path d="M12 8.2V12l2.7 1.7"/>',
  globe: '<circle cx="12" cy="12" r="7.8"/><path d="M4.4 12h15.2"/><path d="M12 4.2a12 12 0 0 1 0 15.6 12 12 0 0 1 0-15.6z"/>',
  "log-out": '<path d="M14 6.6V5.4A1.4 1.4 0 0 0 12.6 4H6.4A1.4 1.4 0 0 0 5 5.4v13.2A1.4 1.4 0 0 0 6.4 20h6.2a1.4 1.4 0 0 0 1.4-1.4v-1.2"/><path d="M10 12h9.5M16.5 9l3 3-3 3"/>',
  calculator:
    '<rect x="5" y="3.6" width="14" height="16.8" rx="1.8"/><path d="M8.2 7.6h7.6"/><path d="M8.6 12h.01M12 12h.01M15.4 12h.01M8.6 16h.01M12 16h.01M15.4 16h.01" stroke-width="2.2"/>',
  dot: '<circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
};

/**
 * Directional icons get mirrored when the page is in RTL, so "next" keeps
 * pointing at what comes next rather than at what came before. Handled in
 * css/icons.css via [data-icon-flip]; listed here so the attribute is set
 * on exactly the icons that need it and not on, say, a clock.
 */
const FLIP_IN_RTL = new Set([
  "arrow-left",
  "arrow-right",
  "chevron-left",
  "chevron-right",
  "external-link",
  "log-out",
  "swap",
]);

/**
 * Build an icon.
 *
 * @param {string} name   key in PATHS; unknown names fall back to a dot
 *                        rather than rendering nothing, so a typo shows
 *                        up as a visible placeholder instead of an
 *                        invisible gap in a toolbar.
 * @param {object} [opts]
 * @param {string} [opts.className]  extra classes alongside `icon`
 * @param {string} [opts.label]      accessible name; omit for decorative
 *                                   icons (the default) which are then
 *                                   marked aria-hidden
 * @param {string|number} [opts.size] any CSS length; default is 1em so
 *                                   the icon tracks its surrounding text
 * @param {number} [opts.strokeWidth]
 * @returns {string} an <svg> element as HTML
 */
export function icon(name, opts = {}) {
  const body = PATHS[name] || PATHS.dot;
  const { className = "", label = "", size = "", strokeWidth = 1.75 } = opts;

  const classes = ["icon", className].filter(Boolean).join(" ");
  const sizeAttr = size ? ` style="--icon-size:${typeof size === "number" ? size + "px" : size}"` : "";
  const a11y = label
    ? ` role="img" aria-label="${String(label).replace(/"/g, "&quot;")}"`
    : ' aria-hidden="true" focusable="false"';
  const flip = FLIP_IN_RTL.has(name) ? ' data-icon-flip="true"' : "";

  return (
    `<svg class="${classes}" viewBox="0 0 24 24" fill="none" stroke="currentColor"` +
    ` stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"` +
    `${flip}${sizeAttr}${a11y}>${body}</svg>`
  );
}

/** Every available icon name — handy when building a picker or a test page. */
export const ICON_NAMES = Object.keys(PATHS);

/**
 * Replace `<i data-icon="trash"></i>` placeholders inside a root element.
 * Lets static HTML carry icons without repeating SVG markup, and lets a
 * re-rendered fragment pick up icons without every renderer importing
 * this module.
 */
export function hydrateIcons(root = document) {
  root.querySelectorAll("[data-icon]:not([data-icon-done])").forEach((node) => {
    const name = node.getAttribute("data-icon");
    const html = icon(name, {
      className: node.getAttribute("data-icon-class") || "",
      label: node.getAttribute("data-icon-label") || "",
      size: node.getAttribute("data-icon-size") || "",
    });
    node.outerHTML = html;
  });
}

/* Classic (non-module) scripts — js/ui.js, js/gpa.js — read it from here. */
if (typeof window !== "undefined") {
  window.ICC_ICONS = { icon, ICON_NAMES, hydrateIcons };
}
