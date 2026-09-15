import { auth } from '../../js/firebase-init.js';
import { getAdminProfile, signOutAdmin, watchAuth } from '../../js/auth.js';
import { setAuditActor } from '../../js/firestore.js';
import { hasPermission } from './admin-permissions.js';
import { renderNav } from './admin-layout.js';

/**
 * Gates an admin page behind a signed-in, approved admin/superadmin
 * account, and (optionally) one or more fine-grained permission keys
 * from admin-permissions.js. Pass a single key or an array of keys —
 * the page renders if the profile has ANY of the keys listed.
 */
export function requireAdmin(render, permission) {
  const loading = document.querySelector('[data-admin-loading]');
  watchAuth(async user => {
    if (!user) { location.replace('login.html'); return; }
    try {
      const profile = await getAdminProfile(user);
      if (!profile) { await signOutAdmin(); location.replace('login.html?error=unauthorized'); return; }
      setAuditActor({ uid: user.uid, email: user.email, displayName: profile.displayName || user.displayName || user.email });
      document.querySelectorAll('[data-admin-name]').forEach(x => x.textContent = profile.displayName || user.displayName || user.email);
      document.querySelectorAll('[data-admin-email]').forEach(x => x.textContent = user.email);
      renderNav(profile);
      if (loading) loading.hidden = true;
      const required = permission ? (Array.isArray(permission) ? permission : [permission]) : null;
      if (required && !required.some(key => hasPermission(profile, key))) {
        document.querySelector('.admin-content').insertAdjacentHTML('beforeend', '<div class="state state--error"><strong>You do not have permission to manage this area.</strong> Ask a Super administrator to grant it from Team &amp; access.</div>');
        return;
      }
      render?.(profile);
    } catch (e) {
      console.error(e);
      if (loading) loading.textContent = 'Unable to verify administrator access.';
    }
  });
}

export { hasPermission };
