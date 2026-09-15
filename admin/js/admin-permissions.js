/**
 * Single source of truth for every fine-grained admin permission.
 * Add a new manageable area of the site by adding one line here — the
 * "Team & access" page, the permission checks in admin-guard.js and the
 * Firestore rules key on these exact string values.
 */
export const PERMISSION_GROUPS = [
  {
    label: 'Academic data',
    items: [
      { key: 'majors', label: 'Majors' },
      { key: 'semesters', label: 'Semesters' },
      { key: 'subjects', label: 'Subjects' },
      { key: 'requirements', label: 'Requirements (free elective / university / college)' },
      { key: 'curriculum', label: 'Curriculum trees & uploaded curriculum files' },
    ],
  },
  {
    label: 'Website content',
    items: [
      { key: 'content_hero', label: 'Homepage hero' },
      { key: 'content_about', label: 'About ICC section' },
      { key: 'content_nav', label: 'Navigation menu' },
      { key: 'content_footer', label: 'Footer' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { key: 'settings', label: 'Site settings' },
      { key: 'users', label: 'Team & access (approve accounts, edit permissions)' },
      { key: 'auditlog', label: 'Audit log (view who changed what)' },
    ],
  },
];

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap(g => g.items.map(i => i.key));
export const PERMISSION_LABELS = Object.fromEntries(PERMISSION_GROUPS.flatMap(g => g.items.map(i => [i.key, i.label])));

/** A Super administrator implicitly has every permission. */
export function hasPermission(profile, key) {
  if (!profile) return false;
  if (profile.role === 'superadmin') return true;
  return Array.isArray(profile.permissions) && profile.permissions.includes(key);
}

/** True if the profile has at least one of the given keys (or a single key). */
export function hasAnyPermission(profile, keys) {
  if (!profile) return false;
  if (profile.role === 'superadmin') return true;
  const list = Array.isArray(keys) ? keys : [keys];
  return list.some(key => hasPermission(profile, key));
}

/**
 * Single source of truth for the sidebar. Every manageable area of the
 * admin panel is one entry here — the page it links to, its icon, and the
 * permission key(s) required to see it. admin-layout.js renders this list
 * after the signed-in admin's profile/permissions are known, so each admin
 * only ever sees the sections they've actually been granted. Dashboard has
 * no `permission`, so it's visible to every signed-in admin/superadmin.
 */
export const NAV_ITEMS = [
  { href: 'index.html', label: 'Dashboard', icon: 'dashboard', permission: null },
  { href: 'majors.html', label: 'Majors', icon: 'majors', permission: 'majors' },
  { href: 'semesters.html', label: 'Semesters', icon: 'semesters', permission: 'semesters' },
  { href: 'subjects.html', label: 'Subjects', icon: 'subjects', permission: 'subjects' },
  { href: 'requirements.html', label: 'Requirements', icon: 'requirements', permission: 'requirements' },
  { href: 'curriculum.html', label: 'Curriculum trees', icon: 'curriculum', permission: 'curriculum' },
  { href: 'content.html', label: 'Website content', icon: 'content', permission: ['content_hero', 'content_about', 'content_nav', 'content_footer'] },
  { href: 'settings.html', label: 'Settings', icon: 'settings', permission: 'settings' },
  { href: 'users.html', label: 'Team & access', icon: 'users', permission: 'users' },
  { href: 'audit-log.html', label: 'Audit log', icon: 'audit', permission: 'auditlog' },
];
