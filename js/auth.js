import { auth, db } from './firebase-init.js';
import { doc, getDoc, serverTimestamp, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { GoogleAuthProvider, createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signOut, updateProfile } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

function configured() { if (!auth || !db) throw new Error('Firebase is not configured. Add your Firebase web configuration first.'); }

export async function signInAdmin(email, password) { configured(); return signInWithEmailAndPassword(auth, email, password); }
export async function signInWithGoogle() { configured(); return signInWithPopup(auth, new GoogleAuthProvider()); }
export async function sendAdminPasswordReset(email) { configured(); return sendPasswordResetEmail(auth, email); }

/**
 * Self-service admin sign-up. Creates the Firebase Authentication account,
 * then writes a matching /admins/{uid} profile with role "pending" and no
 * permissions. The account cannot access anything until a Super
 * administrator reviews the request on the "Team & access" page and
 * assigns it a role + permissions.
 */
export async function signUpAdmin(displayName, email, password) {
  configured();
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) await updateProfile(credential.user, { displayName });
  await setDoc(doc(db, 'admins', credential.user.uid), {
    displayName: displayName || email,
    email,
    role: 'pending',
    permissions: [],
    active: false,
    requestedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  // Sign the brand-new account back out immediately — a pending request
  // must not be able to browse the admin panel while awaiting approval.
  await signOut(auth);
  return credential.user;
}

/**
 * Returns the admin profile for a signed-in user, or null if they have no
 * profile, are still pending approval, or have been deactivated.
 * `includePending` returns the raw profile even for pending/inactive users,
 * used only by the login screen to show a clear status message.
 */
export async function getAdminProfile(user = auth?.currentUser, includePending = false) {
  if (!user || !db) return null;
  const snapshot = await getDoc(doc(db, 'admins', user.uid));
  const data = snapshot.exists() ? snapshot.data() : null;
  if (!data) return null;
  if (includePending) return { ...data, uid: user.uid };
  return ['admin', 'superadmin'].includes(data.role) && data.active === true ? { ...data, uid: user.uid } : null;
}

export async function isCurrentUserAdmin() { return Boolean(await getAdminProfile()); }
export function watchAuth(callback) { configured(); return onAuthStateChanged(auth, callback); }
export async function signOutAdmin() { if (auth) await signOut(auth); }
