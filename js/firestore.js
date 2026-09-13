/** Shared Firestore repository. All public and admin data access goes here. */
import { db } from './firebase-init.js';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit as fsLimit, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const ready = () => { if (!db) throw new Error('Firebase is not configured. Add your web configuration first.'); };
const clean = value => Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));

/* ------------------------------------------------------------------ */
/*  Audit trail                                                        */
/*  Every create/update/delete that goes through this module is        */
/*  logged automatically to /auditLogs so admins can see exactly who   */
/*  changed what, and when. Call setAuditActor() once, right after an  */
/*  admin profile is loaded (admin-guard.js does this).                */
/* ------------------------------------------------------------------ */
let auditActor = null;
export function setAuditActor(actor) { auditActor = actor ? { uid: actor.uid, email: actor.email, displayName: actor.displayName || actor.email } : null; }

async function logAudit(action, path, id, before, after, label) {
  if (!db) return;
  try {
    await addDoc(collection(db, 'auditLogs'), clean({
      actorUid: auditActor?.uid || null,
      actorEmail: auditActor?.email || 'unknown',
      actorName: auditActor?.displayName || auditActor?.email || 'Unknown user',
      action,               // 'create' | 'update' | 'delete'
      collection: path,
      docId: id || null,
      label: label || id || path,
      before: before ? clean(before) : null,
      after: after ? clean(after) : null,
      createdAt: serverTimestamp(),
    }));
  } catch (error) {
    // Never let a logging failure block the actual write the admin cares about.
    console.warn('[ICC] Could not write audit log entry.', error);
  }
}

export async function getAuditLogs(max = 200) {
  ready();
  const snapshot = await getDocs(query(collection(db, 'auditLogs'), orderBy('createdAt', 'desc'), fsLimit(max)));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}

/* ------------------------------------------------------------------ */
/*  Generic CRUD helpers (all logged)                                  */
/* ------------------------------------------------------------------ */
const list = async (path, constraints = []) => { ready(); const snapshot = await getDocs(query(collection(db, path), ...constraints)); return snapshot.docs.map(item => ({ id: item.id, ...item.data() })); };

const create = async (path, data, label) => {
  ready();
  const ref = await addDoc(collection(db, path), clean({ ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  await logAudit('create', path, ref.id, null, data, label);
  return ref.id;
};
const update = async (path, id, data, label) => {
  ready();
  let before = null;
  try { const snap = await getDoc(doc(db, path, id)); before = snap.exists() ? snap.data() : null; } catch { /* ignore */ }
  await updateDoc(doc(db, path, id), clean({ ...data, updatedAt: serverTimestamp() }));
  await logAudit('update', path, id, before, data, label);
};
const remove = async (path, id, label) => {
  ready();
  let before = null;
  try { const snap = await getDoc(doc(db, path, id)); before = snap.exists() ? snap.data() : null; } catch { /* ignore */ }
  await deleteDoc(doc(db, path, id));
  await logAudit('delete', path, id, before, null, label);
};

const ordered = [orderBy('displayOrder', 'asc')], activeOrdered = [where('active', '==', true), orderBy('displayOrder', 'asc')];

/* ------------------------------------------------------------------ */
/*  Majors / Semesters / Subjects / Requirements                       */
/* ------------------------------------------------------------------ */
export const getMajors = (all = true) => list('majors', all ? ordered : activeOrdered);
export const fetchAllMajors = () => getMajors(false);
export async function fetchMajorById(id) { ready(); const item = await getDoc(doc(db, 'majors', id)); return item.exists() && item.data().active === true ? { id: item.id, ...item.data() } : null; }
export const createMajor = data => create('majors', data, data.nameEn || data.code); export const updateMajor = (id, data) => update('majors', id, data, data.nameEn || data.code); export const deleteMajor = id => remove('majors', id);

export const getSemesters = (majorId, all = true) => list('semesters', majorId ? [where('majorId', '==', majorId), ...(all ? ordered : activeOrdered)] : (all ? ordered : activeOrdered));
export const fetchSemestersForMajor = id => getSemesters(id, false);
export const createSemester = data => create('semesters', data); export const updateSemester = (id, data) => update('semesters', id, data); export const deleteSemester = id => remove('semesters', id);

export const getSubjects = (filters = {}, all = true) => { const q = []; if (filters.majorId) q.push(where('majorId', '==', filters.majorId)); if (filters.semesterId) q.push(where('semesterId', '==', filters.semesterId)); if (!all) q.push(where('active', '==', true)); q.push(orderBy('displayOrder', 'asc')); return list('subjects', q); };
export const fetchSubjectsForMajor = id => getSubjects({ majorId: id }, false); export const fetchSubjectsForSemester = id => getSubjects({ semesterId: id }, false);
export const createSubject = data => create('subjects', data, data.nameEn || data.code); export const updateSubject = (id, data) => update('subjects', id, data, data.nameEn || data.code); export const deleteSubject = id => remove('subjects', id);

export const getRequirements = (category, all = true) => list('requirements', category ? [where('category', '==', category), ...(all ? ordered : activeOrdered)] : (all ? ordered : activeOrdered));
export const fetchRequirements = () => getRequirements(null, false);
export const createRequirement = data => create('requirements', data, data.nameEn || data.code); export const updateRequirement = (id, data) => update('requirements', id, data, data.nameEn || data.code); export const deleteRequirement = id => remove('requirements', id);

/* ------------------------------------------------------------------ */
/*  Curriculum tree / uploaded curriculum image or PDF (per major)     */
/*  Two modes, chosen per major:                                       */
/*   - "tree": nodes built by hand in the admin (JSON tree)             */
/*   - "file": an uploaded image or PDF replaces the tree entirely      */
/* ------------------------------------------------------------------ */
export async function getCurriculumTree(majorId) { ready(); const item = await getDoc(doc(db, 'curriculumTrees', majorId)); return item.exists() ? item.data() : { mode: 'tree', nodes: [] }; }
export async function saveCurriculumTree(majorId, data, label) {
  ready();
  let before = null;
  try { const snap = await getDoc(doc(db, 'curriculumTrees', majorId)); before = snap.exists() ? snap.data() : null; } catch { /* ignore */ }
  await setDoc(doc(db, 'curriculumTrees', majorId), clean({ ...data, updatedAt: serverTimestamp() }), { merge: false });
  await logAudit('update', 'curriculumTrees', majorId, before, data, label);
}

/* ------------------------------------------------------------------ */
/*  Site content: hero / about / nav / footer — everything that used   */
/*  to be hardcoded in index.html now lives here so the admin can edit  */
/*  the nav menu and footer, not just the hero and about copy.          */
/* ------------------------------------------------------------------ */
async function singleton(path, id) { ready(); const item = await getDoc(doc(db, path, id)); return item.exists() ? item.data() : {}; }
async function saveSingleton(path, id, data, label) {
  ready();
  let before = null;
  try { const snap = await getDoc(doc(db, path, id)); before = snap.exists() ? snap.data() : null; } catch { /* ignore */ }
  await setDoc(doc(db, path, id), clean({ ...data, updatedAt: serverTimestamp() }), { merge: true });
  await logAudit('update', path, id, before, data, label);
}
export const getSiteContent = () => singleton('siteContent', 'public');
export const updateSiteContent = data => saveSingleton('siteContent', 'public', data, 'Website content');
export const getSettings = () => singleton('settings', 'public');
export const updateSettings = data => saveSingleton('settings', 'public', data, 'Site settings');

/* Nav menu + footer are stored as arrays under siteContent/public so the
   whole chrome of the site — from the nav bar to the footer — is admin
   editable, not just the homepage copy. */
export const getNavLinks = async () => (await getDoc(doc(db, 'siteContent', 'public'))).data()?.navLinks || [];
export const saveNavLinks = (navLinks) => saveSingleton('siteContent', 'public', { navLinks }, 'Navigation menu');
export const saveFooterLinks = (footerColumns) => saveSingleton('siteContent', 'public', { footerColumns }, 'Footer');

/* ------------------------------------------------------------------ */
/*  Admin / team accounts, permissions & pending sign-up requests       */
/* ------------------------------------------------------------------ */
export const getAdminUsers = () => list('admins', [orderBy('displayName', 'asc')]);
export const getPendingAdmins = () => list('admins', [where('role', '==', 'pending')]);
export async function createAdminUser(uid, data) { ready(); if (!uid) throw new Error('Firebase Authentication UID is required.'); await setDoc(doc(db, 'admins', uid), clean({ ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })); await logAudit('create', 'admins', uid, null, data, data.displayName || data.email); return uid; }
export const updateAdminUser = (id, data) => update('admins', id, data, data.displayName || data.email);
export const deleteAdminUser = id => remove('admins', id);

/** Approve a pending sign-up: assign a role + fine-grained permissions. */
export const approveAdminUser = (id, data) => update('admins', id, { ...data, role: data.role || 'admin' }, 'Approved account');
/** Reject a pending sign-up. Their Firestore access profile is removed;
 *  the underlying Firebase Authentication account itself can only be
 *  deleted from the Firebase Console or via a Cloud Function, since a
 *  client app cannot delete another user's auth account. */
export const rejectAdminUser = id => remove('admins', id, 'Rejected sign-up request');
