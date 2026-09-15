/**
 * firestore.js
 * -----------------------------------------------------------------------
 * Firestore data-access layer — PHASE 1 PLACEHOLDER.
 *
 * This module defines the shape of the functions that will read/write
 * the academic data model in later phases:
 *
 *   Firestore
 *     └─ majors/{majorId}
 *          └─ semesters/{semesterId}
 *               └─ subjects/{subjectId}
 *     └─ requirements/{trackId}   (free-electives | university | college)
 *
 * None of these are implemented yet — PHASE 1 UI is powered entirely by
 * the demo data in js/majors.js and js/subjects.js. Keeping this file in
 * place now means later phases wire real reads/writes into the existing
 * UI functions instead of rebuilding them.
 * ------------------------------------------------------------------------
 */

// import { db } from "./firebase-init.js";
// import { collection, doc, getDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/** PHASE 2+: fetch every major for the /majors.html grid. */
export async function fetchAllMajors() {
  throw new Error("fetchAllMajors() is not implemented until Firestore integration (Phase 2+).");
}

/** PHASE 2+: fetch a single major by id for major.html?id=... */
export async function fetchMajorById(majorId) {
  throw new Error(`fetchMajorById("${majorId}") is not implemented until Firestore integration (Phase 2+).`);
}

/** PHASE 2+: fetch semesters + subjects for a given major. */
export async function fetchSemestersForMajor(majorId) {
  throw new Error(`fetchSemestersForMajor("${majorId}") is not implemented until Firestore integration (Phase 2+).`);
}

/** PHASE 2+: fetch Free Elective / University / College requirement tracks. */
export async function fetchRequirements() {
  throw new Error("fetchRequirements() is not implemented until Firestore integration (Phase 2+).");
}

/** PHASE 3+: global search across majors, subjects and requirements. */
export async function searchPlatform(queryText) {
  throw new Error(`searchPlatform("${queryText}") is not implemented until global search (Phase 3+).`);
}
