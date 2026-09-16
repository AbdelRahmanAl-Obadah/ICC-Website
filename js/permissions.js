/**
 * permissions.js
 * -----------------------------------------------------------------------
 * PHASE 6 — the single source of truth for authorization across the whole
 * platform: the permission MATRIX, admin OWNERSHIP, and the content
 * WORKFLOW states that publishing depends on.
 *
 * These three are deliberately in one module because they are one system:
 *   - the matrix decides WHAT an admin may do (view/create/edit/delete/publish)
 *   - ownership decides WHICH records they may do it to
 *   - the workflow decides whether doing it reaches the public site
 * Every consumer — the sidebar, the page guard, the CRUD pages, bulk
 * actions, global search and the Super Admin's permission editor — reads
 * this file, and firestore.rules mirrors it exactly.
 *
 * ==========================================================================
 * THE MATRIX
 * ==========================================================================
 * A profile's permissions are stored per section, per action:
 *
 *   permissions: {
 *     subjects: { view: true, create: true, edit: true, delete: false, publish: false },
 *     majors:   { view: true }
 *   }
 *
 * An absent section, an absent action, or anything other than boolean true
 * means NO. There is no implicit inheritance between actions other than
 * the one rule below, which exists because the alternatives are worse:
 *
 *   ANY action implies `view`.
 *
 * Granting "edit" without "view" would produce an admin who may write to a
 * record they cannot load — they'd be editing blind, and every page would
 * need a special case for it. So `view` is derived, not stored.
 *
 * LEGACY SHAPE: Phase 5 stored `permissions: { subjects: true }`. That is
 * still understood and means "all five actions", so no existing admin
 * loses access on upgrade. normalizePermissions() converts it.
 *
 * ==========================================================================
 * OWNERSHIP
 * ==========================================================================
 *   ownership: {
 *     enabled: true,
 *     majors: ["majorIdA", "majorIdB"]
 *   }
 *
 * When enabled, an admin may only touch records that resolve to one of
 * their owned majors. Ownership is keyed by SCOPE TYPE ("majors" today) so
 * a second scope — departments, tree branches — is an entry in
 * OWNERSHIP_SCOPES plus a resolver, not a redesign.
 *
 * `enabled: false` (the default) means the admin is unrestricted within
 * whatever the matrix already allows. Ownership NARROWS permissions; it
 * never grants anything.
 * ------------------------------------------------------------------------
 */

export const ROLES = {
  SUPER_ADMIN: "superadmin",
  ADMIN: "admin",
  USER: "user",
};

export const STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  DISABLED: "disabled",
  REJECTED: "rejected",
};

/* ==========================================================================
   ACTIONS
   ========================================================================== */

export const ACTIONS = {
  VIEW: "view",
  CREATE: "create",
  EDIT: "edit",
  DELETE: "delete",
  PUBLISH: "publish",
};

export const ACTION_LIST = [
  { key: "view", labelKey: "action_view", descKey: "action_view_desc" },
  { key: "create", labelKey: "action_create", descKey: "action_create_desc" },
  { key: "edit", labelKey: "action_edit", descKey: "action_edit_desc" },
  { key: "delete", labelKey: "action_delete", descKey: "action_delete_desc" },
  { key: "publish", labelKey: "action_publish", descKey: "action_publish_desc" },
];

export const ACTION_KEYS = ACTION_LIST.map((a) => a.key);

/* ==========================================================================
   WORKFLOW
   ==========================================================================
   Content moves: draft -> pending -> approved -> published, with rejected
   and unpublished as the off-ramps.

   CRITICAL INVARIANT — `active` mirrors `published`.
   The public site and its Firestore queries have always filtered on
   `active == true`. Rather than rewrite every public query (and break the
   rules' list evaluation for any document in a non-published state), the
   workflow keeps `active` in lockstep: a record is active if and only if
   its workflow state is "published". Existing public pages therefore keep
   working untouched and can never render a draft, and the security rules
   still re-check the state independently.
   ========================================================================== */

export const WORKFLOW = {
  DRAFT: "draft",
  PENDING: "pending",
  APPROVED: "approved",
  PUBLISHED: "published",
  REJECTED: "rejected",
  UNPUBLISHED: "unpublished",
};

export const WORKFLOW_STATES = [
  { key: "draft", labelKey: "wf_draft", badge: "badge--inactive", public: false },
  { key: "pending", labelKey: "wf_pending", badge: "badge--pending", public: false },
  { key: "approved", labelKey: "wf_approved", badge: "badge--admin", public: false },
  { key: "published", labelKey: "wf_published", badge: "badge--active", public: true },
  { key: "rejected", labelKey: "wf_rejected", badge: "badge--danger", public: false },
  { key: "unpublished", labelKey: "wf_unpublished", badge: "badge--inactive", public: false },
];

export const WORKFLOW_KEYS = WORKFLOW_STATES.map((s) => s.key);

/** Is this state visible to the public? Only "published" ever is. */
export function isPublicState(state) {
  return state === WORKFLOW.PUBLISHED;
}

export function getWorkflowState(key) {
  return WORKFLOW_STATES.find((s) => s.key === key) || WORKFLOW_STATES[0];
}

/**
 * Read a record's workflow state, tolerating documents written before the
 * workflow existed. Those have no `status` field, so their `active` flag is
 * the only signal of intent — and it's an accurate one.
 */
export function stateOf(record) {
  if (record && typeof record.status === "string" && WORKFLOW_KEYS.includes(record.status)) {
    return record.status;
  }
  return record && record.active === true ? WORKFLOW.PUBLISHED : WORKFLOW.DRAFT;
}

/**
 * The field patch that puts a record into a state, maintaining the
 * active/published invariant. Every write path uses this rather than
 * setting `status` or `active` by hand, so the two cannot drift apart.
 */
export function workflowPatch(state) {
  return { status: state, active: isPublicState(state) };
}

/* ==========================================================================
   SECTIONS
   ==========================================================================
   Each section:
     key       — stored in permissions{}, checked by can(section, action)
                 in firestore.rules
     collection— the Firestore collection it governs (null for composite
                 screens that own no single collection)
     page      — the admin page it unlocks (null = capability, not a screen)
     actions   — which of the five actions are meaningful here. A settings
                 document cannot be "created" or "deleted" by an admin, so
                 offering those toggles would be lying about what they do.
     workflow  — true when its records carry draft/publish state
     ownership — the ownership scope its records resolve to, or null when
                 the section is global and ownership can't apply
   ========================================================================== */

/**
 * `icon` is a NAME from js/icons.js, not a character. It used to hold a
 * Unicode glyph ("\u25a6", "\u2699"), which meant the sidebar's look depended on
 * which fonts the admin's machine happened to have — several of them fell
 * back to an empty box on Windows. The name is resolved to an inline SVG
 * at render time by js/admin/admin-nav.js and js/admin/search-admin.js.
 */
export const PERMISSIONS = [
  // --- Overview ----------------------------------------------------------
  {
    // The dashboard is a resource like any other, because "which admins may
    // see the platform-wide overview" is a real question with a real answer.
    // It owns no collection: every number on it is a count of data the
    // viewer is separately permitted to read, and each card is hidden when
    // they aren't (see filterStatCards in js/admin/dashboard.js).
    //
    // An admin without it is not locked out of the panel — they land on the
    // first section they DO hold (landingPage below). Denying someone the
    // overview must not deny them the work.
    key: "dashboard",
    collection: null,
    page: "index.html",
    icon: "grid",
    group: "overview",
    labelKey: "perm_dashboard",
    actions: ["view"],
    workflow: false,
    ownership: null,
  },

  // --- Academic data -----------------------------------------------------
  {
    key: "majors",
    collection: "majors",
    page: "majors.html",
    icon: "layers",
    group: "academic",
    labelKey: "perm_majors",
    actions: ["view", "create", "edit", "delete", "publish"],
    workflow: true,
    ownership: "majors",
  },
  {
    key: "specializations",
    collection: "specializations",
    page: "specializations.html",
    icon: "git-branch",
    group: "academic",
    labelKey: "perm_specializations",
    actions: ["view", "create", "edit", "delete", "publish"],
    workflow: true,
    ownership: "majors",
  },
  {
    key: "academicYears",
    collection: "academicYears",
    page: "academic-years.html",
    icon: "calendar",
    group: "academic",
    labelKey: "perm_academicYears",
    actions: ["view", "create", "edit", "delete", "publish"],
    workflow: true,
    ownership: "majors",
  },
  {
    key: "semesters",
    collection: "semesters",
    page: "semesters.html",
    icon: "clock",
    group: "academic",
    labelKey: "perm_semesters",
    actions: ["view", "create", "edit", "delete", "publish"],
    workflow: true,
    ownership: "majors",
  },
  {
    key: "subjects",
    collection: "subjects",
    page: "subjects.html",
    icon: "book",
    group: "academic",
    labelKey: "perm_subjects",
    actions: ["view", "create", "edit", "delete", "publish"],
    workflow: true,
    ownership: "majors",
  },
  {
    key: "requirements",
    collection: "requirements",
    page: "requirements.html",
    icon: "sparkles",
    group: "academic",
    labelKey: "perm_requirements",
    actions: ["view", "create", "edit", "delete", "publish"],
    workflow: true,
    ownership: null, // requirements are university-wide, not per-major
  },
  {
    key: "prerequisites",
    collection: "prerequisites",
    page: "prerequisites.html",
    icon: "swap",
    group: "academic",
    labelKey: "perm_prerequisites",
    actions: ["view", "create", "edit", "delete", "publish"],
    workflow: true,
    ownership: "majors",
  },
  {
    key: "tree",
    collection: "treeNodes",
    page: "tree.html",
    icon: "sitemap",
    group: "academic",
    labelKey: "perm_tree",
    actions: ["view", "create", "edit", "delete", "publish"],
    workflow: true,
    ownership: null,
  },
  {
    // The curriculum IMAGE, as distinct from the structural tree above.
    // It owns no collection of its own: a curriculum image is a field on
    // the major (or specialization) it belongs to, which is why it can be
    // delegated separately without duplicating those records. The rules
    // grant this section a narrow write — the curriculum fields only —
    // on majors and specializations.
    key: "curriculum",
    collection: null,
    page: "curriculum.html",
    icon: "image",
    group: "academic",
    labelKey: "perm_curriculum",
    actions: ["view", "edit"],
    workflow: false,
    ownership: "majors",
  },

  // --- Website -----------------------------------------------------------
  {
    key: "content",
    collection: "siteContent",
    page: "content.html",
    icon: "pencil",
    group: "website",
    labelKey: "perm_content",
    actions: ["view", "edit", "publish"],
    workflow: false,
    ownership: null,
  },
  {
    key: "homepage",
    collection: "siteContent",
    page: "homepage.html",
    icon: "home",
    group: "website",
    labelKey: "perm_homepage",
    actions: ["view", "edit", "publish"],
    workflow: false,
    ownership: null,
  },
  {
    key: "navigation",
    collection: "siteConfig",
    page: "navigation.html",
    icon: "link",
    group: "website",
    labelKey: "perm_navigation",
    // Navigation links reach every page, so publishing them is gated
    // separately from editing the draft — see the draft/published model
    // in js/cms-schema.js.
    actions: ["view", "edit", "publish"],
    workflow: false,
    ownership: null,
  },
  {
    key: "appearance",
    collection: "settings",
    page: "appearance.html",
    icon: "palette",
    group: "website",
    labelKey: "perm_appearance",
    actions: ["view", "edit", "publish"],
    workflow: false,
    ownership: null,
  },
  {
    key: "settings",
    collection: "settings",
    page: "settings.html",
    icon: "settings",
    group: "website",
    labelKey: "perm_settings",
    // `publish` is what makes a settings draft take effect on the public
    // site. Editing is safe to delegate widely; flipping maintenance mode
    // or the default language for every visitor is not.
    actions: ["view", "edit", "publish"],
    workflow: false,
    ownership: null,
  },

  // --- Governance --------------------------------------------------------
  {
    key: "workflow",
    collection: null,
    page: "workflow.html",
    icon: "sort-vertical",
    group: "governance",
    labelKey: "perm_workflow",
    // "publish" here is the reviewer's approve/reject capability: it lets
    // someone act on OTHER admins' submissions, which is distinct from
    // publishing their own work in a section they own.
    actions: ["view", "publish"],
    workflow: false,
    ownership: null,
  },
  {
    key: "users",
    collection: "users",
    page: "users.html",
    icon: "users",
    group: "governance",
    labelKey: "perm_users",
    actions: ["view", "edit"],
    workflow: false,
    ownership: null,
  },
  {
    // Not a separate screen. The permission-matrix editor already lives on
    // the Users page, and building a second one would mean two places that
    // must agree about what a grant means. This entry gives the sidebar
    // the "Permissions" link the panel structure calls for, pointed at
    // that editor — `navHref` renders the link, `page` stays null so the
    // guard never treats it as a page of its own.
    key: "permissions",
    collection: "users",
    page: null,
    navHref: "users.html?view=permissions",
    navFor: "users.html",
    icon: "key",
    group: "governance",
    labelKey: "perm_permissions",
    actions: ["view", "edit"],
    workflow: false,
    ownership: null,
    superAdminOnly: true,
  },
  {
    key: "admins",
    collection: "users",
    page: null,
    icon: "star",
    group: "governance",
    labelKey: "perm_admins",
    actions: ["view", "create", "edit", "delete"],
    workflow: false,
    ownership: null,
    superAdminOnly: true,
  },
  {
    key: "audit",
    collection: "auditLogs",
    page: "audit.html",
    icon: "target",
    group: "governance",
    labelKey: "perm_audit",
    actions: ["view", "delete"],
    workflow: false,
    ownership: null,
  },
  {
    key: "versions",
    collection: "versions",
    page: "history.html",
    icon: "history",
    group: "governance",
    labelKey: "perm_versions",
    // "edit" is the restore capability: putting an old snapshot back is a
    // write to live content, so it is gated separately from merely reading
    // the history.
    actions: ["view", "edit"],
    workflow: false,
    ownership: null,
  },
  {
    key: "search",
    collection: null,
    page: "search.html",
    icon: "search",
    group: "governance",
    labelKey: "perm_search",
    actions: ["view"],
    workflow: false,
    ownership: null,
  },
  {
    key: "backup",
    collection: null,
    page: "backup.html",
    icon: "archive",
    group: "governance",
    labelKey: "perm_backup",
    actions: ["view", "create", "edit"],
    workflow: false,
    ownership: null,
    superAdminOnly: true,
  },
];

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);
export const GRANTABLE_PERMISSIONS = PERMISSIONS.filter((p) => !p.superAdminOnly);

export const PERMISSION_GROUPS = [
  { key: "overview", labelKey: "perm_group_overview" },
  { key: "academic", labelKey: "perm_group_academic" },
  { key: "website", labelKey: "perm_group_website" },
  { key: "governance", labelKey: "perm_group_governance" },
];

export function getPermission(key) {
  return PERMISSIONS.find((p) => p.key === key) || null;
}

/** The section that governs a Firestore collection, or null. */
export function sectionForCollection(collection) {
  return PERMISSIONS.find((p) => p.collection === collection) || null;
}

/** Sections whose records carry workflow state. */
export const WORKFLOW_SECTIONS = PERMISSIONS.filter((p) => p.workflow);

/* ==========================================================================
   OWNERSHIP SCOPES
   ========================================================================== */

export const OWNERSHIP_SCOPES = [
  {
    key: "majors",
    labelKey: "ownership_scope_majors",
    collection: "majors",
    /**
     * Resolve which owned id a record belongs to.
     * A major owns itself; everything else points at one by majorId. For
     * prerequisites the majorId isn't on the document, so the caller
     * supplies it via the `resolveContext` hook (see ownsRecord).
     */
    resolve: (record, section) => {
      if (!record) return null;
      if (section === "majors") return record.id || null;
      return record.majorId || null;
    },
  },
];

export function getOwnershipScope(key) {
  return OWNERSHIP_SCOPES.find((s) => s.key === key) || null;
}

/* ==========================================================================
   ROLE PREDICATES
   ========================================================================== */

export function isSuperAdmin(profile) {
  return !!profile && profile.role === ROLES.SUPER_ADMIN && profile.status === STATUS.ACTIVE;
}

export function isAdminRole(profile) {
  return (
    !!profile &&
    (profile.role === ROLES.ADMIN || profile.role === ROLES.SUPER_ADMIN) &&
    profile.status === STATUS.ACTIVE
  );
}

/* ==========================================================================
   MATRIX EVALUATION
   ========================================================================== */

/**
 * Normalize a stored permissions object into the matrix shape, accepting
 * both the Phase 5 boolean form and the Phase 6 per-action form.
 * Returns { section: { view, create, edit, delete, publish } }.
 */
export function normalizePermissions(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;

  // `dashboard` became a grantable section in Phase 8. Admin records
  // written before that have no entry for it, and reading its absence as a
  // denial would quietly take the overview away from every existing admin
  // on upgrade. A legacy-shaped map (any bare `true`) therefore still
  // implies it; an explicit per-action matrix does not, because that matrix
  // was written by a Super Admin who saw the dashboard checkbox and left it
  // unticked. Absence means "old data" in one case and "no" in the other.
  let sawLegacyShape = false;

  for (const section of PERMISSIONS) {
    const value = raw[section.key];
    if (value === undefined || value === null) continue;

    const grants = {};
    if (value === true) {
      // Legacy Phase 5: a bare `true` meant full access to the section.
      sawLegacyShape = true;
      section.actions.forEach((a) => {
        grants[a] = true;
      });
    } else if (typeof value === "object") {
      section.actions.forEach((a) => {
        if (value[a] === true) grants[a] = true;
      });
      // Any granted action implies the ability to see the records.
      if (Object.keys(grants).length) grants.view = true;
    }
    if (Object.keys(grants).length) out[section.key] = grants;
  }

  if (sawLegacyShape && !out.dashboard) out.dashboard = { view: true };
  return out;
}

/**
 * THE core check: may this profile perform `action` on `section`?
 *
 * Super Admins pass everything, including sections and actions that don't
 * exist yet — which is what keeps the system extensible without migrating
 * their stored data.
 */
export function can(profile, section, action = ACTIONS.VIEW) {
  if (!isAdminRole(profile)) return false;
  if (isSuperAdmin(profile)) return true;

  const def = getPermission(section);
  if (def && def.superAdminOnly) return false;
  if (def && !def.actions.includes(action)) return false;

  const matrix = profile.permissionMatrix || normalizePermissions(profile.permissions);
  const grants = matrix[section];
  if (!grants) return false;
  if (grants[action] === true) return true;
  // view is implied by holding any other action on the section
  if (action === ACTIONS.VIEW) return Object.values(grants).some(Boolean);
  return false;
}

/** Back-compat alias — older call sites ask only "can they open this?". */
export function hasPermission(profile, section, action = ACTIONS.VIEW) {
  return can(profile, section, action);
}

/** Every action this profile holds on a section. */
export function actionsFor(profile, section) {
  const def = getPermission(section);
  if (!def) return [];
  return def.actions.filter((a) => can(profile, section, a));
}

export function hasAnyPermission(profile) {
  if (isSuperAdmin(profile)) return true;
  return PERMISSIONS.some((p) => can(profile, p.key, ACTIONS.VIEW));
}

export function allowedPermissions(profile) {
  return PERMISSIONS.filter((p) => can(profile, p.key, ACTIONS.VIEW));
}

/**
 * Where to send this admin after sign-in, or when they're bounced off a
 * page they can't open.
 *
 * Now that `dashboard` is a revocable permission, index.html is no longer
 * guaranteed to be reachable. Sending someone there anyway would greet
 * them with a 403 on every login — technically correct and completely
 * useless. Falls back to the first section they actually hold.
 */
export function landingPage(profile) {
  if (can(profile, "dashboard", ACTIONS.VIEW)) return "index.html";
  const first = allowedPermissions(profile).find((p) => p.page);
  return first ? first.page : "index.html";
}

/**
 * Normalize a matrix for writing: known sections, known actions, boolean
 * true only, Super-Admin-only sections stripped. Prevents a hand-crafted
 * payload from smuggling in an unknown key or granting `admins`.
 */
export function sanitizePermissions(raw) {
  const clean = {};
  const normalized = normalizePermissions(raw);
  for (const section of GRANTABLE_PERMISSIONS) {
    const grants = normalized[section.key];
    if (!grants) continue;
    const kept = {};
    section.actions.forEach((a) => {
      if (grants[a] === true) kept[a] = true;
    });
    if (Object.keys(kept).length) {
      kept.view = true;
      clean[section.key] = kept;
    }
  }
  return clean;
}

/** Count of granted (section, action) pairs — for compact UI summaries. */
export function countPermissions(profile) {
  if (isSuperAdmin(profile)) {
    return GRANTABLE_PERMISSIONS.reduce((n, p) => n + p.actions.length, 0);
  }
  const matrix = profile?.permissionMatrix || normalizePermissions(profile?.permissions);
  return Object.values(matrix).reduce((n, g) => n + Object.values(g).filter(Boolean).length, 0);
}

/* ==========================================================================
   OWNERSHIP EVALUATION
   ========================================================================== */

export function normalizeOwnership(raw) {
  const out = { enabled: raw?.enabled === true };
  OWNERSHIP_SCOPES.forEach((scope) => {
    const list = raw ? raw[scope.key] : null;
    out[scope.key] = Array.isArray(list) ? list.filter((v) => typeof v === "string") : [];
  });
  return out;
}

/** Is this profile restricted to a subset of records? */
export function ownershipEnabled(profile) {
  if (isSuperAdmin(profile)) return false;
  return profile?.ownership?.enabled === true;
}

/** The ids this profile owns within a scope. */
export function ownedIds(profile, scopeKey = "majors") {
  if (!profile?.ownership) return [];
  const list = profile.ownership[scopeKey];
  return Array.isArray(list) ? list : [];
}

/**
 * May this profile act on this specific record?
 *
 * Ownership only narrows: a section with no ownership scope (requirements,
 * settings, the tree) is unaffected, and an admin with ownership disabled
 * passes everything the matrix already allowed.
 *
 * `context` lets a caller supply the owning id when the record itself
 * doesn't carry one — a prerequisite links two subjects and stores no
 * majorId, so the page resolves it from the subject and passes it here.
 */
export function ownsRecord(profile, section, record, context = {}) {
  if (!ownershipEnabled(profile)) return true;

  const def = getPermission(section);
  if (!def || !def.ownership) return true; // section isn't ownership-scoped

  const scope = getOwnershipScope(def.ownership);
  if (!scope) return true;

  const owned = ownedIds(profile, scope.key);
  if (!owned.length) return false; // restricted, but assigned nothing

  const target = context[scope.key] ?? scope.resolve(record, section);
  if (!target) return false; // can't prove it's theirs -> deny (fail closed)
  return owned.includes(target);
}

/**
 * Full authorization for one operation on one record.
 * This is the check every CRUD page, bulk action and search result runs.
 */
export function canActOn(profile, section, action, record, context = {}) {
  if (!can(profile, section, action)) return false;
  if (!record) return true; // e.g. "create" has no record yet
  return ownsRecord(profile, section, record, context);
}

/**
 * Filter a list down to the records this profile may view. Used by every
 * table and by global search, so an unauthorized record is never rendered
 * in the first place.
 */
export function filterOwned(profile, section, records, contextFor = null) {
  if (!ownershipEnabled(profile)) return records;
  return records.filter((r) =>
    ownsRecord(profile, section, r, contextFor ? contextFor(r) : {})
  );
}
