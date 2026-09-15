/**
 * auth.js
 * -----------------------------------------------------------------------
 * Authentication layer — PHASE 1 PLACEHOLDER.
 *
 * PHASE 3 will implement:
 *   - Email/password sign-in for the Admin Panel
 *   - Google Sign-In
 *   - Admin authorization (custom claims or a Firestore `admins/{uid}` doc)
 *   - Session handling for /admin pages
 *
 * Nothing in PHASE 1 calls into this file. It exists so the folder/module
 * structure already matches what later phases need, and so `admin/`
 * pages built in Phase 3 have a stable import target.
 * ------------------------------------------------------------------------
 */

// import { auth } from "./firebase-init.js";
// import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, onAuthStateChanged }
//   from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

/** PHASE 3: sign an admin in with email + password. */
export async function signInAdmin(email, password) {
  throw new Error("signInAdmin() is not implemented until the Admin Panel (Phase 3).");
}

/** PHASE 3: sign in with Google. */
export async function signInWithGoogle() {
  throw new Error("signInWithGoogle() is not implemented until the Admin Panel (Phase 3).");
}

/** PHASE 3: check whether the current signed-in user is an authorized admin. */
export async function isCurrentUserAdmin() {
  throw new Error("isCurrentUserAdmin() is not implemented until the Admin Panel (Phase 3).");
}

/** PHASE 3: sign the current user out. */
export async function signOutAdmin() {
  throw new Error("signOutAdmin() is not implemented until the Admin Panel (Phase 3).");
}
