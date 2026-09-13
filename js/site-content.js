import { getSiteContent } from './firestore.js';

/* Homepage-only copy fields (hero / about / footer blurb). */
const fields = { heroTitleEn: 'hero_title_line1', heroTitleAr: 'hero_title_line1', heroDescriptionEn: 'hero_desc', heroDescriptionAr: 'hero_desc', aboutTitleEn: 'about_title', aboutTitleAr: 'about_title', aboutDescriptionEn: 'about_body', aboutDescriptionAr: 'about_body' };

function applyCopy(content, lang) {
  for (const [field, key] of Object.entries(fields)) {
    if (!field.endsWith(lang === 'ar' ? 'Ar' : 'En') || !content[field]) continue;
    document.querySelectorAll(`[data-i18n="${key}"]`).forEach(node => node.textContent = content[field]);
  }
  const footerField = lang === 'ar' ? 'footerAr' : 'footerEn';
  if (content[footerField]) document.querySelectorAll('[data-i18n="footer_desc"]').forEach(node => node.textContent = content[footerField]);
}

function currentFile() { return (location.pathname.split('/').pop() || 'index.html').split('?')[0]; }

/* Nav menu + footer "Navigate" list are shared chrome present on every
   public page. If an admin has configured navLinks in Website content →
   Navigation menu, that list replaces the hardcoded links here so the
   admin genuinely controls everything from the nav bar to the footer. */
function applyChrome(content, lang) {
  const navLinks = Array.isArray(content.navLinks) ? content.navLinks : null;
  if (navLinks && navLinks.length) {
    const here = currentFile();
    const linkHtml = navLinks.map(item => {
      const label = (lang === 'ar' ? item.labelAr : item.labelEn) || item.labelEn || item.labelAr || item.href;
      const current = item.href === here ? ' aria-current="page"' : '';
      return `<a class="nav__link" href="${item.href}"${current}>${label}</a>`;
    }).join('');
    document.querySelectorAll('.nav__links').forEach(nav => { nav.innerHTML = linkHtml; });
    document.querySelectorAll('.footer__links').forEach(list => {
      list.innerHTML = navLinks.map(item => {
        const label = (lang === 'ar' ? item.labelAr : item.labelEn) || item.labelEn || item.labelAr || item.href;
        return `<li><a href="${item.href}">${label}</a></li>`;
      }).join('') + '<li><a href="admin/login.html">' + (lang === 'ar' ? 'لوحة التحكم' : 'Admin Panel') + '</a></li>';
    });
  }
  const footerColumns = Array.isArray(content.footerColumns) ? content.footerColumns : null;
  if (footerColumns && footerColumns.length) {
    document.querySelectorAll('.footer__links').forEach(list => {
      list.insertAdjacentHTML('beforeend', footerColumns.map(item => {
        const label = (lang === 'ar' ? item.labelAr : item.labelEn) || item.labelEn || item.labelAr || item.href;
        return `<li><a href="${item.href}">${label}</a></li>`;
      }).join(''));
    });
  }
}

function apply(content) {
  const lang = window.ICC_I18N ? window.ICC_I18N.getStoredLang() : (document.documentElement.dir === 'rtl' ? 'ar' : 'en');
  applyCopy(content, lang);
  applyChrome(content, lang);
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const content = await getSiteContent();
    apply(content);
    document.addEventListener('icc:languagechange', () => apply(content));
  } catch (error) {
    console.info('[ICC] Site content is unavailable — showing the built-in defaults.', error);
  }
});
