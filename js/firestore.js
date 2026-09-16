/**
 * firestore.js
 * -----------------------------------------------------------------------
 * Firestore data-access layer — PHASE 3A (real implementation).
 *
 * Every function below performs a real read (or write, for future Admin
 * Panel use) against Cloud Firestore using the Firebase modular Web SDK.
 * There is no demo/mock data anywhere in this file — if Firestore has no
 * documents, these functions simply resolve to an empty array/null and
 * the calling UI code is responsible for showing an empty state.
 *
 * Collections (all top-level, per the Phase 3A schema):
 *   majors/{majorId}
 *   semesters/{semesterId}        (has a `majorId` field)
 *   subjects/{subjectId}          (has `majorId` + `semesterId` fields)
 *   requirements/{requirementId}  (has a `category` field)
 *   siteContent/{contentId}
 *   settings/{settingId}
 *
 * All public pages in this phase only need the getX() read helpers.
 * createX()/updateX()/deleteX() are implemented now so the Phase 3B Admin
 * Panel can call straight into this module without changing its shape,
 * but nothing in the public site calls them yet.
 * ------------------------------------------------------------------------
 */

import { db } from "./firebase-init.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit as fsLimit,
  startAfter,
  writeBatch,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * Thrown by every read/write helper when Firestore isn't configured yet
 * (firebase-config.js still has placeholder values). Kept as a distinct
 * class so calling UI code can tell "not configured" apart from a real
 * network/permission error and show the right empty/error state.
 */
export class FirestoreNotConfiguredError extends Error {
  constructor(fnName) {
    super(
      `${fnName}() could not run: Firebase is not configured yet. ` +
        "Add your real project config to js/firebase-config.js."
    );
    this.name = "FirestoreNotConfiguredError";
  }
}

function requireDb(fnName) {
  if (!db) throw new FirestoreNotConfiguredError(fnName);
  return db;
}

function snapshotToArray(snapshot) {
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

/* ==========================================================================
   MAJORS
   ========================================================================== */

/** Fetch every major document, sorted by displayOrder. */
export async function getMajors() {
  const dbRef = requireDb("getMajors");
  const q = query(collection(dbRef, "majors"), orderBy("displayOrder", "asc"));
  const snap = await getDocs(q);
  return snapshotToArray(snap);
}

/** Fetch only majors with active === true, sorted by displayOrder. */
export async function getActiveMajors() {
  const dbRef = requireDb("getActiveMajors");
  const q = query(
    collection(dbRef, "majors"),
    where("active", "==", true),
    orderBy("displayOrder", "asc")
  );
  const snap = await getDocs(q);
  return snapshotToArray(snap);
}

/** Fetch a single major by its document id. Returns null if it doesn't exist. */
export async function getMajorById(majorId) {
  const dbRef = requireDb("getMajorById");
  if (!majorId) return null;
  const snap = await getDoc(doc(dbRef, "majors", majorId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Create a new major document. Reserved for the Phase 3B Admin Panel. */
export async function createMajor(majorData) {
  const dbRef = requireDb("createMajor");
  const payload = {
    ...majorData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(dbRef, "majors"), payload);
  return ref.id;
}

/** Update an existing major document. Reserved for the Phase 3B Admin Panel. */
export async function updateMajor(majorId, majorData) {
  const dbRef = requireDb("updateMajor");
  await updateDoc(doc(dbRef, "majors", majorId), {
    ...majorData,
    updatedAt: serverTimestamp(),
  });
}

/** Delete a major document. Reserved for the Phase 3B Admin Panel. */
export async function deleteMajor(majorId) {
  const dbRef = requireDb("deleteMajor");
  await deleteDoc(doc(dbRef, "majors", majorId));
}

/* ==========================================================================
   PHASE 7 — SPECIALIZATIONS
   --------------------------------------------------------------------------
   specializations/{id} = {
     name: { ar, en }, code,
     description: { ar, en },
     majorId,                     // the parent major — always required
     active, displayOrder, createdAt, updatedAt
   }

   A specialization is an OPTIONAL level between a major and its academic
   years. A major with none behaves exactly as it always has: every query
   below treats "no specialization" as a first-class case rather than an
   error, and every consumer reads specializationId as "" / null meaning
   "applies to the whole major". That is what keeps majors created before
   this collection existed working untouched.
   ========================================================================== */

/** Fetch every specialization, sorted by displayOrder (admin view). */
export async function getAllSpecializations() {
  const dbRef = requireDb("getAllSpecializations");
  const q = query(collection(dbRef, "specializations"), orderBy("displayOrder", "asc"));
  const snap = await getDocs(q);
  return snapshotToArray(snap);
}

/** Fetch only active specializations — what the public site renders. */
export async function getActiveSpecializations() {
  const dbRef = requireDb("getActiveSpecializations");
  const q = query(
    collection(dbRef, "specializations"),
    where("active", "==", true),
    orderBy("displayOrder", "asc")
  );
  const snap = await getDocs(q);
  return snapshotToArray(snap);
}

/** ADMIN: every specialization belonging to a major, any active state. */
export async function getAllSpecializationsForMajor(majorId) {
  const dbRef = requireDb("getAllSpecializationsForMajor");
  if (!majorId) return [];
  const q = query(
    collection(dbRef, "specializations"),
    where("majorId", "==", majorId),
    orderBy("displayOrder", "asc")
  );
  const snap = await getDocs(q);
  return snapshotToArray(snap);
}

/** PUBLIC: active specializations belonging to a major. */
export async function getSpecializationsForMajor(majorId) {
  const dbRef = requireDb("getSpecializationsForMajor");
  if (!majorId) return [];
  const q = query(
    collection(dbRef, "specializations"),
    where("majorId", "==", majorId),
    where("active", "==", true),
    orderBy("displayOrder", "asc")
  );
  const snap = await getDocs(q);
  return snapshotToArray(snap);
}

export async function getSpecializationById(specializationId) {
  const dbRef = requireDb("getSpecializationById");
  if (!specializationId) return null;
  const snap = await getDoc(doc(dbRef, "specializations", specializationId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createSpecialization(data) {
  const dbRef = requireDb("createSpecialization");
  const ref = await addDoc(collection(dbRef, "specializations"), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateSpecialization(specializationId, data) {
  const dbRef = requireDb("updateSpecialization");
  await updateDoc(doc(dbRef, "specializations", specializationId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteSpecialization(specializationId) {
  const dbRef = requireDb("deleteSpecialization");
  await deleteDoc(doc(dbRef, "specializations", specializationId));
}

/* ==========================================================================
   PHASE 7 — ACADEMIC YEARS
   --------------------------------------------------------------------------
   academicYears/{id} = {
     name: { ar, en }, yearNumber,
     majorId,             // "" = a shared year template, not tied to a major
     specializationId,    // "" = applies to the whole major
     active, displayOrder, createdAt, updatedAt
   }

   Academic years were previously implied by the `yearNumber` field on a
   semester. They are now real documents so they can be named bilingually
   ("First Year" / "السنة الأولى"), reordered, and deactivated — while
   `semester.yearNumber` is still written alongside `academicYearId`, so
   every existing query and every semester created before this collection
   existed keeps resolving.
   ========================================================================== */

export async function getAllAcademicYears() {
  const dbRef = requireDb("getAllAcademicYears");
  const q = query(collection(dbRef, "academicYears"), orderBy("displayOrder", "asc"));
  const snap = await getDocs(q);
  return snapshotToArray(snap);
}

export async function getActiveAcademicYears() {
  const dbRef = requireDb("getActiveAcademicYears");
  const q = query(
    collection(dbRef, "academicYears"),
    where("active", "==", true),
    orderBy("displayOrder", "asc")
  );
  const snap = await getDocs(q);
  return snapshotToArray(snap);
}

/** ADMIN: academic years scoped to a major, any active state. */
export async function getAllAcademicYearsForMajor(majorId) {
  const dbRef = requireDb("getAllAcademicYearsForMajor");
  if (!majorId) return [];
  const q = query(
    collection(dbRef, "academicYears"),
    where("majorId", "==", majorId),
    orderBy("displayOrder", "asc")
  );
  const snap = await getDocs(q);
  return snapshotToArray(snap);
}

export async function getAcademicYearById(yearId) {
  const dbRef = requireDb("getAcademicYearById");
  if (!yearId) return null;
  const snap = await getDoc(doc(dbRef, "academicYears", yearId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createAcademicYear(data) {
  const dbRef = requireDb("createAcademicYear");
  const ref = await addDoc(collection(dbRef, "academicYears"), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateAcademicYear(yearId, data) {
  const dbRef = requireDb("updateAcademicYear");
  await updateDoc(doc(dbRef, "academicYears", yearId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteAcademicYear(yearId) {
  const dbRef = requireDb("deleteAcademicYear");
  await deleteDoc(doc(dbRef, "academicYears", yearId));
}

/* ==========================================================================
   SEMESTERS
   ========================================================================== */

/** Fetch every semester belonging to a major, sorted for display. */
export async function getSemestersForMajor(majorId) {
  const dbRef = requireDb("getSemestersForMajor");
  if (!majorId) return [];
  const q = query(
    collection(dbRef, "semesters"),
    where("majorId", "==", majorId),
    where("active", "==", true),
    orderBy("displayOrder", "asc")
  );
  const snap = await getDocs(q);
  return snapshotToArray(snap);
}

/** Fetch a single semester by its document id. Returns null if it doesn't exist. */
export async function getSemesterById(semesterId) {
  const dbRef = requireDb("getSemesterById");
  if (!semesterId) return null;
  const snap = await getDoc(doc(dbRef, "semesters", semesterId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** ADMIN: fetch every semester (any active state), sorted by displayOrder. */
export async function getAllSemesters() {
  const dbRef = requireDb("getAllSemesters");
  const q = query(collection(dbRef, "semesters"), orderBy("displayOrder", "asc"));
  const snap = await getDocs(q);
  return snapshotToArray(snap);
}

/** ADMIN: fetch every semester belonging to a major, regardless of active state. */
export async function getAllSemestersForMajor(majorId) {
  const dbRef = requireDb("getAllSemestersForMajor");
  if (!majorId) return [];
  const q = query(
    collection(dbRef, "semesters"),
    where("majorId", "==", majorId),
    orderBy("displayOrder", "asc")
  );
  const snap = await getDocs(q);
  return snapshotToArray(snap);
}

/** ADMIN: create a new semester document. */
export async function createSemester(semesterData) {
  const dbRef = requireDb("createSemester");
  const payload = { ...semesterData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
  const ref = await addDoc(collection(dbRef, "semesters"), payload);
  return ref.id;
}

/** ADMIN: update an existing semester document. */
export async function updateSemester(semesterId, semesterData) {
  const dbRef = requireDb("updateSemester");
  await updateDoc(doc(dbRef, "semesters", semesterId), { ...semesterData, updatedAt: serverTimestamp() });
}

/** ADMIN: delete a semester document. */
export async function deleteSemester(semesterId) {
  const dbRef = requireDb("deleteSemester");
  await deleteDoc(doc(dbRef, "semesters", semesterId));
}

/* ==========================================================================
   SUBJECTS
   ========================================================================== */

/**
 * PHASE 4A: fetch every active subject across every major (no majorId
 * filter). Used by the global search index (js/search.js) so it can build
 * its in-memory index with a single query instead of one query per major.
 */
export async function getActiveSubjects() {
  const dbRef = requireDb("getActiveSubjects");
  const q = query(
    collection(dbRef, "subjects"),
    where("active", "==", true),
    orderBy("displayOrder", "asc")
  );
  const snap = await getDocs(q);
  return snapshotToArray(snap);
}

/** Fetch every active subject belonging to a major (across all semesters). */
export async function getSubjectsForMajor(majorId) {
  const dbRef = requireDb("getSubjectsForMajor");
  if (!majorId) return [];
  const q = query(
    collection(dbRef, "subjects"),
    where("majorId", "==", majorId),
    where("active", "==", true),
    orderBy("displayOrder", "asc")
  );
  const snap = await getDocs(q);
  return snapshotToArray(snap);
}

/** Fetch every active subject belonging to one specific semester. */
export async function getSubjectsForSemester(semesterId) {
  const dbRef = requireDb("getSubjectsForSemester");
  if (!semesterId) return [];
  const q = query(
    collection(dbRef, "subjects"),
    where("semesterId", "==", semesterId),
    where("active", "==", true),
    orderBy("displayOrder", "asc")
  );
  const snap = await getDocs(q);
  return snapshotToArray(snap);
}

/** Fetch a single subject by its document id. Returns null if it doesn't exist. */
export async function getSubjectById(subjectId) {
  const dbRef = requireDb("getSubjectById");
  if (!subjectId) return null;
  const snap = await getDoc(doc(dbRef, "subjects", subjectId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** ADMIN: fetch every subject (any active state), sorted by displayOrder. */
export async function getAllSubjects() {
  const dbRef = requireDb("getAllSubjects");
  const q = query(collection(dbRef, "subjects"), orderBy("displayOrder", "asc"));
  const snap = await getDocs(q);
  return snapshotToArray(snap);
}

/** ADMIN: fetch every subject for a semester, regardless of active state. */
export async function getAllSubjectsForSemester(semesterId) {
  const dbRef = requireDb("getAllSubjectsForSemester");
  if (!semesterId) return [];
  const q = query(
    collection(dbRef, "subjects"),
    where("semesterId", "==", semesterId),
    orderBy("displayOrder", "asc")
  );
  const snap = await getDocs(q);
  return snapshotToArray(snap);
}

/** ADMIN: create a new subject document. */
export async function createSubject(subjectData) {
  const dbRef = requireDb("createSubject");
  const payload = { ...subjectData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
  const ref = await addDoc(collection(dbRef, "subjects"), payload);
  return ref.id;
}

/** ADMIN: update an existing subject document. */
export async function updateSubject(subjectId, subjectData) {
  const dbRef = requireDb("updateSubject");
  await updateDoc(doc(dbRef, "subjects", subjectId), { ...subjectData, updatedAt: serverTimestamp() });
}

/** ADMIN: delete a subject document. */
export async function deleteSubject(subjectId) {
  const dbRef = requireDb("deleteSubject");
  await deleteDoc(doc(dbRef, "subjects", subjectId));
}

/* ========================================================================
   PUBLIC ADMIN DIRECTORY
   ======================================================================== */

export async function getActivePublicAdmins() {
  const dbRef = requireDb("getActivePublicAdmins");
  const q = query(collection(dbRef, "publicAdmins"), where("active", "==", true), orderBy("displayOrder", "asc"));
  const snap = await getDocs(q);
  return snapshotToArray(snap);
}

export async function getAllPublicAdmins() {
  const dbRef = requireDb("getAllPublicAdmins");
  const q = query(collection(dbRef, "publicAdmins"), orderBy("displayOrder", "asc"));
  const snap = await getDocs(q);
  return snapshotToArray(snap);
}

export async function createPublicAdmin(data) {
  const dbRef = requireDb("createPublicAdmin");
  const ref = await addDoc(collection(dbRef, "publicAdmins"), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return ref.id;
}

export async function updatePublicAdmin(id, data) {
  const dbRef = requireDb("updatePublicAdmin");
  await updateDoc(doc(dbRef, "publicAdmins", id), { ...data, updatedAt: serverTimestamp() });
}

export async function deletePublicAdmin(id) {
  const dbRef = requireDb("deletePublicAdmin");
  await deleteDoc(doc(dbRef, "publicAdmins", id));
}

/* ==========================================================================
   REQUIREMENTS
   ========================================================================== */

/** Fetch every active requirement, sorted by displayOrder. */
export async function getRequirements() {
  const dbRef = requireDb("getRequirements");
  const q = query(
    collection(dbRef, "requirements"),
    where("active", "==", true),
    orderBy("displayOrder", "asc")
  );
  const snap = await getDocs(q);
  return snapshotToArray(snap);
}

/**
 * Fetch active requirements for one category:
 * "free-elective" | "university" | "college"
 */
export async function getRequirementsByCategory(category) {
  const dbRef = requireDb("getRequirementsByCategory");
  const q = query(
    collection(dbRef, "requirements"),
    where("category", "==", category),
    where("active", "==", true),
    orderBy("displayOrder", "asc")
  );
  const snap = await getDocs(q);
  return snapshotToArray(snap);
}

/** ADMIN: fetch every requirement (any active state), sorted by displayOrder. */
export async function getAllRequirements() {
  const dbRef = requireDb("getAllRequirements");
  const q = query(collection(dbRef, "requirements"), orderBy("displayOrder", "asc"));
  const snap = await getDocs(q);
  return snapshotToArray(snap);
}

/** ADMIN: create a new requirement document. */
export async function createRequirement(reqData) {
  const dbRef = requireDb("createRequirement");
  const payload = { ...reqData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
  const ref = await addDoc(collection(dbRef, "requirements"), payload);
  return ref.id;
}

/** ADMIN: update an existing requirement document. */
export async function updateRequirement(reqId, reqData) {
  const dbRef = requireDb("updateRequirement");
  await updateDoc(doc(dbRef, "requirements", reqId), { ...reqData, updatedAt: serverTimestamp() });
}

/** ADMIN: delete a requirement document. */
export async function deleteRequirement(reqId) {
  const dbRef = requireDb("deleteRequirement");
  await deleteDoc(doc(dbRef, "requirements", reqId));
}

/* ==========================================================================
   PHASE 7 (Part 2) — SITE CONFIG / CMS
   --------------------------------------------------------------------------
   siteConfig/{docId} = {
     draft:     {...},   // what admins are editing
     published: {...},   // what the public site reads
     archived:  [ {at, by, values} ],  // previous published versions
     status, updatedAt, updatedBy, publishedAt, publishedBy
   }

   docId is one of: appearance | homepage | content | navigation | settings
   (see js/cms-schema.js, which owns the shape of the values themselves).

   ONE COLLECTION, FIVE DOCUMENTS, ONE READ
   The public site calls getPublishedConfig() exactly once per page load
   and gets everything — appearance tokens, homepage sections, navigation,
   UI text and settings — in a single query. The alternative (a document
   per section, or worse a read per UI element) would mean a page making
   a dozen round trips before it could finish painting.

   WHY DRAFT AND PUBLISHED LIVE IN ONE DOCUMENT
   Publishing becomes a single-document write: copy draft into published,
   push the old published onto archived, done. Split across two documents
   it would be a multi-document write that can half-succeed, leaving the
   site showing content nobody approved.
   ========================================================================== */

/** Every CMS document. Admin use — includes drafts. */
export async function getAllSiteConfig() {
  const dbRef = requireDb("getAllSiteConfig");
  const snap = await getDocs(collection(dbRef, "siteConfig"));
  return snapshotToArray(snap);
}

/** One CMS document, envelope and all. Returns null when absent. */
export async function getSiteConfigDoc(docId) {
  const dbRef = requireDb("getSiteConfigDoc");
  if (!docId) return null;
  const snap = await getDoc(doc(dbRef, "siteConfig", docId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * PUBLIC: the published half of every CMS document, as {docId: values}.
 *
 * Drafts are never returned here — not merely filtered out in the caller,
 * but not consulted at all — so an unpublished change cannot reach a
 * visitor even if the public JS were modified in the browser. The security
 * rules make the same guarantee independently.
 */
export async function getPublishedConfig() {
  const dbRef = requireDb("getPublishedConfig");
  const snap = await getDocs(collection(dbRef, "siteConfig"));
  const out = {};
  snap.docs.forEach((d) => {
    const data = d.data() || {};
    if (data.published && typeof data.published === "object") {
      out[d.id] = data.published;
    }
  });
  return out;
}

/**
 * Save the working copy. Requires `edit` on the document's section and
 * touches nothing the public can see — which is the entire point of the
 * draft, and what the rules enforce by allowing this write to change only
 * the draft-side fields.
 */
export async function saveSiteConfigDraft(docId, values, meta = {}) {
  const dbRef = requireDb("saveSiteConfigDraft");
  await setDoc(
    doc(dbRef, "siteConfig", docId),
    {
      draft: values,
      status: "draft",
      updatedAt: serverTimestamp(),
      updatedBy: meta.actorUid || null,
      updatedByName: meta.actorName || "",
    },
    { merge: true }
  );
}

/**
 * Promote the draft to published, archiving whatever was live before.
 *
 * The previous published version is kept so "publish" is reversible: an
 * admin who publishes a mistake at 2am needs a way back that doesn't
 * depend on remembering what the old text said. The archive is capped at
 * ten entries, because an unbounded array in a document read on every
 * page load is a performance problem waiting to happen.
 */
export async function publishSiteConfig(docId, values, meta = {}) {
  const dbRef = requireDb("publishSiteConfig");
  const current = await getSiteConfigDoc(docId);

  const archived = Array.isArray(current?.archived) ? current.archived : [];
  if (current?.published) {
    archived.unshift({
      at: new Date().toISOString(),
      by: meta.actorName || meta.actorUid || "",
      values: current.published,
    });
  }

  await setDoc(
    doc(dbRef, "siteConfig", docId),
    {
      draft: values,
      published: values,
      archived: archived.slice(0, 10),
      status: "published",
      updatedAt: serverTimestamp(),
      updatedBy: meta.actorUid || null,
      publishedAt: serverTimestamp(),
      publishedBy: meta.actorUid || null,
      publishedByName: meta.actorName || "",
    },
    { merge: true }
  );
}

/**
 * Withdraw the live version: the public site falls back to its built-in
 * defaults, and the draft is left untouched so the work isn't lost.
 * Requires `publish`, because it changes what the public sees.
 */
export async function archiveSiteConfig(docId, meta = {}) {
  const dbRef = requireDb("archiveSiteConfig");
  const current = await getSiteConfigDoc(docId);
  const archived = Array.isArray(current?.archived) ? current.archived : [];
  if (current?.published) {
    archived.unshift({
      at: new Date().toISOString(),
      by: meta.actorName || meta.actorUid || "",
      values: current.published,
    });
  }

  await setDoc(
    doc(dbRef, "siteConfig", docId),
    {
      published: null,
      archived: archived.slice(0, 10),
      status: "archived",
      updatedAt: serverTimestamp(),
      updatedBy: meta.actorUid || null,
    },
    { merge: true }
  );
}

/** Put an archived version back into the draft for review before republishing. */
export async function restoreArchivedConfig(docId, index, meta = {}) {
  const current = await getSiteConfigDoc(docId);
  const entry = Array.isArray(current?.archived) ? current.archived[index] : null;
  if (!entry) throw new Error("No archived version at that position.");
  await saveSiteConfigDraft(docId, entry.values, meta);
  return entry.values;
}

/* ==========================================================================
   SITE CONTENT / SETTINGS
   ========================================================================== */

/** Fetch every siteContent document (bilingual CMS-style content blocks). */
export async function getSiteContent() {
  const dbRef = requireDb("getSiteContent");
  const snap = await getDocs(collection(dbRef, "siteContent"));
  return snapshotToArray(snap);
}

/** Fetch a single siteContent document by id. Returns null if missing. */
export async function getSiteContentById(contentId) {
  const dbRef = requireDb("getSiteContentById");
  const snap = await getDoc(doc(dbRef, "siteContent", contentId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * ADMIN: create-or-update a siteContent document with a fixed id (siteContent
 * blocks are keyed by a known id like "hero" or "footer", not auto-generated).
 */
export async function setSiteContent(contentId, contentData) {
  const dbRef = requireDb("setSiteContent");
  await setDoc(
    doc(dbRef, "siteContent", contentId),
    { ...contentData, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/** Fetch every settings document. */
export async function getSettings() {
  const dbRef = requireDb("getSettings");
  const snap = await getDocs(collection(dbRef, "settings"));
  return snapshotToArray(snap);
}

/** Fetch a single settings document by id (e.g. "general"). Returns null if missing. */
export async function getSettingsById(settingId) {
  const dbRef = requireDb("getSettingsById");
  const snap = await getDoc(doc(dbRef, "settings", settingId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** ADMIN: create-or-update a settings document with a fixed id. */
export async function setSettings(settingId, settingData) {
  const dbRef = requireDb("setSettings");
  await setDoc(
    doc(dbRef, "settings", settingId),
    { ...settingData, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/* ==========================================================================
   ADMIN AUTHORIZATION + DASHBOARD COUNTS
   ========================================================================== */

/**
 * Fetch the admins/{uid} allowlist document for a signed-in user.
 * Returns null if it doesn't exist (i.e. the user is not an admin at all).
 */
export async function getAdminDoc(uid) {
  const dbRef = requireDb("getAdminDoc");
  if (!uid) return null;
  const snap = await getDoc(doc(dbRef, "admins", uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Dashboard counts for the Admin Panel home screen. Uses the plain "get all
 * docs, count the array" approach (no separate aggregation query) since these
 * collections are small (student club data, not big data) and this keeps the
 * Firestore security rules simple — one read pattern, not two.
 */
export async function getDashboardCounts(allowed = null) {
  const dbRef = requireDb("getDashboardCounts");

  // A count the viewer isn't permitted to read (or a collection that has no
  // documents yet, which is the normal state on a fresh deployment) must
  // not take the whole dashboard down with it — each resolves to null and
  // the card renders a dash instead of a number.
  const sizeOf = async (name) => {
    try {
      return (await getDocs(collection(dbRef, name))).size;
    } catch (err) {
      console.info(`[ICC] Dashboard count unavailable for ${name}:`, err?.code || err);
      return null;
    }
  };

  // PHASE 8: the caller passes the sections the viewer holds VIEW on, and
  // nothing else is read. Previously every count was fetched and the ones
  // the viewer couldn't read simply failed into a dash — which still sent
  // the query. "Do not load its data" means not sending it.
  const ALL = ["majors", "specializations", "academicYears", "semesters", "subjects", "requirements"];
  const wanted = Array.isArray(allowed) ? ALL.filter((k) => allowed.includes(k)) : ALL;

  const values = await Promise.all(wanted.map((name) => sizeOf(name)));

  const out = {};
  wanted.forEach((name, i) => {
    out[name] = values[i];
  });
  return out;
}

/**
 * PHASE 4A: global search now lives in js/search.js, built on top of
 * getActiveMajors() / getActiveSubjects() / getRequirements() above (one
 * read of each per page load, cached, then searched client-side — see
 * that file's "Search Performance" comment for why). This module stays a
 * thin Firestore data-access layer; it does not own search-matching logic
 * itself. searchPlatform() from Phase 3 is intentionally removed rather
 * than kept as a second, competing entry point.
 */

/* ==========================================================================
   PHASE 5 — USERS, ROLES & PERMISSIONS
   --------------------------------------------------------------------------
   users/{uid} is now the canonical identity document for EVERY account on
   the platform — normal users, Admins and the Super Admin alike:

     users/{uid} = {
       email, displayName,
       role: "user" | "admin" | "superadmin",
       status: "pending" | "active" | "disabled" | "rejected",
       permissions: { <permissionKey>: true, ... },   // admins only
       createdAt, updatedAt,
       approvedAt, approvedBy,                        // set on approval
       disabledAt, disabledBy,
       lastLoginAt,
       notes
     }

   The legacy admins/{uid} allowlist from Phase 3B is still honoured by the
   security rules as a bridge so existing admins never lose access mid-
   migration (see firestore.rules → legacyAdmin()). migrateLegacyAdmin()
   below promotes such a record into a real users/{uid} profile.
   ========================================================================== */

/** Fetch the users/{uid} profile document. Returns null when absent. */
export async function getUserProfile(uid) {
  const dbRef = requireDb("getUserProfile");
  if (!uid) return null;
  const snap = await getDoc(doc(dbRef, "users", uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Create the profile for a brand-new self-service registration.
 *
 * Deliberately hard-codes role/status/permissions rather than accepting
 * them from the caller: a sign-up can never mint an admin. The security
 * rules enforce exactly the same shape, so tampering with this call in the
 * browser console changes nothing.
 */
export async function createPendingUserProfile(uid, { email, displayName }) {
  const dbRef = requireDb("createPendingUserProfile");
  await setDoc(doc(dbRef, "users", uid), {
    email: (email || "").toLowerCase(),
    displayName: displayName || "",
    role: "user",
    status: "pending",
    permissions: {},
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/** ADMIN: every account, newest first. Requires the `users` permission. */
export async function getAllUsers() {
  const dbRef = requireDb("getAllUsers");
  const q = query(collection(dbRef, "users"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snapshotToArray(snap);
}

/** ADMIN: only accounts awaiting a decision. */
export async function getPendingUsers() {
  const dbRef = requireDb("getPendingUsers");
  const q = query(
    collection(dbRef, "users"),
    where("status", "==", "pending"),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snapshotToArray(snap);
}

/**
 * SUPER ADMIN: patch a user profile (role, status, permissions, notes…).
 *
 * Callers must pass an already-sanitized permissions map — see
 * sanitizePermissions() in js/permissions.js. The rules independently
 * re-validate role and status values, and refuse any write that would let
 * a non-Super-Admin touch role or permissions at all.
 */
export async function updateUserProfile(uid, patch) {
  const dbRef = requireDb("updateUserProfile");
  await updateDoc(doc(dbRef, "users", uid), { ...patch, updatedAt: serverTimestamp() });
}

/**
 * SUPER ADMIN: create the profile for an Admin account.
 *
 * Note the deliberate split of responsibilities: the Firebase Auth *user*
 * is created by the person themselves (they sign up, or are invited via a
 * password-reset email), because a static site has no Admin SDK and must
 * never hold a service-account key in the browser. This function writes the
 * authorization half — the profile that turns that Auth user into an Admin.
 */
export async function setAdminProfile(uid, { email, displayName, permissions, status = "active" }) {
  const dbRef = requireDb("setAdminProfile");
  await setDoc(
    doc(dbRef, "users", uid),
    {
      email: (email || "").toLowerCase(),
      displayName: displayName || "",
      role: "admin",
      status,
      permissions: permissions || {},
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/** Record a successful sign-in timestamp on the signed-in user's own profile. */
export async function touchLastLogin(uid) {
  const dbRef = requireDb("touchLastLogin");
  await updateDoc(doc(dbRef, "users", uid), { lastLoginAt: serverTimestamp() });
}

/**
 * Promote a legacy Phase-3B admins/{uid} record into a users/{uid} profile
 * with full permissions. Used once per legacy admin by the Users screen.
 */
export async function migrateLegacyAdmin(uid, legacyDoc, permissions) {
  const dbRef = requireDb("migrateLegacyAdmin");
  await setDoc(
    doc(dbRef, "users", uid),
    {
      email: (legacyDoc?.email || "").toLowerCase(),
      displayName: legacyDoc?.displayName || "",
      role: "admin",
      status: legacyDoc?.active === false ? "disabled" : "active",
      permissions: permissions || {},
      migratedFromLegacy: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/* ==========================================================================
   PHASE 5 — ACADEMIC TREE (dynamic hierarchy)
   --------------------------------------------------------------------------
   treeNodes/{nodeId} = {
     parentId: null | <nodeId>,     // null = root node
     name: { en, ar },
     type: "faculty" | "department" | "major" | "track" | "custom",
     linkedMajorId: <majorId> | "", // optional link to an existing major
     displayOrder, active, createdAt, updatedAt
   }

   Stored flat with a parentId pointer rather than as nested subcollections:
   the whole tree is small, one read fetches it all, and reparenting a node
   is a single field write instead of a recursive move.
   ========================================================================== */

/** Fetch every tree node (admin view — includes inactive). */
export async function getAllTreeNodes() {
  const dbRef = requireDb("getAllTreeNodes");
  const q = query(collection(dbRef, "treeNodes"), orderBy("displayOrder", "asc"));
  const snap = await getDocs(q);
  return snapshotToArray(snap);
}

/** Fetch only active tree nodes — what the public site renders. */
export async function getActiveTreeNodes() {
  const dbRef = requireDb("getActiveTreeNodes");
  const q = query(
    collection(dbRef, "treeNodes"),
    where("active", "==", true),
    orderBy("displayOrder", "asc")
  );
  const snap = await getDocs(q);
  return snapshotToArray(snap);
}

export async function createTreeNode(nodeData) {
  const dbRef = requireDb("createTreeNode");
  const ref = await addDoc(collection(dbRef, "treeNodes"), {
    ...nodeData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateTreeNode(nodeId, nodeData) {
  const dbRef = requireDb("updateTreeNode");
  await updateDoc(doc(dbRef, "treeNodes", nodeId), { ...nodeData, updatedAt: serverTimestamp() });
}

export async function deleteTreeNode(nodeId) {
  const dbRef = requireDb("deleteTreeNode");
  await deleteDoc(doc(dbRef, "treeNodes", nodeId));
}

/** Persist a batch of {id, displayOrder} changes in one atomic write. */
export async function reorderTreeNodes(updates) {
  const dbRef = requireDb("reorderTreeNodes");
  const batch = writeBatch(dbRef);
  updates.forEach(({ id, displayOrder, parentId }) => {
    const patch = { displayOrder, updatedAt: serverTimestamp() };
    if (parentId !== undefined) patch.parentId = parentId;
    batch.update(doc(dbRef, "treeNodes", id), patch);
  });
  await batch.commit();
}

/* ==========================================================================
   PHASE 5 — STRUCTURED PREREQUISITES
   --------------------------------------------------------------------------
   prerequisites/{id} = {
     subjectId,        // the subject that HAS the prerequisite
     prereqSubjectId,  // the subject that must be completed first
     type: "hard" | "soft" | "concurrent",
     active, createdAt, updatedAt
   }

   Phase 3B stored prerequisites as free text on the subject itself. That
   field is untouched and still renders as a fallback — these documents are
   the structured, queryable version layered on top.
   ========================================================================== */

export async function getAllPrerequisites() {
  const dbRef = requireDb("getAllPrerequisites");
  const snap = await getDocs(collection(dbRef, "prerequisites"));
  return snapshotToArray(snap);
}

export async function getActivePrerequisites() {
  const dbRef = requireDb("getActivePrerequisites");
  const q = query(collection(dbRef, "prerequisites"), where("active", "==", true));
  const snap = await getDocs(q);
  return snapshotToArray(snap);
}

export async function createPrerequisite(data) {
  const dbRef = requireDb("createPrerequisite");
  const ref = await addDoc(collection(dbRef, "prerequisites"), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updatePrerequisite(id, data) {
  const dbRef = requireDb("updatePrerequisite");
  await updateDoc(doc(dbRef, "prerequisites", id), { ...data, updatedAt: serverTimestamp() });
}

export async function deletePrerequisite(id) {
  const dbRef = requireDb("deletePrerequisite");
  await deleteDoc(doc(dbRef, "prerequisites", id));
}

/* ==========================================================================
   PHASE 5 — AUDIT LOG
   --------------------------------------------------------------------------
   auditLogs/{id} = {
     actorUid, actorEmail, actorName, actorRole,
     action: "create" | "update" | "delete" | "activate" | "deactivate" |
             "approve" | "reject" | "permissions" | "reorder" | "login",
     section: "majors" | "users" | "tree" | ...   (a permission key)
     entityId, entityLabel,
     before, after,          // shallow snapshots of the changed fields only
     targetUid, targetEmail, // for actions performed ON an account
     at                      // serverTimestamp
   }

   Append-only by design: the rules allow create for any active admin, deny
   update outright for everyone, and allow delete only to a Super Admin or
   an Admin granted the `delete` action on the `audit` section.
   ========================================================================== */

/** Write one audit record. Never throws into the caller's happy path. */
export async function writeAuditLog(entry) {
  const dbRef = requireDb("writeAuditLog");
  const ref = await addDoc(collection(dbRef, "auditLogs"), { ...entry, at: serverTimestamp() });
  return ref.id;
}

/**
 * Read audit records, newest first.
 * opts: { section, actorUid, action, from, to, pageSize, cursor }
 *
 * `from` / `to` are Date objects bounding the `at` timestamp. They are
 * range filters on the same field the results are ordered by, which
 * Firestore permits without an extra composite index — unlike combining a
 * range with an equality on a different field, which is why the section /
 * action / actor filters are listed in firestore.indexes.json.
 *
 * Returns { rows, cursor } where cursor is the last document snapshot, to
 * be passed straight back in for the next page.
 */
export async function getAuditLogs(opts = {}) {
  const dbRef = requireDb("getAuditLogs");
  const { section, actorUid, action, from = null, to = null, pageSize = 50, cursor = null } = opts;

  const clauses = [];
  if (section) clauses.push(where("section", "==", section));
  if (actorUid) clauses.push(where("actorUid", "==", actorUid));
  if (action) clauses.push(where("action", "==", action));
  if (from instanceof Date && !Number.isNaN(from.getTime())) {
    clauses.push(where("at", ">=", from));
  }
  if (to instanceof Date && !Number.isNaN(to.getTime())) {
    clauses.push(where("at", "<=", to));
  }
  clauses.push(orderBy("at", "desc"));
  if (cursor) clauses.push(startAfter(cursor));
  clauses.push(fsLimit(pageSize));

  const snap = await getDocs(query(collection(dbRef, "auditLogs"), ...clauses));
  return {
    rows: snapshotToArray(snap),
    cursor: snap.docs.length ? snap.docs[snap.docs.length - 1] : null,
    exhausted: snap.docs.length < pageSize,
  };
}

/** Delete one audit record. Gated to `audit: delete` by firestore.rules. */
export async function deleteAuditLog(id) {
  const dbRef = requireDb("deleteAuditLog");
  await deleteDoc(doc(dbRef, "auditLogs", id));
}

/* ==========================================================================
   PHASE 5 — EXTENDED DASHBOARD COUNTS
   ========================================================================== */

/**
 * Counts for the governance cards on the dashboard. Split out from
 * getDashboardCounts() because these collections are readable only by
 * admins holding the relevant permission — a plain Admin without `users`
 * would have their whole dashboard fail if this were merged into the
 * original call.
 */
export async function getGovernanceCounts() {
  const dbRef = requireDb("getGovernanceCounts");
  const [usersSnap, pendingSnap] = await Promise.all([
    getDocs(collection(dbRef, "users")),
    getDocs(query(collection(dbRef, "users"), where("status", "==", "pending"))),
  ]);
  return { users: usersSnap.size, pending: pendingSnap.size };
}

/**
 * SUPER ADMIN: list the legacy Phase-3B admins/{uid} allowlist so the Users
 * screen can show who still needs migrating into a real users/{uid}
 * profile. The rules permit this listing to Super Admins only.
 */
export async function getLegacyAdmins() {
  const dbRef = requireDb("getLegacyAdmins");
  const snap = await getDocs(collection(dbRef, "admins"));
  return snapshotToArray(snap);
}

/* ==========================================================================
   PHASE 6 — VERSION HISTORY
   --------------------------------------------------------------------------
   versions/{id} = {
     collectionName, docId, snapshot{},   // the document BEFORE the change
     actorUid, actorName, actorEmail,
     reason,                              // "update" | "delete" | "restore"
     at
   }

   A snapshot is written immediately before the change it precedes, so the
   history reads as "this is what it looked like until <actor> changed it
   at <time>". Restoring writes a snapshot back into the live collection —
   which goes through that collection's own security rules like any other
   write — and records a fresh audit entry; the snapshot itself is never
   mutated, because the rules deny update on versions outright.
   ========================================================================== */

/** Strip Firestore metadata that must not be written back on restore. */
function cleanSnapshot(record) {
  const out = { ...record };
  delete out.id;
  delete out.createdAt;
  delete out.updatedAt;
  return out;
}

/** Record the pre-change state of a document. */
export async function saveVersion(collectionName, docId, snapshot, meta = {}) {
  const dbRef = requireDb("saveVersion");
  const ref = await addDoc(collection(dbRef, "versions"), {
    collectionName,
    docId,
    snapshot: cleanSnapshot(snapshot || {}),
    actorUid: meta.actorUid || null,
    actorName: meta.actorName || "",
    actorEmail: meta.actorEmail || "",
    reason: meta.reason || "update",
    at: serverTimestamp(),
  });
  return ref.id;
}

/** Every stored version of one document, newest first. */
export async function getVersions(collectionName, docId, max = 25) {
  const dbRef = requireDb("getVersions");
  const q = query(
    collection(dbRef, "versions"),
    where("collectionName", "==", collectionName),
    where("docId", "==", docId),
    orderBy("at", "desc"),
    fsLimit(max)
  );
  const snap = await getDocs(q);
  return snapshotToArray(snap);
}

/** Recent versions across everything — the History screen's default view. */
export async function getRecentVersions(max = 50) {
  const dbRef = requireDb("getRecentVersions");
  const q = query(collection(dbRef, "versions"), orderBy("at", "desc"), fsLimit(max));
  const snap = await getDocs(q);
  return snapshotToArray(snap);
}

/**
 * Write a snapshot back over the live document.
 * Uses merge:false semantics via setDoc so fields added after the snapshot
 * was taken are removed rather than silently surviving a "restore" — a
 * partial restore is more confusing than an exact one.
 */
export async function restoreVersion(collectionName, docId, snapshot) {
  const dbRef = requireDb("restoreVersion");
  await setDoc(doc(dbRef, collectionName, docId), {
    ...cleanSnapshot(snapshot),
    updatedAt: serverTimestamp(),
  });
}

/* ==========================================================================
   PHASE 6 — RELATIONSHIP PROTECTION
   --------------------------------------------------------------------------
   Firestore has no foreign keys and no ON DELETE behaviour: deleting a
   major leaves its semesters and subjects pointing at an id that no longer
   resolves, and nothing anywhere complains. These queries are what let the
   Admin Panel tell an administrator what a record is holding up BEFORE
   they delete it, and offer archiving instead.
   ========================================================================== */

async function countWhere(collectionName, field, value) {
  const dbRef = requireDb("countWhere");
  const snap = await getDocs(
    query(collection(dbRef, collectionName), where(field, "==", value))
  );
  return { count: snap.size, ids: snap.docs.map((d) => d.id) };
}

/**
 * Same idea, for a field holding an ARRAY of ids — how the structured
 * `prerequisiteIds` on a course records which courses must come first.
 * This is what makes "3 courses list this one as a prerequisite" a real
 * answer rather than a guess.
 */
async function countWhereArrayContains(collectionName, field, value) {
  const dbRef = requireDb("countWhereArrayContains");
  const snap = await getDocs(
    query(collection(dbRef, collectionName), where(field, "array-contains", value))
  );
  return {
    count: snap.size,
    ids: snap.docs.map((d) => d.id),
    records: snapshotToArray(snap),
  };
}

/**
 * Every course that names `subjectId` as one of its prerequisites, as full
 * records rather than ids — the delete dialog names them, because "this
 * will break 3 courses" is only actionable if you can see which three.
 */
export async function getCoursesRequiring(subjectId) {
  if (!subjectId) return [];
  const res = await countWhereArrayContains("subjects", "prerequisiteIds", subjectId);
  return res.records;
}

/** Generic contiguous-reorder commit: [{id, displayOrder}] in one batch. */
export async function reorderDocs(collectionName, updates) {
  const dbRef = requireDb("reorderDocs");
  const batch = writeBatch(dbRef);
  updates.forEach(({ id, displayOrder }) => {
    batch.update(doc(dbRef, collectionName, id), {
      displayOrder,
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
}

/**
 * What depends on this record?
 * Returns [{ collection, section, count, ids }] for everything that
 * references it. An empty array means the record is safe to delete.
 */
export async function getDependents(section, record) {
  const id = record.id;
  const results = [];

  const push = (collectionName, sectionKey, res) => {
    if (res.count > 0) {
      results.push({ collection: collectionName, section: sectionKey, ...res });
    }
  };

  if (section === "majors") {
    const [specs, years, sem, subj, nodes] = await Promise.all([
      countWhere("specializations", "majorId", id),
      countWhere("academicYears", "majorId", id),
      countWhere("semesters", "majorId", id),
      countWhere("subjects", "majorId", id),
      countWhere("treeNodes", "linkedMajorId", id),
    ]);
    push("specializations", "specializations", specs);
    push("academicYears", "academicYears", years);
    push("semesters", "semesters", sem);
    push("subjects", "subjects", subj);
    push("treeNodes", "tree", nodes);
  } else if (section === "specializations") {
    const [years, sem, subj] = await Promise.all([
      countWhere("academicYears", "specializationId", id),
      countWhere("semesters", "specializationId", id),
      countWhere("subjects", "specializationId", id),
    ]);
    push("academicYears", "academicYears", years);
    push("semesters", "semesters", sem);
    push("subjects", "subjects", subj);
  } else if (section === "academicYears") {
    const [sem, subj] = await Promise.all([
      countWhere("semesters", "academicYearId", id),
      countWhere("subjects", "academicYearId", id),
    ]);
    push("semesters", "semesters", sem);
    push("subjects", "subjects", subj);
  } else if (section === "semesters") {
    push("subjects", "subjects", await countWhere("subjects", "semesterId", id));
  } else if (section === "subjects") {
    // A course can be referenced from either side of a prerequisite link
    // document, AND from the prerequisiteIds array of any other course.
    const [asSubject, asPrereq, inArrays] = await Promise.all([
      countWhere("prerequisites", "subjectId", id),
      countWhere("prerequisites", "prereqSubjectId", id),
      countWhereArrayContains("subjects", "prerequisiteIds", id),
    ]);
    const merged = {
      count: asSubject.count + asPrereq.count,
      ids: [...asSubject.ids, ...asPrereq.ids],
    };
    push("prerequisites", "prerequisites", merged);
    push("subjects", "subjects", { count: inArrays.count, ids: inArrays.ids });
  } else if (section === "tree") {
    push("treeNodes", "tree", await countWhere("treeNodes", "parentId", id));
  }

  return results;
}

/** Delete every dependent document found by getDependents(). */
export async function deleteDependents(dependents) {
  const dbRef = requireDb("deleteDependents");
  const batch = writeBatch(dbRef);
  dependents.forEach((dep) => {
    dep.ids.forEach((id) => batch.delete(doc(dbRef, dep.collection, id)));
  });
  await batch.commit();
}

/**
 * Point dependents at a different record instead of deleting them —
 * the "reassign relationships" option in the delete dialog.
 */
export async function reassignDependents(dependents, field, newValue) {
  const dbRef = requireDb("reassignDependents");
  const batch = writeBatch(dbRef);
  dependents.forEach((dep) => {
    dep.ids.forEach((id) =>
      batch.update(doc(dbRef, dep.collection, id), {
        [field]: newValue,
        updatedAt: serverTimestamp(),
      })
    );
  });
  await batch.commit();
}

/* ==========================================================================
   PHASE 6 — BULK OPERATIONS
   --------------------------------------------------------------------------
   One batched commit per bulk action so a partially-applied bulk change is
   not possible. Firestore caps a batch at 500 writes, so larger selections
   are split into successive batches.
   ========================================================================== */

const BATCH_LIMIT = 450;

export async function bulkUpdate(collectionName, ids, patch) {
  const dbRef = requireDb("bulkUpdate");
  for (let i = 0; i < ids.length; i += BATCH_LIMIT) {
    const batch = writeBatch(dbRef);
    ids.slice(i, i + BATCH_LIMIT).forEach((id) =>
      batch.update(doc(dbRef, collectionName, id), { ...patch, updatedAt: serverTimestamp() })
    );
    await batch.commit();
  }
}

export async function bulkDelete(collectionName, ids) {
  const dbRef = requireDb("bulkDelete");
  for (let i = 0; i < ids.length; i += BATCH_LIMIT) {
    const batch = writeBatch(dbRef);
    ids.slice(i, i + BATCH_LIMIT).forEach((id) => batch.delete(doc(dbRef, collectionName, id)));
    await batch.commit();
  }
}

/* ==========================================================================
   PHASE 6 — WORKFLOW QUEUE
   ========================================================================== */

/**
 * Everything awaiting review, across every workflow-managed collection.
 * Queried per collection because Firestore has no cross-collection query;
 * a failure on one collection (no permission to read it) is tolerated so a
 * reviewer still sees the queues they CAN see.
 */
export async function getPendingReview(collections) {
  const dbRef = requireDb("getPendingReview");
  const out = [];
  await Promise.all(
    collections.map(async ({ collection: name, section }) => {
      try {
        const snap = await getDocs(
          query(collection(dbRef, name), where("status", "==", "pending"))
        );
        snapshotToArray(snap).forEach((r) => out.push({ ...r, __section: section, __collection: name }));
      } catch (err) {
        console.info(`[ICC] Skipping review queue for ${name}:`, err?.code || err);
      }
    })
  );
  return out;
}

/* ==========================================================================
   PHASE 6 — BACKUP / EXPORT
   ========================================================================== */

/** Read an entire collection verbatim, for export. */
export async function dumpCollection(collectionName) {
  const dbRef = requireDb("dumpCollection");
  const snap = await getDocs(collection(dbRef, collectionName));
  return snapshotToArray(snap);
}

/**
 * Write documents back from a backup archive, preserving their original
 * IDs. Goes through the normal security rules, so a restore can only write
 * what the operator is authorized to write.
 */
export async function restoreCollection(collectionName, records) {
  const dbRef = requireDb("restoreCollection");
  for (let i = 0; i < records.length; i += BATCH_LIMIT) {
    const batch = writeBatch(dbRef);
    records.slice(i, i + BATCH_LIMIT).forEach((rec) => {
      const { id, ...data } = rec;
      batch.set(doc(dbRef, collectionName, id), { ...data, updatedAt: serverTimestamp() });
    });
    await batch.commit();
  }
}

/** Record that a backup was taken (the archive itself never lands here). */
export async function recordBackupManifest(manifest) {
  const dbRef = requireDb("recordBackupManifest");
  const ref = await addDoc(collection(dbRef, "backups"), { ...manifest, at: serverTimestamp() });
  return ref.id;
}

export async function getBackupManifests(max = 25) {
  const dbRef = requireDb("getBackupManifests");
  const snap = await getDocs(
    query(collection(dbRef, "backups"), orderBy("at", "desc"), fsLimit(max))
  );
  return snapshotToArray(snap);
}
