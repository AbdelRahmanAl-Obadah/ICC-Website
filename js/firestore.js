/** Shared Firestore repository. All public and admin data access goes here. */
import { db } from './firebase-init.js';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
const ready = () => { if (!db) throw new Error('Firebase is not configured. Add your web configuration first.'); };
const clean = value => Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
const list = async (path, constraints = []) => { ready(); const snapshot = await getDocs(query(collection(db, path), ...constraints)); return snapshot.docs.map(item => ({ id: item.id, ...item.data() })); };
const create = async (path, data) => (ready(), (await addDoc(collection(db, path), clean({ ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }))).id);
const update = async (path, id, data) => (ready(), updateDoc(doc(db, path, id), clean({ ...data, updatedAt: serverTimestamp() })));
const remove = async (path, id) => (ready(), deleteDoc(doc(db, path, id)));
const ordered = [orderBy('displayOrder', 'asc')], activeOrdered = [where('active', '==', true), orderBy('displayOrder', 'asc')];
export const getMajors = (all = true) => list('majors', all ? ordered : activeOrdered);
export const fetchAllMajors = () => getMajors(false);
export async function fetchMajorById(id) { ready(); const item = await getDoc(doc(db, 'majors', id)); return item.exists() && item.data().active === true ? { id: item.id, ...item.data() } : null; }
export const createMajor = data => create('majors', data); export const updateMajor = (id, data) => update('majors', id, data); export const deleteMajor = id => remove('majors', id);
export const getSemesters = (majorId, all = true) => list('semesters', majorId ? [where('majorId', '==', majorId), ...(all ? ordered : activeOrdered)] : (all ? ordered : activeOrdered));
export const fetchSemestersForMajor = id => getSemesters(id, false);
export const createSemester = data => create('semesters', data); export const updateSemester = (id, data) => update('semesters', id, data); export const deleteSemester = id => remove('semesters', id);
export const getSubjects = (filters = {}, all = true) => { const q = []; if (filters.majorId) q.push(where('majorId', '==', filters.majorId)); if (filters.semesterId) q.push(where('semesterId', '==', filters.semesterId)); if (!all) q.push(where('active', '==', true)); q.push(orderBy('displayOrder', 'asc')); return list('subjects', q); };
export const fetchSubjectsForMajor = id => getSubjects({ majorId: id }, false); export const fetchSubjectsForSemester = id => getSubjects({ semesterId: id }, false);
export const createSubject = data => create('subjects', data); export const updateSubject = (id, data) => update('subjects', id, data); export const deleteSubject = id => remove('subjects', id);
export const getRequirements = (category, all = true) => list('requirements', category ? [where('category', '==', category), ...(all ? ordered : activeOrdered)] : (all ? ordered : activeOrdered));
export const fetchRequirements = () => getRequirements(null, false); export const createRequirement = data => create('requirements', data); export const updateRequirement = (id, data) => update('requirements', id, data); export const deleteRequirement = id => remove('requirements', id);
async function singleton(path, id) { ready(); const item = await getDoc(doc(db, path, id)); return item.exists() ? item.data() : {}; }
async function saveSingleton(path, id, data) { ready(); await setDoc(doc(db, path, id), clean({ ...data, updatedAt: serverTimestamp() }), { merge: true }); }
export const getSiteContent = () => singleton('siteContent', 'public'); export const updateSiteContent = data => saveSingleton('siteContent', 'public', data);
export const getSettings = () => singleton('settings', 'public'); export const updateSettings = data => saveSingleton('settings', 'public', data);
export const getAdminUsers = () => list('admins', [orderBy('displayName', 'asc')]);
export async function createAdminUser(uid, data) { ready(); if (!uid) throw new Error('Firebase Authentication UID is required.'); await setDoc(doc(db, 'admins', uid), clean({ ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })); return uid; }
export const updateAdminUser = (id, data) => update('admins', id, data);
export const deleteAdminUser = id => remove('admins', id);
