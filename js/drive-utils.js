/**
 * drive-utils.js
 * -----------------------------------------------------------------------
 * PHASE 4A: Google Drive curriculum-image URL support.
 *
 * `curriculumImageUrl` on a major document can now be either:
 *   - a plain, direct image URL (unchanged from Phase 3), or
 *   - a Google Drive "sharing" link, e.g.:
 *       https://drive.google.com/file/d/FILE_ID/view?usp=sharing
 *       https://drive.google.com/open?id=FILE_ID
 *       https://drive.google.com/uc?id=FILE_ID
 *
 * `normalizeDriveImageUrl()` recognizes those Drive shapes, extracts the
 * file id, and rewrites the URL into Drive's direct-content form
 * (`uc?export=view&id=FILE_ID`) so it can be dropped straight into an
 * <img src>. Anything that isn't a recognizable Drive URL — including a
 * normal direct image URL — is returned completely untouched.
 *
 * SECURITY: this file does no network access, uses no Google Drive API,
 * no OAuth, no service account, and no credentials of any kind. It is
 * pure string parsing against the public sharing-link shapes Google Drive
 * itself produces. The image will only actually load in the browser if
 * the Drive file's sharing setting is "Anyone with the link can view" —
 * this module can't change that, and doesn't try to.
 * ------------------------------------------------------------------------
 */

const DRIVE_HOST_PATTERN = /(^|\.)drive\.google\.com$/;

/**
 * Extract a Google Drive file id from any of the common sharing URL
 * shapes. Returns null if `url` isn't a Google Drive URL, or if it is one
 * but no file id could be found in it.
 */
export function extractDriveFileId(url) {
  const raw = (url || "").toString().trim();
  if (!raw) return null;

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null; // not a valid absolute URL at all
  }

  if (!DRIVE_HOST_PATTERN.test(parsed.hostname)) return null;

  // /file/d/FILE_ID/view, /file/d/FILE_ID/edit, etc.
  const pathMatch = parsed.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (pathMatch) return pathMatch[1];

  // /uc?id=FILE_ID, /open?id=FILE_ID, /uc?export=view&id=FILE_ID
  const idParam = parsed.searchParams.get("id");
  if (idParam) return idParam;

  return null;
}

/**
 * Normalize a curriculumImageUrl value for use as an <img src>.
 *  - Google Drive sharing URL → direct-content Drive URL.
 *  - Anything else (direct image URL, empty string, etc.) → returned as-is.
 */
export function normalizeDriveImageUrl(url) {
  const raw = (url || "").toString().trim();
  if (!raw) return raw;

  const fileId = extractDriveFileId(raw);
  if (!fileId) return raw;

  return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`;
}

/** True if the given value looks like a Google Drive URL at all. */
export function isDriveUrl(url) {
  const raw = (url || "").toString().trim();
  if (!raw) return false;
  try {
    return DRIVE_HOST_PATTERN.test(new URL(raw).hostname);
  } catch {
    return false;
  }
}
