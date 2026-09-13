import { requireAdmin } from './admin-guard.js';
import { approveAdminUser, createAdminUser, deleteAdminUser, getAdminUsers, rejectAdminUser, updateAdminUser } from '../../js/firestore.js';
import { PERMISSION_GROUPS } from './admin-permissions.js';

const app = document.querySelector('[data-users-app]'), list = document.querySelector('[data-users-list]'), modal = document.querySelector('[data-modal]'), form = document.querySelector('[data-user-form]'), notice = document.querySelector('[data-notice]');
const pendingSection = document.querySelector('[data-pending-section]'), pendingList = document.querySelector('[data-pending-list]');
const matrixHost = document.querySelector('[data-permission-matrix]');
let currentUser, users = [];

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const say = (text, type = 'success') => { notice.textContent = text; notice.className = `notice ${type}`; };

matrixHost.innerHTML = PERMISSION_GROUPS.map(group => `<fieldset><legend>${esc(group.label)}</legend>${group.items.map(item => `<label><input type="checkbox" value="${item.key}" name="permissions"> ${esc(item.label)}</label>`).join('')}</fieldset>`).join('');

function roleBadge(user) {
  if (user.role === 'pending') return '<span class="badge pending">Pending</span>';
  if (user.role === 'superadmin') return '<span class="badge superadmin">Super admin</span>';
  return '<span class="badge admin">Administrator</span>';
}

function renderPending() {
  const pending = users.filter(u => u.role === 'pending');
  pendingSection.hidden = pending.length === 0;
  pendingList.innerHTML = pending.map(user => `<div class="approval-card"><div><strong>${esc(user.displayName || 'Unnamed')}</strong><small>${esc(user.email)} · requested access</small></div><div class="actions"><button class="btn" data-approve="${user.id}">Approve…</button><button class="btn danger" data-reject="${user.id}">Reject</button></div></div>`).join('');
}

function render() {
  const rest = users.filter(u => u.role !== 'pending');
  list.innerHTML = rest.map(user => `<tr><td><strong>${esc(user.displayName || 'Unnamed user')}</strong><br><small>${esc(user.email || user.id)}</small></td><td>${roleBadge(user)}</td><td>${user.role === 'superadmin' ? 'Full access' : (user.permissions || []).length ? user.permissions.length + ' area' + (user.permissions.length > 1 ? 's' : '') : '<em>None yet</em>'}</td><td><span class="status ${user.active ? '' : 'off'}">${user.active ? 'Active' : 'Inactive'}</span></td><td class="actions"><button class="btn secondary" data-edit="${user.id}">Edit</button>${user.id !== currentUser.uid ? `<button class="btn danger" data-delete="${user.id}">Remove</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5">No user access profiles yet.</td></tr>';
  renderPending();
}

async function load() { users = await getAdminUsers(); render(); }

function open(user = { active: true, role: 'admin', permissions: [] }, isApproval = false) {
  form.reset();
  form.uid.value = user.id || '';
  form.uid.readOnly = Boolean(user.id);
  document.querySelector('[data-uid-field]').style.display = user.id ? 'none' : '';
  form.displayName.value = user.displayName || '';
  form.email.value = user.email || '';
  form.role.value = user.role === 'pending' ? 'admin' : (user.role || 'admin');
  form.active.value = String(user.active !== false || isApproval);
  form.querySelectorAll('[name="permissions"]').forEach(box => box.checked = (user.permissions || []).includes(box.value));
  document.querySelector('[data-title]').textContent = isApproval ? 'Approve access request' : (user.id ? 'Edit user access' : 'Add user by UID');
  form.dataset.approving = isApproval ? user.id : '';
  modal.hidden = false;
}

requireAdmin(async profile => {
  currentUser = profile;
  await load();
  app.hidden = false;
}, 'users');

document.querySelector('[data-add]').onclick = () => open();
document.addEventListener('click', async event => {
  if (event.target.dataset.close) modal.hidden = true;
  const edit = event.target.dataset.edit, remove = event.target.dataset.delete, approve = event.target.dataset.approve, reject = event.target.dataset.reject;
  if (edit) open(users.find(user => user.id === edit));
  if (approve) open(users.find(user => user.id === approve), true);
  if (reject) {
    if (!confirm('Reject this sign-up request? They will not gain admin access. (Their Firebase Authentication account itself must be deleted separately from the Firebase Console if desired.)')) return;
    try { await rejectAdminUser(reject); say('Request rejected.'); await load(); } catch (error) { say(error.message, 'error'); }
  }
  if (remove) {
    if (!confirm('Remove this user’s admin access? Their Firebase account will not be deleted.')) return;
    try { await deleteAdminUser(remove); say('Access removed.'); await load(); } catch (error) { say(error.message, 'error'); }
  }
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  data.permissions = [...form.querySelectorAll('[name="permissions"]:checked')].map(x => x.value);
  data.active = data.active === 'true';
  const uid = data.uid; delete data.uid;
  try {
    if (form.dataset.approving) { await approveAdminUser(form.dataset.approving, data); say('Access request approved.'); }
    else if (form.uid.readOnly) { await updateAdminUser(uid, data); say('User access saved.'); }
    else { await createAdminUser(uid, data); say('User access saved.'); }
    modal.hidden = true;
    await load();
  } catch (error) {
    console.error(error);
    say(error.message || 'Could not save user access.', 'error');
  }
});
