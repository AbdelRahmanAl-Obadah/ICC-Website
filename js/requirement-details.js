import { getRequirements, FirestoreNotConfiguredError } from "./firestore.js";

const CATEGORY_LABELS = {
  "free-elective": "admin_cat_free_elective",
  university: "admin_cat_university",
  college: "admin_cat_college",
};

let requirement = null;

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>\'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function render() {
  if (!requirement || !window.ICC_I18N) return;
  const lang = window.ICC_I18N.getStoredLang();
  const t = window.ICC_I18N.t;
  const name = requirement.name?.[lang] || requirement.name?.en || requirement.code || "";
  const description = requirement.description?.[lang] || requirement.description?.en || "";
  const typeLabel = t(CATEGORY_LABELS[requirement.category] || "nav_requirements", lang);

  document.querySelectorAll("[data-requirement-name]").forEach((el) => { el.textContent = name; });
  document.querySelectorAll("[data-requirement-type]").forEach((el) => { el.textContent = typeLabel; });
  document.querySelectorAll("[data-requirement-code]").forEach((el) => { el.textContent = requirement.code || ""; });
  const descriptionEl = document.querySelector("[data-requirement-description]");
  if (descriptionEl) descriptionEl.textContent = description;
  document.title = `${name} — ICC | JUST`;

  const mount = document.querySelector("[data-requirement-mount]");
  if (!mount) return;
  const courseUrl = safeExternalUrl(requirement.courseUrl);
  const facts = [
    requirement.code ? escapeHTML(requirement.code) : "",
    requirement.creditHours != null ? `${escapeHTML(requirement.creditHours)} ${t("credit_hours", lang)}` : "",
  ].filter(Boolean);
  mount.innerHTML = `
    <article class="subject-detail">
      <div class="subject-detail__facts">${facts.map((fact) => `<span>${fact}</span>`).join("")}</div>
      ${description ? `<p class="subject-detail__description">${escapeHTML(description)}</p>` : ""}
      ${courseUrl ? `<a class="btn btn--outline" href="${escapeHTML(courseUrl)}" target="_blank" rel="noopener noreferrer">${t("course_link", lang)}</a>` : ""}
    </article>`;
}

async function init() {
  const id = new URLSearchParams(window.location.search).get("id");
  const mount = document.querySelector("[data-requirement-mount]");
  const lang = window.ICC_I18N.getStoredLang();
  if (!id) {
    mount.innerHTML = `<div class="state state--error"><strong>${window.ICC_I18N.t("subject_not_found_title", lang)}</strong><p>${window.ICC_I18N.t("subject_not_found_body", lang)}</p></div>`;
    return;
  }
  try {
    requirement = (await getRequirements()).find((item) => item.id === id) || null;
    if (!requirement) throw new Error("Requirement not found");
    render();
  } catch (error) {
    if (!(error instanceof FirestoreNotConfiguredError)) console.error("[ICC] Failed to load requirement:", error);
    mount.innerHTML = `<div class="state state--error"><strong>${window.ICC_I18N.t("subject_not_found_title", lang)}</strong><p>${window.ICC_I18N.t("subject_not_found_body", lang)}</p></div>`;
  }
}

document.addEventListener("DOMContentLoaded", init);
document.addEventListener("icc:languagechange", render);
