import { protectAdminPage } from "./admin-guard.js";
import { can, ACTIONS } from "../permissions.js";
import { createPublicAdmin, deletePublicAdmin, getAllPublicAdmins, updatePublicAdmin } from "../firestore.js";
import { normalizeDriveImageUrl } from "../drive-utils.js";

const SECTION = "publicAdmins";
let profile = null;
let records = [];
const UI = () => window.ICC_ADMIN_UI;
const T = (key) => window.ICC_I18N.t(key, window.ICC_I18N.getStoredLang());

function esc(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}
function value(record, field) { return record?.[field]?.["en"] || ""; }
function cropOf(record) { return { x: Number(record.imageCrop?.x) || 0, y: Number(record.imageCrop?.y) || 0, zoom: Number(record.imageCrop?.zoom) || 1 }; }
function cropEditorHTML(record) {
  const crop = cropOf(record);
  const image = `<img data-crop-image src="${esc(normalizeDriveImageUrl(record.imageUrl || ""))}" alt="Image crop preview"${record.imageUrl ? "" : " hidden"}>`;
  return `<div class="image-cropper" data-cropper><div class="image-cropper__viewport" data-crop-viewport>${image}</div><p class="hint">Drag the image to choose the visible area. Use the zoom slider to enlarge it.</p><input type="range" min="1" max="3" step="0.05" value="${crop.zoom}" data-crop-zoom aria-label="Image zoom"><input type="hidden" name="cropX" value="${crop.x}"><input type="hidden" name="cropY" value="${crop.y}"><input type="hidden" name="cropZoom" value="${crop.zoom}"></div>`;
}
function wireCropper(form) {
  const cropper = form.querySelector("[data-cropper]");
  const viewport = form.querySelector("[data-crop-viewport]");
  const image = form.querySelector("[data-crop-image]");
  if (!cropper || !viewport || !image) return;
  const xField = form.querySelector("[name=cropX]");
  const yField = form.querySelector("[name=cropY]");
  const zoomField = form.querySelector("[name=cropZoom]");
  let x = Number(xField.value) || 0;
  let y = Number(yField.value) || 0;
  let zoom = Number(zoomField.value) || 1;
  let start = null;
  const paint = () => { image.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`; xField.value = x; yField.value = y; zoomField.value = zoom; };
  viewport.addEventListener("pointerdown", (event) => { start = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: x, originY: y }; viewport.setPointerCapture(event.pointerId); });
  viewport.addEventListener("pointermove", (event) => { if (!start) return; x = start.originX + event.clientX - start.x; y = start.originY + event.clientY - start.y; paint(); });
  viewport.addEventListener("pointerup", () => { start = null; });
  viewport.addEventListener("pointercancel", () => { start = null; });
  form.querySelector("[data-crop-zoom]").addEventListener("input", (event) => { zoom = Number(event.target.value) || 1; paint(); });
  form.querySelector("[data-image-url]").addEventListener("change", (event) => { image.src = normalizeDriveImageUrl(event.target.value.trim()); image.hidden = !event.target.value.trim(); paint(); });
  paint();
}
function formHTML(record = {}) {
  return `<form class="admin-form" data-person-form novalidate>
    <div class="admin-form__row"><div class="form-field"><label>Name (English) *</label><input name="name_en" required value="${esc(value(record, "name"))}"></div><div class="form-field"><label>Name (Arabic) *</label><input name="name_ar" dir="rtl" required value="${esc(record.name?.ar || "")}"></div></div>
    <div class="admin-form__row"><div class="form-field"><label>Job title (English) *</label><input name="title_en" required value="${esc(value(record, "title"))}"></div><div class="form-field"><label>Job title (Arabic) *</label><input name="title_ar" dir="rtl" required value="${esc(record.title?.ar || "")}"></div></div>
    <div class="admin-form__row"><div class="form-field"><label>Description (English)</label><textarea name="description_en" rows="3">${esc(value(record, "description"))}</textarea></div><div class="form-field"><label>Description (Arabic)</label><textarea name="description_ar" dir="rtl" rows="3">${esc(record.description?.ar || "")}</textarea></div></div>
    <div class="form-field"><label>Profile image Google Drive link</label><input type="url" name="imageUrl" data-image-url value="${esc(record.imageUrl || "")}" placeholder="https://drive.google.com/file/d/.../view"><p class="hint">Set the file sharing to anyone with the link can view.</p>${cropEditorHTML(record)}</div>
    <div class="admin-form__row"><div class="form-field"><label>Display order</label><input type="number" name="displayOrder" min="0" value="${record.displayOrder ?? records.length}"></div><div class="form-field"><label class="form-check"><input type="checkbox" name="active" ${record.active !== false ? "checked" : ""}> Active</label></div></div>
    <div class="admin-form__actions"><button type="button" class="btn btn--outline" data-cancel>Cancel</button><button type="submit" class="btn btn--primary" data-submit>Save</button></div>
  </form>`;
}
function render() {
  const body = document.querySelector("[data-table-body]");
  document.querySelector("[data-empty]").hidden = records.length > 0;
  body.innerHTML = records.map((record) => `<tr data-id="${esc(record.id)}"><td>${record.imageUrl ? `<img class="admin-table__avatar" src="${esc(record.imageUrl)}" alt="">` : ""}${esc(value(record, "name"))}</td><td>${esc(value(record, "title"))}</td><td>${record.active ? "Active" : "Inactive"}</td><td><button class="btn btn--ghost btn--sm" data-action="edit">Edit</button><button class="btn btn--ghost btn--sm" data-action="toggle">${record.active ? "Hide" : "Publish"}</button><button class="btn btn--ghost btn--sm" data-action="delete">Delete</button></td></tr>`).join("");
}
async function load() { records = await getAllPublicAdmins(); render(); }
function openForm(record) {
  const wrap = document.createElement("div"); wrap.innerHTML = formHTML(record); const form = wrap.querySelector("form");
  form.querySelector("[data-cancel]").onclick = () => UI().closeModal();
  wireCropper(form);
  form.onsubmit = async (event) => { event.preventDefault(); const fd = new FormData(form); const data = { name: { en: fd.get("name_en").trim(), ar: fd.get("name_ar").trim() }, title: { en: fd.get("title_en").trim(), ar: fd.get("title_ar").trim() }, description: { en: fd.get("description_en").trim(), ar: fd.get("description_ar").trim() }, imageUrl: fd.get("imageUrl").trim(), imageCrop: { x: Number(fd.get("cropX")) || 0, y: Number(fd.get("cropY")) || 0, zoom: Number(fd.get("cropZoom")) || 1 }, displayOrder: Number(fd.get("displayOrder")) || 0, active: fd.get("active") === "on" };
    if (!data.name.en || !data.name.ar || !data.title.en || !data.title.ar) return UI().errorToast(T("admin_field_required"));
    const submit = form.querySelector("[data-submit]"); submit.disabled = true;
    try { if (record) await updatePublicAdmin(record.id, data); else await createPublicAdmin(data); UI().closeModal(); await load(); UI().successToast(T("admin_updated_success")); } catch (error) { console.error("[ICC Admin] Public admin save failed", error); UI().errorToast(error.message || T("admin_error_generic")); } finally { submit.disabled = false; }
  };
  UI().openModal({ title: record ? T("admin_edit_public_admin") : T("admin_add_public_admin"), bodyEl: wrap });
}
async function action(record, type) { try { if (type === "delete") { if (!window.confirm(T("admin_confirm_delete_msg"))) return; await deletePublicAdmin(record.id); } else await updatePublicAdmin(record.id, { active: !record.active }); await load(); } catch (error) { UI().errorToast(T("admin_error_generic")); } }
document.addEventListener("DOMContentLoaded", () => protectAdminPage(SECTION, async (_user, adminProfile) => { profile = adminProfile; document.querySelector("[data-add-btn]").hidden = !can(profile, SECTION, ACTIONS.CREATE); document.querySelector("[data-add-btn]").onclick = () => openForm(); document.querySelector("[data-table-body]").onclick = (event) => { const button = event.target.closest("[data-action]"); if (!button) return; const record = records.find((item) => item.id === button.closest("tr").dataset.id); if (button.dataset.action === "edit") openForm(record); else action(record, button.dataset.action); }; await load(); document.addEventListener("icc:languagechange", render); }));
