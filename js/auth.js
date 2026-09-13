import { auth, db } from './firebase-init.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { GoogleAuthProvider, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

function configured() { if (!auth || !db) throw new Error('Firebase is not configured. Add your Firebase web configuration first.'); }
export async function signInAdmin(email, password) { configured(); return signInWithEmailAndPassword(auth, email, password); }
export async function signInWithGoogle() { configured(); return signInWithPopup(auth, new GoogleAuthProvider()); }
export async function sendAdminPasswordReset(email) { configured(); return sendPasswordResetEmail(auth, email); }
export async function getAdminProfile(user = auth?.currentUser) {
  if (!user || !db) return null;
  const snapshot = await getDoc(doc(db, 'admins', user.uid));
  const data = snapshot.exists() ? snapshot.data() : null;
  return ['admin', 'superadmin'].includes(data?.role) && data?.active === true ? { ...data, uid: user.uid } : null;
}
export async function isCurrentUserAdmin() { return Boolean(await getAdminProfile()); }
export function watchAuth(callback) { configured(); return onAuthStateChanged(auth, callback); }
export async function signOutAdmin() { if (auth) await signOut(auth); }
