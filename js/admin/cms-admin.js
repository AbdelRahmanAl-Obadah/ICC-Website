/**
 * cms-admin.js
 * -----------------------------------------------------------------------
 * PHASE 7 (Part 2) — the draft / published / archived lifecycle, shared by
 * every CMS screen in the panel.
 *
 * Five screens (Appearance, Homepage, Content, Navigation, Settings) all
 * need the same six behaviours:
 *
 *   - load the document and decide whether to show the draft or the
 *     published copy;
 *   - track whether the form has unsaved changes;
 *   - save a draft;
 *   - publish;
 *   - unpublish / archive;
 *   - restore a previous published version.
 *
 * Implementing that five times would mean five slightly different answers
 * to "what happens if you publish without saving first" — and on a system
 * whose entire purpose is controlling what the public sees, those answers
 * need to be identical.
 *
 * ==========================================================================
 * THE PERMISSION SPLIT
 * ==========================================================================
 * `edit` writes the draft. `publish` is what moves a draft to the public
 * site. The two are checked separately here so the panel doesn't offer a
 * button that will fail, and enforced independently in firestore.rules so
 * that checking here is a courtesy rather than the control.
 *
 * An admin with edit but not publish gets a working Save button, a
 * disabled Publish button, and a line of text explaining why — rather than
 * a mysterious permission error after they've done the work.
 *
 * ==========================================================================
 * WHY PUBLISH SAVES FIRST
 * ==========================================================================
 * publish() writes the CURRENT FORM VALUES, not the last saved draft.
 * Someone who edits a field and hits Publish means "make what I'm looking
 * at live" — publishing the previous draft instead would silently discard
 * their most recent change while reporting success, which is the worst
 * possible outcome for a control that changes the public site.
 * ------------------------------------------------------------------------ */

import {
  getSiteConfigDoc,
  saveSiteConfigDraft,
  publishSiteConfig,
  archiveSiteConfig,
  restoreArchivedConfig,
  saveVersion,
} from "../firestore.js";
import { normalizeFor, CMS_DOC_SECTION, CMS_STATUS } from "../cms-schema.js";
import { can, ACTIONS } from "../permissions.js";
import { logAction } from "./audit-log.js";

const UI = () => window.ICC_ADMIN_UI;

function lang() {
  return (window.ICC_I18N && window.ICC_I18N.getStoredLang()) || "en";
}
const T = (key) => (window.ICC_I18N ? window.ICC_I18N.t(key, lang()) : key);

export function escapeHTML(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

/**
 * Create a controller for one CMS document.
 *
 * @param {object} opts
 *   docId    — one of CMS_DOCS
 *   profile  — the signed-in admin
 *   read()   — returns the current form values (plain object)
 *   write(v) — fills the form from values
 *   onChange() — optional, called after load/save so a screen can re-render
 */
export function createCmsController({ docId, profile, read, write, onChange }) {
  const section = CMS_DOC_SECTION[docId] || docId;

  const mayEdit = can(profile, section, ACTIONS.EDIT);
  const mayPublish = can(profile, section, ACTIONS.PUBLISH);

  let record = null; // the whole envelope
  let savedSnapshot = ""; // JSON of the last persisted draft, for dirty checks

  /* ------------------------------------------------------------------ */
  /* Dirty tracking                                                      */
  /* ------------------------------------------------------------------ */

  function snapshot() {
    try {
      return JSON.stringify(normalizeFor(docId, read()));
    } catch {
      return "";
    }
  }

  function isDirty() {
    return snapshot() !== savedSnapshot;
  }

  function markClean() {
    savedSnapshot = snapshot();
    renderStatus();
  }

  /* ------------------------------------------------------------------ */
  /* Status bar                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * Show what state the document is in and what's pending.
   *
   * The distinction that matters to an admin: a draft that differs from
   * what's live means the public site is showing something OTHER than what
   * they're looking at. That needs to be visible at all times, not
   * discovered when someone asks why the change never appeared.
   */
  function renderStatus() {
    const mount = document.querySelector("[data-cms-status]");
    if (!mount) return;

    const status = record?.status || CMS_STATUS.DRAFT;
    const hasPublished = !!record?.published;
    const dirty = isDirty();

    const draftJson = JSON.stringify(normalizeFor(docId, record?.draft || {}));
    const publishedJson = JSON.stringify(normalizeFor(docId, record?.published || {}));
    const pending = dirty || (hasPublished && draftJson !== publishedJson) || (!hasPublished && !!record?.draft);

    const badge = hasPublished
      ? `<span class="badge badge--active">${T("cms_status_published")}</span>`
      : status === CMS_STATUS.ARCHIVED
      ? `<span class="badge badge--inactive">${T("cms_status_archived")}</span>`
      : `<span class="badge badge--pending">${T("cms_status_draft")}</span>`;

    mount.innerHTML = `
      <div class="cms-status">
        <div class="cms-status__main">
          ${badge}
          <span class="cms-status__text">${
            pending ? T("cms_pending_changes") : hasPublished ? T("cms_up_to_date") : T("cms_never_published")
          }</span>
        </div>
        ${dirty ? `<span class="cms-status__dirty">${T("cms_unsaved")}</span>` : ""}
      </div>`;
  }

  /* ------------------------------------------------------------------ */
  /* Load                                                                */
  /* ------------------------------------------------------------------ */

  /**
   * Load the document into the form.
   *
   * Prefers the draft, falling back to the published copy: an admin
   * reopening a screen should see their work in progress, and someone
   * opening a document that has only ever been published should see what's
   * live rather than an empty form.
   */
  async function load() {
    record = await getSiteConfigDoc(docId);
    const values = record?.draft || record?.published || {};
    write(normalizeFor(docId, values));
    markClean();
    if (onChange) onChange();
    return record;
  }

  /* ------------------------------------------------------------------ */
  /* Mutations                                                           */
  /* ------------------------------------------------------------------ */

  function actorMeta() {
    return {
      actorUid: profile?.uid || profile?.id || null,
      actorName: profile?.displayName || profile?.email || "",
    };
  }

  async function saveDraft({ silent = false } = {}) {
    if (!mayEdit) {
      UI().errorToast(T("err_no_edit"));
      return false;
    }
    const values = normalizeFor(docId, read());
    try {
      await saveSiteConfigDraft(docId, values, actorMeta());
      await logAction({
        action: "update",
        section,
        entityId: docId,
        entityLabel: T(`cms_doc_${docId}`),
        summary: T("cms_log_draft_saved"),
        before: record?.draft || null,
        after: values,
      });
      record = { ...(record || {}), draft: values, status: record?.published ? record.status : CMS_STATUS.DRAFT };
      markClean();
      if (!silent) UI().successToast(T("cms_draft_saved"));
      return true;
    } catch (err) {
      console.error(`[ICC Admin] Save draft failed for ${docId}:`, err);
      UI().errorToast(T("admin_error_permission"));
      return false;
    }
  }

  /**
   * Publish what is currently in the form.
   *
   * Confirmed first, because unlike every other save in the panel this one
   * is immediately visible to every visitor.
   */
  async function publish() {
    if (!mayPublish) {
      UI().errorToast(T("err_no_publish"));
      return false;
    }

    const ok = await UI().confirmDialog({
      title: T("cms_publish_title"),
      message: T("cms_publish_msg"),
      warning: T("cms_publish_warning"),
      confirmLabel: T("cms_publish"),
    });
    if (!ok) return false;

    // The form's current values, not the last saved draft — see the note
    // at the top of this file.
    const values = normalizeFor(docId, read());
    try {
      // Snapshot what is CURRENTLY live before replacing it.
      //
      // The in-document `archived` array already kept these, but only the
      // owning CMS screen could see it — so the Version History page, whose
      // whole purpose is answering "something changed, what was it", was
      // blind to every website content change. Mirroring the snapshot into
      // the `versions` collection puts CMS changes in the same history as
      // academic records. A failure here must not block publishing, so it
      // is logged and stepped over like the audit write is.
      if (record?.published) {
        try {
          await saveVersion("siteConfig", docId, record.published, {
            ...actorMeta(),
            actorEmail: profile?.email || "",
            reason: "update",
          });
        } catch (err) {
          console.warn(`[ICC Admin] Version snapshot failed for ${docId}:`, err);
        }
      }

      await publishSiteConfig(docId, values, actorMeta());
      await logAction({
        action: "publish",
        section,
        entityId: docId,
        entityLabel: T(`cms_doc_${docId}`),
        summary: T("cms_log_published"),
        before: record?.published || null,
        after: values,
      });
      record = {
        ...(record || {}),
        draft: values,
        published: values,
        status: CMS_STATUS.PUBLISHED,
      };
      markClean();
      UI().successToast(T("cms_published_success"));
      return true;
    } catch (err) {
      console.error(`[ICC Admin] Publish failed for ${docId}:`, err);
      UI().errorToast(T("admin_error_permission"));
      return false;
    }
  }

  /**
   * Withdraw the live version. The draft survives, so this is "take it
   * down while we fix it", not "delete the work".
   */
  async function archive() {
    if (!mayPublish) {
      UI().errorToast(T("err_no_publish"));
      return false;
    }
    const ok = await UI().confirmDialog({
      title: T("cms_archive_title"),
      message: T("cms_archive_msg"),
      warning: T("cms_archive_warning"),
      confirmLabel: T("cms_archive"),
      danger: true,
    });
    if (!ok) return false;

    try {
      if (record?.published) {
        try {
          await saveVersion("siteConfig", docId, record.published, {
            ...actorMeta(),
            actorEmail: profile?.email || "",
            reason: "unpublish",
          });
        } catch (err) {
          console.warn(`[ICC Admin] Version snapshot failed for ${docId}:`, err);
        }
      }
      await archiveSiteConfig(docId, actorMeta());
      await logAction({
        action: "unpublish",
        section,
        entityId: docId,
        entityLabel: T(`cms_doc_${docId}`),
        summary: T("cms_log_archived"),
        before: record?.published || null,
      });
      record = { ...(record || {}), published: null, status: CMS_STATUS.ARCHIVED };
      renderStatus();
      UI().successToast(T("cms_archived_success"));
      return true;
    } catch (err) {
      console.error(`[ICC Admin] Archive failed for ${docId}:`, err);
      UI().errorToast(T("admin_error_permission"));
      return false;
    }
  }

  /**
   * Previous published versions, newest first — the reason publishing is
   * reversible rather than a one-way door.
   */
  function archivedVersions() {
    return Array.isArray(record?.archived) ? record.archived : [];
  }

  /**
   * Put an archived version back into the DRAFT rather than straight onto
   * the public site. Restoring is an edit like any other; it still has to
   * be reviewed and published, which also means it needs only `edit`.
   */
  async function restore(index) {
    if (!mayEdit) {
      UI().errorToast(T("err_no_edit"));
      return false;
    }
    try {
      const values = await restoreArchivedConfig(docId, index, actorMeta());
      write(normalizeFor(docId, values));
      record = { ...(record || {}), draft: values };
      markClean();
      if (onChange) onChange();
      await logAction({
        action: "restore_version",
        section,
        entityId: docId,
        entityLabel: T(`cms_doc_${docId}`),
        summary: T("cms_log_restored"),
        after: values,
        metadata: { restoredIndex: index, restoredInto: "draft" },
      });
      UI().successToast(T("cms_restored_success"));
      return true;
    } catch (err) {
      console.error(`[ICC Admin] Restore failed for ${docId}:`, err);
      UI().errorToast(T("admin_error_generic"));
      return false;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Toolbar                                                             */
  /* ------------------------------------------------------------------ */

  /**
   * Wire the standard Save / Publish / Archive / History controls.
   *
   * Controls the admin cannot use are DISABLED with an explanation rather
   * than hidden: "you don't have permission to publish" is actionable —
   * they know who to ask. A button that silently isn't there just looks
   * like the feature doesn't exist.
   */
  function wireToolbar() {
    const saveBtn = document.querySelector("[data-cms-save]");
    const publishBtn = document.querySelector("[data-cms-publish]");
    const archiveBtn = document.querySelector("[data-cms-archive]");
    const historyBtn = document.querySelector("[data-cms-history]");
    const note = document.querySelector("[data-cms-permission-note]");

    if (saveBtn) {
      saveBtn.disabled = !mayEdit;
      saveBtn.addEventListener("click", (e) => {
        e.preventDefault();
        saveDraft();
      });
    }

    if (publishBtn) {
      publishBtn.disabled = !mayPublish;
      publishBtn.title = mayPublish ? "" : T("cms_no_publish_hint");
      publishBtn.addEventListener("click", (e) => {
        e.preventDefault();
        publish();
      });
    }

    if (archiveBtn) {
      archiveBtn.disabled = !mayPublish;
      archiveBtn.addEventListener("click", (e) => {
        e.preventDefault();
        archive();
      });
    }

    if (historyBtn) {
      historyBtn.addEventListener("click", (e) => {
        e.preventDefault();
        openHistory();
      });
    }

    if (note && !mayPublish) {
      note.textContent = T("cms_no_publish_hint");
      note.hidden = false;
    }

    // Leaving with unsaved work is nearly always an accident — the browser
    // prompt is the only reliable place to catch it.
    window.addEventListener("beforeunload", (e) => {
      if (!isDirty()) return;
      e.preventDefault();
      e.returnValue = "";
    });
  }

  /**
   * Flatten a CMS document into comparable leaf paths.
   *
   * CMS values are nested (appearance.colors.primary, homepage sections as
   * arrays), so a shallow key comparison would report "sections changed"
   * and nothing more useful. Flattening to dotted paths means the diff says
   * which section's which field moved, which is the only version of this
   * that answers "what actually changed".
   */
  function flatten(value, prefix = "", out = {}) {
    if (value === null || value === undefined) {
      out[prefix || "value"] = "";
      return out;
    }
    if (Array.isArray(value)) {
      value.forEach((v, i) => flatten(v, prefix ? `${prefix}[${i}]` : `[${i}]`, out));
      return out;
    }
    if (typeof value === "object") {
      const keys = Object.keys(value);
      if (!keys.length) out[prefix || "value"] = "{}";
      keys.forEach((k) => flatten(value[k], prefix ? `${prefix}.${k}` : k, out));
      return out;
    }
    out[prefix || "value"] = String(value);
    return out;
  }

  /** Rows where an archived version differs from the current draft. */
  function diffAgainstDraft(snapshot) {
    const a = flatten(normalizeFor(docId, snapshot || {}));
    const b = flatten(normalizeFor(docId, read()));
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    return keys
      .map((k) => ({ key: k, before: a[k] ?? "—", after: b[k] ?? "—" }))
      .filter((r) => r.before !== r.after);
  }

  function diffTableHTML(snapshot) {
    const rows = diffAgainstDraft(snapshot);
    if (!rows.length) return `<p class="hint">${T("ver_identical")}</p>`;
    return `
      <table class="admin-table admin-table--diff">
        <thead><tr>
          <th>${T("admin_field_field")}</th>
          <th>${T("ver_this_version")}</th>
          <th>${T("ver_current")}</th>
        </tr></thead>
        <tbody>${rows
          .map(
            (r) => `<tr>
              <td><code>${escapeHTML(r.key)}</code></td>
              <td class="wrap diff-before">${escapeHTML(r.before)}</td>
              <td class="wrap diff-after">${escapeHTML(r.after)}</td>
            </tr>`
          )
          .join("")}</tbody>
      </table>`;
  }

  function openHistory() {
    const versions = archivedVersions();
    const body = document.createElement("div");

    if (!versions.length) {
      body.innerHTML = `<p class="hint">${T("cms_history_empty")}</p>`;
      UI().openModal({ title: T("cms_history_title"), bodyEl: body, small: true });
      return;
    }

    body.innerHTML = `
      <p class="hint">${T("cms_history_lede")}</p>
      <div class="ver-list">
        ${versions
          .map((v, i) => {
            const when = v.at ? new Date(v.at).toLocaleString(lang() === "ar" ? "ar" : "en-GB") : "—";
            return `
              <div class="ver-item" data-index="${i}">
                <div class="ver-item__meta">
                  <strong>${escapeHTML(when)}</strong>
                  <span class="hint">${escapeHTML(v.by || "—")}</span>
                </div>
                <div class="ver-item__actions">
                  <button type="button" class="btn btn--outline btn--xs" data-compare="${i}">${T(
              "ver_compare"
            )}</button>
                  <button type="button" class="btn btn--outline btn--sm" data-restore="${i}" ${
              mayEdit ? "" : "disabled"
            }>${T("cms_restore")}</button>
                </div>
                <div class="ver-item__diff" hidden></div>
              </div>`;
          })
          .join("")}
      </div>`;

    body.querySelectorAll("[data-compare]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = Number(btn.getAttribute("data-compare"));
        const mount = btn.closest(".ver-item").querySelector(".ver-item__diff");
        if (!mount.hidden) {
          mount.hidden = true;
          return;
        }
        mount.innerHTML = diffTableHTML(versions[i]?.values ?? versions[i]);
        mount.hidden = false;
      });
    });

    body.querySelectorAll("[data-restore]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        UI().closeModal();
        await restore(Number(btn.getAttribute("data-restore")));
      });
    });

    UI().openModal({ title: T("cms_history_title"), bodyEl: body });
  }

  /**
   * Re-evaluate the status bar as the admin types, so the "unsaved
   * changes" indicator is live rather than appearing only after an action.
   */
  function watchForm(formSelector) {
    const form = document.querySelector(formSelector);
    if (!form) return;
    ["input", "change"].forEach((evt) =>
      form.addEventListener(evt, () => renderStatus())
    );
  }

  return {
    load,
    saveDraft,
    publish,
    archive,
    restore,
    archivedVersions,
    wireToolbar,
    watchForm,
    renderStatus,
    markClean,
    isDirty,
    mayEdit,
    mayPublish,
    get record() {
      return record;
    },
  };
}
