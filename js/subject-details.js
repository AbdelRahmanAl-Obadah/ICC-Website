import { getSubjectById, FirestoreNotConfiguredError } from "./firestore.js";
import { icon } from "./icons.js";

let subject = null;

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
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
  if (!subject || !window.ICC_I18N) return;
  const lang = window.ICC_I18N.getStoredLang();
  const t = window.ICC_I18N.t;
  const name = subject.name?.[lang] || subject.name?.en || subject.code || "";
  const description = subject.description?.[lang] || subject.description?.en || "";
  document.querySelectorAll("[data-subject-name]").forEach((el) => { el.textContent = name; });
  document.querySelectorAll("[data-subject-code]").forEach((el) => { el.textContent = subject.code || ""; });
  const descriptionEl = document.querySelector("[data-subject-description]");
  if (descriptionEl) descriptionEl.textContent = description;
  document.title = `${name} — ICC | JUST`;

  const examLabels = {
    midFinal: ["subject_mid", "subject_final"],
    firstSecondFinal: ["subject_first", "subject_second", "subject_final"],
  };
  const links = subject.examResources?.[subject.examType] || [];
  const resources = links.map((value, index) => {
    const href = safeExternalUrl(value);
    const labelKey = examLabels[subject.examType]?.[index] || "subject_exam";
    return href ? `<a class="resource-link" href="${escapeHTML(href)}" target="_blank" rel="noopener noreferrer"><span>${t(labelKey, lang)}</span>${icon("external-link")}</a>` : "";
  }).join("");
  const courseUrl = safeExternalUrl(subject.courseUrl);
  const mount = document.querySelector("[data-subject-mount]");
  if (!mount) return;
  mount.innerHTML = `
    <div class="subject-detail">
      <div class="subject-detail__facts">
        ${subject.creditHours != null ? `<span>${escapeHTML(subject.creditHours)} ${t("credit_hours", lang)}</span>` : ""}
        ${subject.prerequisite?.[lang] || subject.prerequisite?.en ? `<span>${t("prereq_label", lang)}: ${escapeHTML(subject.prerequisite?.[lang] || subject.prerequisite.en)}</span>` : ""}
      </div>
      ${description ? `<p class="subject-detail__description">${escapeHTML(description)}</p>` : ""}
      <section class="resource-section">
        <div class="section-head"><h2>${t("subject_resources_title", lang)}</h2><p>${t("subject_resources_desc", lang)}</p></div>
        <div class="resource-grid">${resources || `<p class="state__body">${t("subject_resources_empty", lang)}</p>`}</div>
      </section>
      ${courseUrl ? `<a class="btn btn--outline" href="${escapeHTML(courseUrl)}" target="_blank" rel="noopener noreferrer">${t("course_link", lang)} ${icon("external-link")}</a>` : ""}
    </div>`;
}

async function init() {
  const id = new URLSearchParams(window.location.search).get("id");
  const mount = document.querySelector("[data-subject-mount]");
  const lang = window.ICC_I18N.getStoredLang();
  if (!id) {
    mount.innerHTML = `<div class="state state--error"><strong>${window.ICC_I18N.t("subject_not_found_title", lang)}</strong><p>${window.ICC_I18N.t("subject_not_found_body", lang)}</p></div>`;
    return;
  }
  try {
    subject = await getSubjectById(id);
    if (!subject || subject.active === false) throw new Error("Subject not found");
    render();
  } catch (err) {
    if (!(err instanceof FirestoreNotConfiguredError)) console.error("[ICC] Failed to load subject:", err);
    mount.innerHTML = `<div class="state state--error"><strong>${window.ICC_I18N.t("subject_not_found_title", lang)}</strong><p>${window.ICC_I18N.t("subject_not_found_body", lang)}</p></div>`;
  }
}

document.addEventListener("DOMContentLoaded", init);
document.addEventListener("icc:languagechange", render);
