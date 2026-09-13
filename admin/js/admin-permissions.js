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
