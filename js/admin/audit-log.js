/**
 * audit-log.js
 * -----------------------------------------------------------------------
 * PHASE 5 — the write side of the administrator activity log.
 *
 * Every mutating action in the Admin Panel funnels through logAction() so
 * the Audit Logs screen can answer "who changed what, when, and from what
 * to what" without each page inventing its own record shape.
 *
 * DESIGN NOTES
 *
 * 1. Logging never breaks the user's action. If the audit write fails
 *    (offline, rules rejection, quota) we log to the console and move on —
 *    the alternative is a panel where a logging hiccup makes it impossible
 *    to save a subject, which is worse than a gap in the log.
 *
 * 2. Diffs are computed shallowly and only over fields that actually
 *    changed, so an "edited major" record stores {name, active} rather
 *    than a full duplicate of the document. Values are stringified and
 *    truncated defensively — an audit entry is a human-readable summary,
 *    not a backup.
 *
 * 3. The actor is taken from the live session profile, never from a
 *    caller-supplied argument, and the rules additionally require
 *    actorUid == request.auth.uid. An admin cannot forge a log entry
 *    attributing their action to someone else.
 * ------------------------------------------------------------------------
 */

import { writeAuditLog } from "../firestore.js";

const MAX_VALUE_LENGTH = 300;

/* ==========================================================================
   THE ACTION VOCABULARY
   ==========================================================================
   Phase 8 fixes the vocabulary so the Audit Logs filter can offer a closed
   list rather than whatever strings happen to have been written. Every
   action the panel performs maps to exactly one of these.

   ALIASES exist because earlier phases wrote shorter names for three of
   them. Rather than migrate existing documents — rewriting audit history
   to make it tidier is precisely the thing an audit log must never do —
   new writes are normalized on the way in and the reader understands both.
   ========================================================================== */

export const AUDIT_ACTIONS = [
  "create",
  "update",
  "delete",
  "publish",
  "unpublish",
  "activate",
  "deactivate",
  "approve",
  "reject",
  "submit",
  "reorder",
  "permission_change",
  "settings_change",
  "appearance_change",
  "content_change",
  "restore_version",
  "login",
];

/** Legacy name -> canonical name. Read-side too: old rows still resolve. */
export const ACTION_ALIASES = {
  permissions: "permission_change",
  restore: "restore_version",
};

export function normalizeAction(action) {
  const key = String(action || "update").trim();
  return ACTION_ALIASES[key] || key;
}

/**
 * Which CMS sections get their own action name.
 *
 * The brief asks for SETTINGS_CHANGE / APPEARANCE_CHANGE / CONTENT_CHANGE
 * as distinct actions rather than a generic "update" distinguished only by
 * the resource column. That matters for filtering: "show me every time
 * anyone touched the site's appearance" is a question people actually ask,
 * and it should be one filter selection, not a two-field combination.
 */
const SECTION_ACTION = {
  settings: "settings_change",
  appearance: "appearance_change",
  content: "content_change",
  homepage: "content_change",
  navigation: "content_change",
};

/**
 * Specialize a generic "update" into its section-specific action. Only
 * "update" is specialized — a delete on the appearance document is still a
 * delete, and flattening it into APPEARANCE_CHANGE would hide what happened.
 */
function specialize(action, section) {
  if (action !== "update") return action;
  return SECTION_ACTION[section] || action;
}

let currentActor = null;

/** Called once by admin-guard.js as soon as the session profile resolves. */
export function setAuditActor(profile) {
  currentActor = profile
    ? {
        actorUid: profile.uid,
        actorEmail: profile.email || "",
        // actorName is the field every existing reader uses;
        // actorDisplayName is the name the brief specifies. They always
        // hold the same value — the duplicate costs a few bytes per record
        // and saves migrating every reader and every stored row.
        actorName: profile.displayName || profile.email || "Admin",
        actorDisplayName: profile.displayName || profile.email || "Admin",
        actorRole: profile.role || "admin",
      }
    : null;
}

export function getAuditActor() {
  return currentActor;
}

function sanitizeMetadata(value) {
  if (value === undefined || value === null) return null;

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeMetadata(item));
  }

  if (typeof value === "object") {
    const cleaned = {};
    for (const [key, raw] of Object.entries(value)) {
      const normalizedKey = String(key || "").trim();
      const lowered = normalizedKey.toLowerCase();
      if (["password", "token", "secret", "authorization", "cookie", "jwt", "refreshToken", "accessToken"].includes(lowered)) {
        continue;
      }
      cleaned[normalizedKey] = sanitizeMetadata(raw);
    }
    return cleaned;
  }

  return String(value);
}

function truncate(value) {
  if (value === undefined || value === null) return null;
  let str;
  if (typeof value === "object") {
    try {
      str = JSON.stringify(value);
    } catch (err) {
      str = String(value);
    }
  } else {
    str = String(value);
  }
  return str.length > MAX_VALUE_LENGTH ? `${str.slice(0, MAX_VALUE_LENGTH)}…` : str;
}

function isEqual(a, b) {
  if (a === b) return true;
  if (typeof a === "object" && typeof b === "object" && a && b) {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch (err) {
      return false;
    }
  }
  return false;
}

/**
 * Shallow-diff two documents, returning { before, after, fields }.
 * Metadata fields are skipped — nobody needs an audit entry telling them
 * that updatedAt changed on an update.
 */
export function diffDocuments(before = {}, after = {}) {
  const SKIP = new Set(["createdAt", "updatedAt", "id", "at"]);
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  const beforeOut = {};
  const afterOut = {};
  const fields = [];

  keys.forEach((key) => {
    if (SKIP.has(key)) return;
    const b = before ? before[key] : undefined;
    const a = after ? after[key] : undefined;
    if (isEqual(b, a)) return;
    if (b === undefined && a === undefined) return;
    fields.push(key);
    beforeOut[key] = truncate(b);
    afterOut[key] = truncate(a);
  });

  return { before: beforeOut, after: afterOut, fields };
}

/**
 * Record one administrator action.
 *
 * @param {object} entry
 * @param {string} entry.action    create | update | delete | activate |
 *                                 deactivate | approve | reject |
 *                                 permissions | reorder | login
 * @param {string} entry.section   a permission key (majors, users, tree…)
 * @param {string} [entry.entityId]
 * @param {string} [entry.entityLabel] human-readable name of the record
 * @param {object} [entry.before]  pre-change document (diffed automatically)
 * @param {object} [entry.after]   post-change document
 * @param {string} [entry.targetUid]   account acted upon, when applicable
 * @param {string} [entry.targetEmail]
 * @param {string} [entry.summary] optional pre-written one-line description
 */
export async function logAction(entry) {
  if (!currentActor) {
    console.warn("[ICC Audit] No actor set — skipping audit write.", entry);
    return null;
  }

  const { before, after, ...rest } = entry;
  let diff = { before: {}, after: {}, fields: [] };
  if (before || after) diff = diffDocuments(before, after);

  const section = rest.section || "unknown";
  const action = specialize(normalizeAction(rest.action), section);

  const record = {
    ...currentActor,
    action,
    // `section` is the historical field name and what the Firestore query
    // and its index are built on; `resource` is the name the brief uses.
    // Both are written with the same value so neither the existing index
    // nor the specified shape has to give way.
    section,
    resource: section,
    entityId: rest.entityId || null,
    resourceId: rest.entityId || null,
    entityLabel: truncate(rest.entityLabel || ""),
    resourceName: truncate(rest.entityLabel || ""),
    targetUid: rest.targetUid || null,
    targetEmail: rest.targetEmail || null,
    summary: truncate(rest.summary || ""),
    changedFields: diff.fields,
    before: diff.before,
    after: diff.after,
    // The brief's `changes` field: the same diff in one object, so a
    // reader can render it without joining three arrays together.
    changes: diff.fields.map((f) => ({
      field: f,
      before: diff.before[f] ?? null,
      after: diff.after[f] ?? null,
    })),
    // Free-form context a caller wants preserved (the version restored, the
    // bulk-operation size). Never credentials — see the note below.
    metadata: sanitizeMetadata(rest.metadata),
  };

  try {
    return await writeAuditLog(record);
  } catch (err) {
    console.error("[ICC Audit] Failed to write audit record:", err, record);
    return null;
  }
}

/**
 * Build a readable one-line sentence for an audit row, in either language.
 * Kept here (rather than in the Audit page) so the same phrasing is used
 * wherever a log line is rendered.
 */
export function describeAudit(row, lang = "en") {
  const t = (key) => window.ICC_I18N.t(key, lang);
  const actor = row.actorDisplayName || row.actorName || row.actorEmail || "—";
  const resource = row.resource || row.section;
  const section = t(`perm_${resource}`) || resource;
  const label = row.resourceName || row.entityLabel || row.targetEmail || row.entityId || "";
  const verb = t(`audit_action_${normalizeAction(row.action)}`) || row.action;

  if (lang === "ar") {
    return `${actor} ${verb} ${section}${label ? ` — ${label}` : ""}`;
  }
  return `${actor} ${verb} ${section}${label ? ` — ${label}` : ""}`;
}
