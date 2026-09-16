import { getActivePublicAdmins } from "./firestore.js";
import { normalizeDriveImageUrl } from "./drive-utils.js";

function esc(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}
function render(records) {
  const lang = window.ICC_I18N.getStoredLang();
  const mount = document.querySelector("[data-public-admins]");
  mount.innerHTML = records.map((record) => {
    const name = record.name?.[lang] || record.name?.en || "";
    const title = record.title?.[lang] || record.title?.en || "";
    const description = record.description?.[lang] || record.description?.en || "";
    const imageUrl = normalizeDriveImageUrl(record.imageUrl);
    const crop = record.imageCrop || {};
    const imageStyle = `transform:translate(${Number(crop.x) || 0}px,${Number(crop.y) || 0}px) scale(${Number(crop.zoom) || 1});`;
    return `<article class="admin-card">${imageUrl ? `<div class="admin-card__media"><img class="admin-card__photo" style="${imageStyle}" src="${esc(imageUrl)}" alt="${esc(name)}"></div>` : `<div class="admin-card__avatar">${esc(name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2))}</div>`}<div class="admin-card__body"><h3>${esc(name)}</h3><span class="admin-card__role">${esc(title)}</span>${description ? `<p class="admin-card__note">${esc(description)}</p>` : ""}</div></article>`;
  }).join("");
}
async function init() {
  try { const records = await getActivePublicAdmins(); render(records); } catch (error) { console.error("[ICC] Failed to load public admins", error); }
}
document.addEventListener("DOMContentLoaded", init);
document.addEventListener("icc:languagechange", () => { if (document.querySelector("[data-public-admins]")) init(); });
