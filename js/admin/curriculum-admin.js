/**
 * curriculum-admin.js — admin/curriculum.html
 * -----------------------------------------------------------------------
 * PHASE 7 — the Academic Tree / Curriculum image manager.
 *
 * ==========================================================================
 * WHY THIS ISN'T A NEW COLLECTION
 * ==========================================================================
 * A curriculum image belongs to exactly one major, or to one specialization
 * within a major. It has no independent life: there is no such thing as a
 * curriculum image that outlives the programme it depicts. So it is stored
 * as `curriculumImageUrl` on the record it belongs to — which is where the
 * major pages have always read it from — rather than in a parallel
 * collection that would need its own joins, its own delete rules, and its
 * own answer to "what happens when the major is removed".
 *
 * This screen therefore adds no schema. It is a focused view over two
 * existing collections: every major and specialization on one page, with
 * the image state of each visible at a glance, so an admin filling in a
 * curriculum can see what is still missing without opening fifteen forms.
 * The same field remains editable from the Majors screen; neither is a
 * copy of the other's data.
 *
 * ==========================================================================
 * GOOGLE DRIVE, EXPLICITLY
 * ==========================================================================
 * Two kinds of URL are accepted: a direct image URL, and a Google Drive
 * sharing link. Drive links are converted to their direct-content form by
 * normalizeDriveImageUrl() in js/drive-utils.js — pure string parsing of
 * the public link shapes Drive itself produces.
 *
 * No Google Drive API. No OAuth. No service account. No credentials of any
 * kind, anywhere in this path. Nothing is uploaded; the browser simply
 * loads an image the way any visitor's browser would. The consequence,
 * which the UI states plainly rather than hiding: a Drive file will only
 * display if its sharing is set to "Anyone with the link can view". This
 * code cannot change that setting and does not try to — which is why the
 * preview below is a real load attempt rather than a validity guess. If
 * the admin can't see it here, neither can a student.
 * ------------------------------------------------------------------------
 */

import { protectAdminPage } from "./admin-guard.js";
import { logAction } from "./audit-log.js";
import {
  getMajors,
  getAllSpecializations,
  updateMajor,
  updateSpecialization,
} from "../firestore.js";
import { can, ACTIONS, filterOwned, ownsRecord } from "../permissions.js";
import { normalizeDriveImageUrl, isDriveUrl } from "../drive-utils.js";
import {
  T,
  escapeHTML,
  localName,
  nameById,
  showLoading,
  showError,
  busy,
} from "./academic-shared.js";

const UI = () => window.ICC_ADMIN_UI;
const SECTION = "curriculum";

let profile = null;
let allMajors = [];
let allSpecializations = [];

/**
 * One flat list of everything that can carry a curriculum image, so the
 * page renders a single consistent grid rather than two near-identical
 * ones. `kind` decides which writer is used on save.
 */
function curriculumTargets() {
  const out = [];
  allMajors.forEach((major) => {
    out.push({
      kind: "major",
      id: major.id,
      majorId: major.id,
      record: major,
      title: localName(major),
      subtitle: T("admin_whole_major"),
      code: major.code || "",
      imageUrl: major.curriculumImageUrl || "",
    });
    allSpecializations
      .filter((s) => s.majorId === major.id)
      .forEach((spec) => {
        out.push({
          kind: "specialization",
          id: spec.id,
          majorId: major.id,
          record: spec,
          title: localName(spec),
          subtitle: nameById(allMajors, major.id),
          code: spec.code || "",
          imageUrl: spec.curriculumImageUrl || "",
        });
      });
  });
  return out;
}

/* ==================================================================== */
/* Filtering                                                            */
/* ==================================================================== */

function currentFilters() {
  return {
    majorId: document.querySelector("[data-major-filter]")?.value || "all",
    state: document.querySelector("[data-image-filter]")?.value || "all",
    search: (document.querySelector("[data-search]")?.value || "").trim().toLowerCase(),
  };
}

function applyFilters(targets) {
  const f = currentFilters();
  return targets.filter((t) => {
    if (f.majorId !== "all" && t.majorId !== f.majorId) return false;
    if (f.state === "with" && !t.imageUrl) return false;
    if (f.state === "without" && t.imageUrl) return false;
    if (!f.search) return true;
    return `${t.title} ${t.subtitle} ${t.code}`.toLowerCase().includes(f.search);
  });
}

/* ==================================================================== */
/* Rendering                                                            */
/* ==================================================================== */

function cardHTML(target) {
  const hasImage = !!target.imageUrl;
  const mayEdit = can(profile, SECTION, ACTIONS.EDIT) && ownsRecord(profile, SECTION, target.record, {
    majors: target.majorId,
  });

  return `
    <article class="curriculum-card" data-kind="${target.kind}" data-id="${escapeHTML(target.id)}">
      <header class="curriculum-card__head">
        <div>
          <h3>${escapeHTML(target.title)}</h3>
          <p class="curriculum-card__sub">${escapeHTML(target.subtitle)}${
            target.code ? ` · ${escapeHTML(target.code)}` : ""
          }</p>
        </div>
        <span class="badge ${hasImage ? "badge--active" : "badge--inactive"}">
          ${hasImage ? T("curr_has_image") : T("curr_no_image")}
        </span>
      </header>

      <div class="curriculum-card__thumb">
        ${
          hasImage
            ? `<img src="${escapeHTML(normalizeDriveImageUrl(target.imageUrl))}"
                    alt="${escapeHTML(T("curr_image_alt").replace("{name}", target.title))}"
                    loading="lazy" data-thumb>
               <div class="curriculum-card__thumb-error" hidden data-thumb-error>
                 ${T("curr_load_failed")}
               </div>`
            : `<div class="curriculum-card__empty">${T("curr_none_yet")}</div>`
        }
      </div>

      <footer class="curriculum-card__actions">
        ${hasImage ? `<button type="button" class="btn btn--ghost btn--sm" data-action="preview">${T("curr_preview")}</button>` : ""}
        ${
          mayEdit
            ? `<button type="button" class="btn btn--outline btn--sm" data-action="edit">${
                hasImage ? T("curr_replace") : T("curr_add")
              }</button>`
            : ""
        }
        ${
          mayEdit && hasImage
            ? `<button type="button" class="btn btn--danger btn--sm" data-action="remove">${T("curr_remove")}</button>`
            : ""
        }
      </footer>
    </article>`;
}

function render() {
  const targets = applyFilters(curriculumTargets());
  const grid = document.querySelector("[data-curriculum-grid]");
  const mount = document.querySelector("[data-state-mount]");

  if (!targets.length) {
    grid.hidden = true;
    mount.innerHTML = UI().stateHTML("empty", {
      title: T("curr_empty_title"),
      body: T("curr_empty_body"),
    });
    return;
  }

  mount.innerHTML = "";
  grid.hidden = false;
  grid.innerHTML = targets.map(cardHTML).join("");

  // A thumbnail that fails to load is the single most common problem here
  // (a Drive file that was never shared publicly), so say so on the card
  // instead of leaving a broken-image icon to be interpreted.
  grid.querySelectorAll("[data-thumb]").forEach((img) => {
    img.addEventListener("error", () => {
      img.hidden = true;
      const err = img.parentElement.querySelector("[data-thumb-error]");
      if (err) err.hidden = false;
    });
  });
}

function populateFilters() {
  const select = document.querySelector("[data-major-filter]");
  if (!select) return;
  const current = select.value || "all";
  select.innerHTML =
    `<option value="all">${T("admin_filter_all_majors")}</option>` +
    allMajors.map((m) => `<option value="${escapeHTML(m.id)}">${escapeHTML(localName(m))}</option>`).join("");
  select.value = current === "all" || allMajors.some((m) => m.id === current) ? current : "all";
}

async function loadAll() {
  showLoading("[data-state-mount]", "[data-curriculum-grid]");
  try {
    const [majors, specializations] = await Promise.all([getMajors(), getAllSpecializations()]);
    allMajors = filterOwned(profile, "majors", majors);
    allSpecializations = filterOwned(profile, "specializations", specializations);
    populateFilters();
    render();
  } catch (err) {
    console.error("[ICC Admin] Failed to load curriculum targets:", err);
    showError("[data-state-mount]", "[data-curriculum-grid]");
  }
}

/* ==================================================================== */
/* Writing                                                             */
/* ==================================================================== */

function saveImageUrl(target, url) {
  const patch = { curriculumImageUrl: url };
  return target.kind === "major"
    ? updateMajor(target.id, patch)
    : updateSpecialization(target.id, patch);
}

function debounce(fn, wait) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/**
 * The edit dialog, with a live preview.
 *
 * The preview actually loads the image rather than pattern-matching the
 * URL, because "is this a well-formed URL" and "will a student see a
 * curriculum here" are different questions, and only the second one
 * matters. A Drive link that parses perfectly but was never shared
 * publicly fails exactly here, before it is saved, rather than silently on
 * the public site.
 */
function openEditor(target) {
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <form data-curriculum-form class="admin-form" novalidate>
      <p class="hint">${T("curr_editing_for").replace("{name}", escapeHTML(target.title))}</p>

      <div class="form-field" data-field="url">
        <label>${T("curr_image_url")}</label>
        <input type="url" name="curriculumImageUrl" data-url-input
               value="${escapeHTML(target.imageUrl)}"
               placeholder="https://…">
        <p class="form-field__error"></p>
        <p class="hint">${T("curr_url_hint")}</p>
      </div>

      <div class="curriculum-preview" data-preview hidden>
        <div class="curriculum-preview__frame">
          <img alt="" data-preview-img hidden>
          <div class="curriculum-preview__placeholder" data-preview-placeholder hidden>
            <span data-preview-message></span>
          </div>
        </div>
        <p class="hint" data-preview-note></p>
      </div>

      <div class="admin-form__actions">
        <button type="button" class="btn btn--outline" data-cancel>${T("admin_cancel")}</button>
        <button type="submit" class="btn btn--primary" data-submit>${T("admin_save")}</button>
      </div>
    </form>`;

  const form = wrap.querySelector("[data-curriculum-form]");
  const input = form.querySelector("[data-url-input]");
  const preview = form.querySelector("[data-preview]");
  const img = form.querySelector("[data-preview-img]");
  const placeholder = form.querySelector("[data-preview-placeholder]");
  const message = form.querySelector("[data-preview-message]");
  const note = form.querySelector("[data-preview-note]");

  function setPreview(rawUrl) {
    const url = (rawUrl || "").trim();
    if (!url) {
      preview.hidden = true;
      return;
    }
    preview.hidden = false;
    img.hidden = true;
    placeholder.hidden = false;
    message.textContent = T("curr_loading");
    note.textContent = isDriveUrl(url) ? T("curr_drive_note") : "";

    const resolved = normalizeDriveImageUrl(url);
    const probe = new Image();
    probe.onload = () => {
      if (input.value.trim() !== url) return; // superseded while probing
      img.src = resolved;
      img.hidden = false;
      placeholder.hidden = true;
    };
    probe.onerror = () => {
      if (input.value.trim() !== url) return;
      img.hidden = true;
      placeholder.hidden = false;
      message.textContent = isDriveUrl(url)
        ? T("curr_drive_failed")
        : T("admin_curriculum_preview_invalid");
    };
    probe.src = resolved;
  }

  input.addEventListener("input", debounce(() => setPreview(input.value), 350));
  setPreview(target.imageUrl);

  wrap.querySelector("[data-cancel]").addEventListener("click", () => UI().closeModal());

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const url = input.value.trim();

    // An empty value is legitimate — it's how you remove an image from
    // here — but anything non-empty must at least be a parseable absolute
    // URL, since a relative path would resolve differently on the admin
    // page and the public page.
    if (url) {
      try {
        new URL(url);
      } catch {
        UI().setFieldError(form.querySelector('[data-field="url"]'), T("curr_invalid_url"));
        return;
      }
    }

    const restore = busy(wrap.querySelector("[data-submit]"));
    try {
      await saveImageUrl(target, url);
      await logAction({
        action: "update",
        section: SECTION,
        entityId: target.id,
        entityLabel: target.title,
        summary: url ? T("curr_log_set") : T("curr_log_cleared"),
        before: { curriculumImageUrl: target.imageUrl },
        after: { curriculumImageUrl: url },
      });
      UI().successToast(T("admin_updated_success"));
      UI().closeModal();
      await loadAll();
    } catch (err) {
      console.error("[ICC Admin] Save curriculum image failed:", err);
      UI().errorToast(T("admin_error_generic"));
    } finally {
      restore();
    }
  });

  UI().openModal({ title: T("curr_editor_title"), bodyEl: wrap });
}

/** Full-size preview — the curriculum as a student will see it. */
function openPreview(target) {
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="curriculum-preview curriculum-preview--full">
      <div class="curriculum-preview__frame">
        <img src="${escapeHTML(normalizeDriveImageUrl(target.imageUrl))}"
             alt="${escapeHTML(T("curr_image_alt").replace("{name}", target.title))}"
             data-full-img>
        <div class="curriculum-preview__placeholder" data-full-error hidden>
          <span>${T("curr_load_failed")}</span>
        </div>
      </div>
      <p class="hint">${escapeHTML(target.imageUrl)}</p>
    </div>`;

  const img = wrap.querySelector("[data-full-img]");
  img.addEventListener("error", () => {
    img.hidden = true;
    wrap.querySelector("[data-full-error]").hidden = false;
  });

  UI().openModal({ title: target.title, bodyEl: wrap });
}

async function handleRemove(target) {
  const ok = await UI().confirmDialog({
    title: T("curr_remove_title"),
    message: T("curr_remove_msg").replace("{name}", target.title),
    warning: T("curr_remove_warning"),
    confirmLabel: T("curr_remove"),
    danger: true,
  });
  if (!ok) return;

  try {
    await saveImageUrl(target, "");
    await logAction({
      action: "update",
      section: SECTION,
      entityId: target.id,
      entityLabel: target.title,
      summary: T("curr_log_cleared"),
      before: { curriculumImageUrl: target.imageUrl },
      after: { curriculumImageUrl: "" },
    });
    UI().successToast(T("curr_removed_success"));
    await loadAll();
  } catch (err) {
    console.error("[ICC Admin] Remove curriculum image failed:", err);
    UI().errorToast(T("admin_error_generic"));
  }
}

/* ==================================================================== */
/* Wiring                                                               */
/* ==================================================================== */

function wireGrid() {
  document.querySelector("[data-curriculum-grid]").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const card = btn.closest("[data-id]");
    const id = card?.getAttribute("data-id");
    const kind = card?.getAttribute("data-kind");
    const target = curriculumTargets().find((t) => t.id === id && t.kind === kind);
    if (!target) return;

    switch (btn.getAttribute("data-action")) {
      case "edit": openEditor(target); break;
      case "preview": openPreview(target); break;
      case "remove": handleRemove(target); break;
    }
  });
}

function wireToolbar() {
  document.querySelector("[data-major-filter]")?.addEventListener("change", render);
  document.querySelector("[data-image-filter]")?.addEventListener("change", render);
  document.querySelector("[data-search]")?.addEventListener("input", render);
  document.querySelector("[data-clear-filters]")?.addEventListener("click", () => {
    ["[data-major-filter]", "[data-image-filter]"].forEach((sel) => {
      const el = document.querySelector(sel);
      if (el) el.value = "all";
    });
    const search = document.querySelector("[data-search]");
    if (search) search.value = "";
    render();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  protectAdminPage(SECTION, async (_user, adminProfile) => {
    profile = adminProfile;
    wireGrid();
    wireToolbar();
    await loadAll();

    document.addEventListener("icc:languagechange", () => {
      populateFilters();
      render();
    });
  });
});
