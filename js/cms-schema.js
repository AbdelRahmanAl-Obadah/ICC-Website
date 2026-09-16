/**
 * cms-schema.js
 * -----------------------------------------------------------------------
 * PHASE 7 (Part 2) — the single definition of what the CMS can store,
 * what the defaults are, and what counts as a valid value.
 *
 * Imported by BOTH the Admin Panel (to build forms and validate on the way
 * in) and the public site (to validate on the way out). That duplication
 * of effort is deliberate and is the whole point of this file living
 * where both can reach it: the browser that renders the public site is not
 * the browser that wrote the config, and a document could have been
 * edited by another tool, restored from a backup, or written by an older
 * version of the panel. Validating only in the admin form would mean
 * trusting a value that has since travelled through a database.
 *
 * ==========================================================================
 * THE DRAFT / PUBLISHED MODEL
 * ==========================================================================
 * Every CMS document has the same envelope:
 *
 *   siteConfig/{id} = {
 *     draft:     { ...values },   // what admins are working on
 *     published: { ...values },   // what the public site reads
 *     archived:  [ { at, by, values } ],   // previous published versions
 *     status:    "draft" | "published" | "archived",
 *     updatedAt, updatedBy,
 *     publishedAt, publishedBy
 *   }
 *
 * Two values in one document rather than two documents, because the public
 * site then reads the whole CMS in ONE query (see js/cms.js) instead of
 * one query per section — and because "publish" becomes a single atomic
 * field copy rather than a cross-document write that can half-succeed.
 *
 * `edit` writes `draft`. `publish` is what copies draft into published.
 * The security rules enforce exactly that split, so an admin who may edit
 * but not publish cannot reach the public site no matter what the panel
 * sends.
 *
 * ==========================================================================
 * WHY THERE IS NO "CUSTOM CSS" FIELD
 * ==========================================================================
 * Every appearance value below is an enum, a number clamped to a range, or
 * a hex colour matched against a pattern. There is no free-form CSS or
 * JavaScript input anywhere, and there will not be one: a text box whose
 * contents are injected into a page every visitor loads is a defacement
 * and script-injection vector, and it buys a convenience nobody asked for.
 * Admins choose from safe predefined options; the range of looks is set
 * here, in reviewed code.
 * ------------------------------------------------------------------------ */

/* ==========================================================================
   DOCUMENT IDS
   ==========================================================================
   Five documents, not fifty. The public site fetches the collection once,
   so the read cost is one query regardless — but a smaller number of
   larger documents also means a "publish" is one atomic operation per
   area of the site rather than a scattered set of them.
   ========================================================================== */

export const CMS_DOCS = {
  APPEARANCE: "appearance",
  HOMEPAGE: "homepage",
  CONTENT: "content",
  NAVIGATION: "navigation",
  SETTINGS: "settings",
};

export const CMS_DOC_IDS = Object.values(CMS_DOCS);

/** Which permission section governs each document. */
export const CMS_DOC_SECTION = {
  appearance: "appearance",
  homepage: "homepage",
  content: "content",
  navigation: "navigation",
  settings: "settings",
};

export const CMS_STATUS = {
  DRAFT: "draft",
  PUBLISHED: "published",
  ARCHIVED: "archived",
};

/* ==========================================================================
   ICC BRAND IDENTITY — THE DEFAULTS
   ==========================================================================
   These are the club's real identity, and they are the baseline the
   appearance system starts from and can always be reset to. The CMS exists
   to let the identity be adjusted and extended, not discarded: an admin
   who changes nothing gets exactly the site that shipped.

     Primary    #389FFF
     Secondary  #D8DCDE
     White      #FFFFFF
     Black      #000000
     Font       Academy (with Orbitron as the licensed-font stand-in)
   ========================================================================== */

export const BRAND = {
  primary: "#389fff",
  secondary: "#d8dcde",
  white: "#ffffff",
  black: "#000000",
};

/* ==========================================================================
   APPEARANCE
   ========================================================================== */

/**
 * Preset option sets. Each key maps to a `data-` attribute on <html>, and
 * the CSS in css/appearance.css styles against those attributes. That is
 * what keeps this safe: the admin picks a token, not a rule, and the
 * actual styling lives in a reviewed stylesheet.
 */
export const APPEARANCE_OPTIONS = {
  button_style: ["solid", "soft", "outline", "pill"],
  card_style: ["flat", "bordered", "raised", "glass"],
  header_style: ["solid", "transparent", "bordered", "elevated"],
  navbar_style: ["standard", "compact", "centered"],
  footer_style: ["standard", "minimal", "expanded"],
  hero_style: ["standard", "centered", "split", "minimal"],
  shadow_style: ["none", "subtle", "soft", "strong"],
  font_pairing: ["academy", "plex", "system", "serif"],
  color_mode: ["light", "dark", "auto"],
  density: ["compact", "regular", "relaxed"],
};

/**
 * Numeric appearance values, with the range each is clamped to.
 * The ranges are not arbitrary: they are the span within which the
 * existing layout still holds together. A 400px container or a 90px radius
 * doesn't produce a different-looking site, it produces a broken one, so
 * the CMS simply cannot express it.
 */
export const APPEARANCE_RANGES = {
  radius: { min: 0, max: 24, step: 1, unit: "px" },
  container_width: { min: 960, max: 1600, step: 20, unit: "px" },
  section_spacing: { min: 40, max: 160, step: 4, unit: "px" },
  font_scale: { min: 85, max: 125, step: 1, unit: "%" },
  border_width: { min: 0, max: 3, step: 1, unit: "px" },
};

export const APPEARANCE_DEFAULTS = {
  // Colours — the ICC palette, matching the :root tokens in css/style.css.
  color_primary: BRAND.primary,
  color_secondary: BRAND.secondary,
  color_accent: "#2b7fd1",
  color_bg: BRAND.white,
  color_surface: "#f3f4f5",
  color_text: "#14171a",
  color_text_soft: "#565c61",
  color_border: "#dce0e2",

  // Shape and scale
  radius: 3,
  border_width: 1,
  shadow_style: "subtle",
  container_width: 1180,
  section_spacing: 72,
  density: "regular",

  // Components
  button_style: "solid",
  card_style: "bordered",
  header_style: "solid",
  navbar_style: "standard",
  footer_style: "standard",
  hero_style: "standard",

  // Type
  font_pairing: "academy",
  font_scale: 100,

  // Mode
  color_mode: "light",

  // Branding assets
  logo_url: "",
  logo_dark_url: "",
  favicon_url: "",
};

/* ==========================================================================
   HOMEPAGE SECTIONS
   ==========================================================================
   The homepage is an ORDERED LIST of section records rather than a fixed
   set of fields, so an admin can add a second announcements block or drop
   the statistics band without a developer touching index.html.

   Each type declares which fields it actually uses. A CTA section has no
   statistics, and showing an admin eight empty inputs that do nothing is
   how a CMS becomes something people avoid.
   ========================================================================== */

export const SECTION_TYPES = [
  {
    key: "hero",
    labelKey: "cms_section_hero",
    fields: ["eyebrow", "title", "subtitle", "description", "image", "buttonText", "buttonUrl", "buttonText2", "buttonUrl2"],
  },
  {
    key: "about",
    labelKey: "cms_section_about",
    fields: ["title", "subtitle", "description", "image"],
  },
  {
    key: "features",
    labelKey: "cms_section_features",
    fields: ["title", "subtitle", "description", "items"],
  },
  {
    key: "statistics",
    labelKey: "cms_section_statistics",
    fields: ["title", "subtitle", "items"],
  },
  {
    key: "programs",
    labelKey: "cms_section_programs",
    fields: ["title", "subtitle", "description", "buttonText", "buttonUrl"],
  },
  {
    key: "announcements",
    labelKey: "cms_section_announcements",
    fields: ["title", "description", "buttonText", "buttonUrl"],
  },
  {
    key: "cta",
    labelKey: "cms_section_cta",
    fields: ["title", "subtitle", "buttonText", "buttonUrl"],
  },
  {
    key: "footer",
    labelKey: "cms_section_footer",
    fields: ["title", "description"],
  },
];

export const SECTION_TYPE_KEYS = SECTION_TYPES.map((s) => s.key);

export function getSectionType(key) {
  return SECTION_TYPES.find((s) => s.key === key) || null;
}

/** Fields that are bilingual {ar, en} rather than plain strings. */
export const BILINGUAL_SECTION_FIELDS = [
  "eyebrow",
  "title",
  "subtitle",
  "description",
  "buttonText",
  "buttonText2",
];

/** Fields that hold a URL and therefore go through assertSafeUrl(). */
export const URL_SECTION_FIELDS = ["image", "buttonUrl", "buttonUrl2"];

/** A blank section of the given type, ready for the admin form. */
export function blankSection(type, displayOrder = 0) {
  const def = getSectionType(type);
  const section = {
    id: `sec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    visible: true,
    displayOrder,
  };
  (def ? def.fields : []).forEach((field) => {
    if (BILINGUAL_SECTION_FIELDS.includes(field)) section[field] = { en: "", ar: "" };
    else if (field === "items") section.items = [];
    else section[field] = "";
  });
  return section;
}

/* ==========================================================================
   SITE CONTENT GROUPS
   ==========================================================================
   Every editable string on the public site, grouped the way an admin
   thinks about them rather than the way the HTML happens to be ordered.

   The `i18n` value on each field names the key in js/language.js that the
   string falls back to. That mapping is what lets an EMPTY CMS field mean
   "use the built-in text" instead of "blank this element" — which matters,
   because a half-filled CMS should degrade to the shipped site, not to a
   page of empty headings.
   ========================================================================== */

export const CONTENT_GROUPS = [
  {
    key: "navbar",
    labelKey: "cms_group_navbar",
    fields: [
      { key: "nav_brand", i18n: "nav_brand" },
      { key: "nav_home", i18n: "nav_home" },
      { key: "nav_majors", i18n: "nav_majors" },
      { key: "nav_requirements", i18n: "nav_requirements" },
      { key: "nav_search", i18n: "nav_search" },
    ],
  },
  {
    key: "homepage",
    labelKey: "cms_group_homepage",
    fields: [
      { key: "hero_eyebrow", i18n: "hero_eyebrow" },
      { key: "hero_title", i18n: "hero_title_line1" },
      { key: "hero_desc", i18n: "hero_desc" },
      { key: "hero_cta_majors", i18n: "hero_cta_majors" },
      { key: "hero_cta_requirements", i18n: "hero_cta_requirements" },
      { key: "quick_title", i18n: "quick_title" },
    ],
  },
  {
    key: "about",
    labelKey: "cms_group_about",
    fields: [
      { key: "about_title", i18n: "about_title" },
      { key: "about_body", i18n: "about_body", multiline: true },
    ],
  },
  {
    key: "academic",
    labelKey: "cms_group_academic",
    fields: [
      { key: "featured_title", i18n: "featured_title" },
      { key: "featured_lede", i18n: "featured_lede" },
      { key: "majors_title", i18n: "nav_majors" },
      { key: "requirements_title", i18n: "nav_requirements" },
    ],
  },
  {
    key: "search",
    labelKey: "cms_group_search",
    fields: [
      { key: "search_title", i18n: "search_title" },
      { key: "search_lede", i18n: "search_lede" },
    ],
  },
  {
    key: "states",
    labelKey: "cms_group_states",
    fields: [
      { key: "state_loading", i18n: "state_loading" },
      { key: "state_empty_title", i18n: "state_empty_title" },
      { key: "state_empty_body", i18n: "state_empty_body" },
      { key: "state_error_title", i18n: "state_error_title" },
      { key: "state_error_body", i18n: "state_error_body" },
    ],
  },
  {
    key: "footer",
    labelKey: "cms_group_footer",
    fields: [
      { key: "footer_desc", i18n: "footer_desc", multiline: true },
      { key: "footer_nav", i18n: "footer_nav" },
      { key: "footer_copyright", i18n: "footer_copyright" },
    ],
  },
  {
    key: "contact",
    labelKey: "cms_group_contact",
    fields: [
      { key: "contact_email", i18n: null, plain: true },
      { key: "contact_phone", i18n: null, plain: true },
      { key: "contact_address", i18n: null },
    ],
  },
];

/** Flat list of every content field key, for validation and form building. */
export const CONTENT_FIELD_KEYS = CONTENT_GROUPS.flatMap((g) => g.fields.map((f) => f.key));

/** The i18n fallback key for a content field, or null if it has none. */
export function fallbackKeyFor(fieldKey) {
  for (const group of CONTENT_GROUPS) {
    const found = group.fields.find((f) => f.key === fieldKey);
    if (found) return found.i18n || null;
  }
  return null;
}

/* ==========================================================================
   SETTINGS
   ========================================================================== */

export const SETTINGS_GROUPS = [
  {
    key: "general",
    labelKey: "cms_settings_general",
    fields: [
      { key: "site_name", type: "text" },
      { key: "site_tagline", type: "text" },
      { key: "site_url", type: "url" },
    ],
  },
  {
    key: "localization",
    labelKey: "cms_settings_localization",
    fields: [
      { key: "default_lang", type: "select", options: ["en", "ar"] },
      { key: "allow_language_switch", type: "bool", default: true },
      { key: "date_format", type: "select", options: ["dmy", "mdy", "ymd"] },
    ],
  },
  {
    key: "seo",
    labelKey: "cms_settings_seo",
    fields: [
      { key: "meta_title", type: "text" },
      { key: "meta_description", type: "textarea" },
      { key: "og_image", type: "url" },
      { key: "allow_indexing", type: "bool", default: true },
    ],
  },
  {
    key: "social",
    labelKey: "cms_settings_social",
    fields: [
      { key: "social_instagram", type: "url" },
      { key: "social_linkedin", type: "url" },
      { key: "social_github", type: "url" },
      { key: "social_x", type: "url" },
      { key: "social_youtube", type: "url" },
    ],
  },
  {
    key: "contact",
    labelKey: "cms_settings_contact",
    fields: [
      { key: "contact_email", type: "email" },
      { key: "contact_phone", type: "text" },
      { key: "contact_address_en", type: "text" },
      { key: "contact_address_ar", type: "text" },
    ],
  },
  {
    key: "maintenance",
    labelKey: "cms_settings_maintenance",
    fields: [
      { key: "maintenance_mode", type: "bool", default: false },
      { key: "maintenance_message_en", type: "textarea" },
      { key: "maintenance_message_ar", type: "textarea" },
    ],
  },
];

/* ==========================================================================
   URL SAFETY
   ==========================================================================
   Navigation links, button targets, images and social links are all
   admin-editable strings that end up in an href or src attribute on a page
   every visitor loads. `javascript:` in an href executes on click, with
   full access to the page — so the check below is an ALLOW-LIST of
   schemes, not a block-list of bad ones.

   Block-lists fail here. `javascript:` is only the obvious case; there is
   also `data:text/html`, `vbscript:`, and the fact that browsers ignore
   whitespace and control characters inside a scheme, so "java\tscript:"
   still runs. Allowing only http, https, mailto, tel and site-relative
   paths sidesteps that entire category rather than racing it.
   ========================================================================== */

const SAFE_SCHEMES = ["http:", "https:", "mailto:", "tel:"];

/**
 * Normalize an admin-supplied URL, or return "" if it isn't safe to use.
 * Never throws — callers treat "" as "no link", which degrades to plain
 * text rather than to a broken or dangerous one.
 */
export function safeUrl(raw) {
  const value = (raw ?? "").toString().trim();
  if (!value) return "";

  // Strip characters browsers ignore when parsing a scheme, so they can't
  // be used to smuggle one past the check below.
  const probe = value.replace(/[\u0000-\u001F\u007F\s]/g, "").toLowerCase();
  if (probe.startsWith("javascript:") || probe.startsWith("vbscript:") || probe.startsWith("data:")) {
    return "";
  }

  // Site-relative links are the common case for internal navigation and
  // carry no scheme at all. Allow a leading "/", "./", "#" or a bare
  // page name, but never a protocol-relative "//host" URL, which is an
  // absolute link to another origin wearing a relative disguise.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    if (value.startsWith("//")) return "";
    return value;
  }

  try {
    const parsed = new URL(value);
    return SAFE_SCHEMES.includes(parsed.protocol) ? value : "";
  } catch {
    return "";
  }
}

/** True when the value is either empty or safe — what a form validates on. */
export function isSafeUrl(raw) {
  const value = (raw ?? "").toString().trim();
  return !value || safeUrl(value) !== "";
}

/* ==========================================================================
   VALUE VALIDATION
   ========================================================================== */

const HEX = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(value) {
  return typeof value === "string" && HEX.test(value.trim());
}

export function clampNumber(value, { min, max }, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function oneOf(value, options, fallback) {
  return options.includes(value) ? value : fallback;
}

/**
 * Coerce a raw appearance object into a complete, valid one.
 *
 * Every field is replaced by its default when it is missing or invalid,
 * so the result is always safe to apply wholesale. Partial application —
 * using the good fields and skipping the bad ones — is worse: it produces
 * a site that is half one theme and half another, which looks like a bug
 * nobody can reproduce.
 */
export function normalizeAppearance(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = { ...APPEARANCE_DEFAULTS };

  Object.keys(APPEARANCE_DEFAULTS).forEach((key) => {
    const value = src[key];

    if (key.startsWith("color_")) {
      if (isHexColor(value)) out[key] = value.trim().toLowerCase();
      return;
    }
    if (key in APPEARANCE_RANGES) {
      out[key] = clampNumber(value, APPEARANCE_RANGES[key], APPEARANCE_DEFAULTS[key]);
      return;
    }
    if (key in APPEARANCE_OPTIONS) {
      out[key] = oneOf(value, APPEARANCE_OPTIONS[key], APPEARANCE_DEFAULTS[key]);
      return;
    }
    if (key.endsWith("_url")) {
      out[key] = safeUrl(value);
      return;
    }
    if (typeof value === "string") out[key] = value;
  });

  return out;
}

/** Bilingual value → the string for a language, falling back to the other. */
export function pickLang(value, language) {
  if (!value) return "";
  if (typeof value === "string") return value;
  const primary = (value[language] || "").toString().trim();
  if (primary) return primary;
  const other = language === "ar" ? "en" : "ar";
  return (value[other] || "").toString().trim();
}

/**
 * Coerce a raw homepage document into a valid ordered section list.
 * Unknown section types are dropped rather than rendered: a type this
 * build doesn't know how to draw would otherwise appear as an empty gap
 * on the live homepage with nothing to explain it.
 */
export function normalizeHomepage(raw) {
  const sections = Array.isArray(raw?.sections) ? raw.sections : [];
  return sections
    .filter((s) => s && SECTION_TYPE_KEYS.includes(s.type))
    .map((s, i) => {
      const clean = {
        id: typeof s.id === "string" ? s.id : `sec_${i}`,
        type: s.type,
        visible: s.visible !== false,
        displayOrder: Number.isFinite(Number(s.displayOrder)) ? Number(s.displayOrder) : i,
      };
      const def = getSectionType(s.type);
      def.fields.forEach((field) => {
        if (BILINGUAL_SECTION_FIELDS.includes(field)) {
          clean[field] = {
            en: (s[field]?.en || "").toString(),
            ar: (s[field]?.ar || "").toString(),
          };
        } else if (field === "items") {
          clean.items = Array.isArray(s.items)
            ? s.items.slice(0, 12).map((item) => ({
                label: { en: (item?.label?.en || "").toString(), ar: (item?.label?.ar || "").toString() },
                value: { en: (item?.value?.en || "").toString(), ar: (item?.value?.ar || "").toString() },
              }))
            : [];
        } else if (URL_SECTION_FIELDS.includes(field)) {
          clean[field] = safeUrl(s[field]);
        } else {
          clean[field] = (s[field] || "").toString();
        }
      });
      return clean;
    })
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

/**
 * Coerce a raw navigation document into valid link lists.
 * A link whose URL fails the safety check is dropped entirely rather than
 * rendered without an href — a menu item that silently does nothing is
 * more confusing than one that isn't there.
 */
export function normalizeNavigation(raw) {
  const clean = (list) =>
    (Array.isArray(list) ? list : [])
      .map((item, i) => ({
        id: typeof item?.id === "string" ? item.id : `nav_${i}`,
        label: {
          en: (item?.label?.en || "").toString(),
          ar: (item?.label?.ar || "").toString(),
        },
        url: safeUrl(item?.url),
        newTab: item?.newTab === true,
        active: item?.active !== false,
        displayOrder: Number.isFinite(Number(item?.displayOrder)) ? Number(item.displayOrder) : i,
      }))
      .filter((item) => item.url && (item.label.en || item.label.ar))
      .sort((a, b) => a.displayOrder - b.displayOrder);

  return {
    primary: clean(raw?.primary),
    footer: clean(raw?.footer),
  };
}

/** Coerce raw content into a map of {fieldKey: {en, ar}}, known keys only. */
export function normalizeContent(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = {};
  CONTENT_FIELD_KEYS.forEach((key) => {
    const value = src[key];
    if (!value) return;
    out[key] = {
      en: (value.en || "").toString(),
      ar: (value.ar || "").toString(),
    };
  });
  return out;
}

/** Coerce raw settings into the declared groups, typed and URL-checked. */
export function normalizeSettings(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = {};
  SETTINGS_GROUPS.forEach((group) => {
    out[group.key] = {};
    group.fields.forEach((field) => {
      const value = src?.[group.key]?.[field.key];
      switch (field.type) {
        case "bool":
          out[group.key][field.key] = typeof value === "boolean" ? value : field.default === true;
          break;
        case "url":
          out[group.key][field.key] = safeUrl(value);
          break;
        case "select":
          out[group.key][field.key] = oneOf(value, field.options, field.options[0]);
          break;
        default:
          out[group.key][field.key] = (value || "").toString();
      }
    });
  });
  return out;
}

/** The right normalizer for a document id. */
export function normalizeFor(docId, values) {
  switch (docId) {
    case CMS_DOCS.APPEARANCE:
      return normalizeAppearance(values);
    case CMS_DOCS.HOMEPAGE:
      return { sections: normalizeHomepage(values) };
    case CMS_DOCS.CONTENT:
      return normalizeContent(values);
    case CMS_DOCS.NAVIGATION:
      return normalizeNavigation(values);
    case CMS_DOCS.SETTINGS:
      return normalizeSettings(values);
    default:
      return values && typeof values === "object" ? values : {};
  }
}
