import { requireAdmin, hasPermission } from './admin-guard.js';
import { getSiteContent, updateSiteContent } from '../../js/firestore.js';

const form = document.querySelector('[data-content-form]'), notice = document.querySelector('[data-notice]'), submit = form.querySelector('[type="submit"]');
const navRows = document.querySelector('[data-nav-rows]'), footerRows = document.querySelector('[data-footer-rows]');
const say = (message, type = 'success') => { notice.textContent = message; notice.className = `notice ${type}`; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

/* ---------- generic repeater rows (nav links / footer links) ---------- */
function rowHtml(prefix, item = {}) {
  return `<div class="repeater-row"><input placeholder="Label (English)" data-f="labelEn" value="${esc(item.labelEn)}"><input placeholder="Label (Arabic)" dir="rtl" data-f="labelAr" value="${esc(item.labelAr)}"><input placeholder="Link (e.g. majors.html)" data-f="href" value="${esc(item.href)}"><button type="button" class="btn danger icon-btn" data-remove-row aria-label="Remove">&times;</button></div>`;
}
function readRows(container) {
  return [...container.querySelectorAll('.repeater-row')].map(row => ({
    labelEn: row.querySelector('[data-f="labelEn"]').value.trim(),
    labelAr: row.querySelector('[data-f="labelAr"]').value.trim(),
    href: row.querySelector('[data-f="href"]').value.trim(),
  })).filter(item => item.labelEn || item.href);
}
function fillRows(container, items = []) { container.innerHTML = (items.length ? items : [{}]).map(item => rowHtml('', item)).join(''); }
document.querySelector('[data-nav-add]').addEventListener('click', () => navRows.insertAdjacentHTML('beforeend', rowHtml('nav')));
document.querySelector('[data-footer-add]').addEventListener('click', () => footerRows.insertAdjacentHTML('beforeend', rowHtml('footer')));
document.addEventListener('click', e => { if (e.target.dataset.removeRow !== undefined) e.target.closest('.repeater-row').remove(); });

requireAdmin(async profile => {
  try {
    const content = await getSiteContent();
    for (const [key, value] of Object.entries(content)) if (form.elements[key] && typeof value === 'string') form.elements[key].value = value;
    fillRows(navRows, content.navLinks || [
      { labelEn: 'Majors', labelAr: 'التخصصات', href: 'majors.html' },
      { labelEn: 'Requirements', labelAr: 'المتطلبات', href: 'requirements.html' },
      { labelEn: 'Search', labelAr: 'بحث', href: 'search.html' },
    ]);
    fillRows(footerRows, content.footerColumns || []);
    // Hide sections this admin isn't permitted to touch — Super admins see all.
    document.querySelectorAll('[data-section]').forEach(section => {
      if (!hasPermission(profile, section.dataset.section)) section.style.display = 'none';
    });
    document.querySelector('[data-content-app]').hidden = false;
  } catch (error) {
    console.error(error);
    document.querySelector('[data-content-app]').hidden = false;
    say(error.message || 'Website content could not be loaded.', 'error');
  }
}, ['content_hero', 'content_about', 'content_nav', 'content_footer']);

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  submit.disabled = true; submit.textContent = 'Saving…';
  try {
    const data = Object.fromEntries(new FormData(form));
    data.navLinks = readRows(navRows);
    data.footerColumns = readRows(footerRows);
    await updateSiteContent(data);
    say('Website content saved successfully. Refresh the public-site preview to see the changes.');
  } catch (error) {
    console.error(error);
    say(error.message || 'Could not save website content.', 'error');
  } finally {
    submit.disabled = false; submit.textContent = 'Save website content';
  }
});
