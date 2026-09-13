import { requireAdmin } from './admin-guard.js';
import { getAuditLogs } from '../../js/firestore.js';

const app = document.querySelector('[data-audit-app]'), listEl = document.querySelector('[data-audit-list]'), notice = document.querySelector('[data-notice]'), search = document.querySelector('[data-search]');
let logs = [];
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const say = (t, k = 'error') => { notice.textContent = t; notice.className = `notice ${k}`; };
const ACTION_LABEL = { create: 'created', update: 'updated', delete: 'deleted' };

function formatTime(ts) {
  try { const date = ts?.toDate ? ts.toDate() : new Date(ts); return date.toLocaleString(); } catch { return ''; }
}

function diffHtml(entry) {
  if (!entry.before && !entry.after) return '';
  const before = entry.before ? JSON.stringify(entry.before, null, 2) : '(none)';
  const after = entry.after ? JSON.stringify(entry.after, null, 2) : '(deleted)';
  return `<div class="audit-diff"><strong>Before</strong><code>${esc(before)}</code><br><br><strong>After</strong><code>${esc(after)}</code></div>`;
}

function render() {
  const term = search.value.toLowerCase();
  const filtered = logs.filter(e => JSON.stringify(e).toLowerCase().includes(term));
  listEl.innerHTML = filtered.length ? filtered.map((entry, i) => `
    <div class="audit-item">
      <span class="audit-dot ${entry.action}"></span>
      <div>
        <h4>${esc(entry.actorName || entry.actorEmail)} ${ACTION_LABEL[entry.action] || entry.action} <em>${esc(entry.label || entry.docId || entry.collection)}</em></h4>
        <p>${esc(entry.collection)}${entry.docId ? ' · ' + esc(entry.docId) : ''} — <button type="button" class="btn secondary" style="padding:2px 8px;font-size:11px;box-shadow:none" data-toggle="${i}">View details</button></p>
        ${diffHtml(entry)}
      </div>
      <time>${formatTime(entry.createdAt)}</time>
    </div>`).join('') : '<p style="color:var(--ink-soft);padding:20px 0">No activity recorded yet.</p>';
}

search.addEventListener('input', render);
listEl.addEventListener('click', e => {
  const idx = e.target.dataset.toggle;
  if (idx === undefined) return;
  e.target.closest('.audit-item').querySelector('.audit-diff')?.classList.toggle('open');
});

requireAdmin(async () => {
  try {
    logs = await getAuditLogs(300);
    render();
    app.hidden = false;
  } catch (error) {
    console.error(error);
    app.hidden = false;
    say(error.message || 'Could not load the audit log.');
  }
}, 'auditlog');
