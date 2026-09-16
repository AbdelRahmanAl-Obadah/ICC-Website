/**
 * auth.js
 * -----------------------------------------------------------------------
 * Authentication layer — PHASE 3B (real implementation).
 *
 * Wraps Firebase Authentication for the Admin Panel:
 *   - Email/password sign-in
 *   - Google Sign-In (popup, with a redirect fallback for blocked popups)
 *   - Password reset email
 *   - Sign out
 *   - onAuthStateChanged subscription
 *   - Admin authorization via the Firestore admins/{uid} allowlist
 *
 * IMPORTANT — authentication is NOT authorization.
 * Signing in (including with Google) proves only "you are a Firebase user".
 * It never, by itself, grants admin access. A user is an admin only when a
 * document exists at admins/{uid} with role == "admin" AND active == true.
 * That document can only be created from the Firebase Console / Admin SDK
 * (see firestore.rules — admins/{uid} is not client-writable by anyone),
 * so there is no in-app path to self-promotion.
 *
 * The Firestore security rules are the real authorization boundary. The
 * checks here exist so the UI can redirect/sign out unauthorized users
 * cleanly instead of showing them a panel full of permission errors.
 * ------------------------------------------------------------------------
 */

import { auth } from "./firebase-init.js";
import {
  getAdminDoc,
  getUserProfile,
  createPendingUserProfile,
  touchLastLogin,
} from "./firestore.js";
import {
  ROLES,
  STATUS,
  PERMISSION_KEYS,
  normalizePermissions,
  normalizeOwnership,
  isSuperAdmin,
  isAdminRole,
  hasPermission,
  hasAnyPermission,
} from "./permissions.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

/**
 * Thrown when Firebase Auth isn't available because firebase-config.js
 * still holds placeholder values. Kept as a distinct class so login.js can
 * show "the site isn't connected to Firebase yet" instead of a generic
 * "wrong password" style message.
 */
export class AuthNotConfiguredError extends Error {
  constructor(fnName) {
    super(
      `${fnName}() could not run: Firebase is not configured yet. ` +
        "Add your real project config to js/firebase-config.js."
    );
    this.name = "AuthNotConfiguredError";
  }
}

function requireAuth(fnName) {
  if (!auth) throw new AuthNotConfiguredError(fnName);
  return auth;
}

/* ==========================================================================
   SIGN IN / SIGN OUT
   ========================================================================== */

/**
 * Sign an admin in with email + password.
 * Resolves with the Firebase user. Does NOT check admin authorization —
 * the caller must follow up with isCurrentUserAdmin().
 */
export async function signInAdmin(email, password) {
  const a = requireAuth("signInAdmin");
  await setPersistence(a, browserLocalPersistence);
  const cred = await signInWithEmailAndPassword(a, email, password);
  return cred.user;
}

/**
 * Sign in with Google.
 *
 * NOTE: a successful Google sign-in does NOT make anyone an admin. The
 * caller checks admins/{uid} afterwards and signs the user straight back
 * out if they aren't allowlisted.
 */
export async function signInWithGoogle() {
  const a = requireAuth("signInWithGoogle");
  await setPersistence(a, browserLocalPersistence);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const cred = await signInWithPopup(a, provider);
  return cred.user;
}

/** Send a password-reset email to the given address. */
export async function sendAdminPasswordReset(email) {
  const a = requireAuth("sendAdminPasswordReset");
  await sendPasswordResetEmail(a, email);
}

/** Sign the current user out. */
export async function signOutAdmin() {
  const a = requireAuth("signOutAdmin");
  await signOut(a);
}

/** Currently signed-in Firebase user, or null. */
export function getCurrentUser() {
  return auth ? auth.currentUser : null;
}

/**
 * Subscribe to auth-state changes.
 * If Firebase isn't configured, the callback fires once with null so
 * protected pages still redirect to login instead of hanging on the gate.
 */
export function onAuthStateChanged(callback) {
  if (!auth) {
    setTimeout(() => callback(null), 0);
    return () => {};
  }
  return firebaseOnAuthStateChanged(auth, callback);
}

/* ==========================================================================
   REGISTRATION (PHASE 5)
   ========================================================================== */

/**
 * Register a brand-new account from the public Sign Up page.
 *
 * Creates the Firebase Auth user, sets their display name, and writes a
 * users/{uid} profile that is ALWAYS role "user" / status "pending".
 * Nothing on this path can produce an admin — not by passing extra
 * arguments, not by editing the request in devtools — because the
 * Firestore rules independently reject any self-created profile whose
 * role isn't "user", whose status isn't "pending", or whose permissions
 * map is non-empty.
 *
 * Approval is a separate, human decision made in the Admin Panel.
 */
export async function signUpUser({ email, password, displayName }) {
  const a = requireAuth("signUpUser");
  await setPersistence(a, browserLocalPersistence);
  const cred = await createUserWithEmailAndPassword(a, email, password);
  if (displayName) {
    try {
      await updateProfile(cred.user, { displayName });
    } catch (err) {
      /* cosmetic only — the profile document is the source of truth */
    }
  }
  await createPendingUserProfile(cred.user.uid, { email, displayName });
  return cred.user;
}

/** Plain sign-in for non-admin site users (same credentials, no gate). */
export async function signInUser(email, password) {
  return signInAdmin(email, password);
}

/* ==========================================================================
   AUTHORIZATION — ROLE + GRANULAR PERMISSIONS
   ========================================================================== */

/**
 * Resolve the authoritative profile for a signed-in user.
 *
 * Resolution order:
 *   1. users/{uid} — the canonical Phase 5 profile.
 *   2. admins/{uid} — the legacy Phase 3B allowlist. If a user has no
 *      users/{uid} profile yet but IS in the old allowlist, they are
 *      treated as a full Admin so nobody is locked out mid-migration.
 *      The security rules contain the exact same bridge.
 *   3. null — not a recognized account.
 *
 * Any read failure resolves to null. Failing closed is the only safe
 * default for an authorization lookup.
 */
export async function getProfile(user) {
  const u = user || getCurrentUser();
  if (!u) return null;

  try {
    const profile = await getUserProfile(u.uid);
    if (profile) {
      return {
        ...profile,
        uid: u.uid,
        email: profile.email || u.email || "",
        displayName: profile.displayName || u.displayName || "",
        permissions: profile.permissions || {},
        // Phase 6: the matrix and ownership are normalized once, here, so
        // every consumer sees the same shape regardless of whether the
        // stored document uses the Phase 5 boolean form or the Phase 6
        // per-action form.
        permissionMatrix: normalizePermissions(profile.permissions || {}),
        ownership: normalizeOwnership(profile.ownership),
        legacy: false,
      };
    }
  } catch (err) {
    console.warn("[ICC] users/{uid} lookup failed.", err);
  }

  // --- Legacy bridge -----------------------------------------------------
  try {
    const legacy = await getAdminDoc(u.uid);
    if (legacy && legacy.role === "admin" && legacy.active === true) {
      // A legacy allowlist admin had unrestricted access, so the bridge
      // grants every section in the full (all-actions) form.
      const permissions = {};
      PERMISSION_KEYS.forEach((k) => {
        permissions[k] = true;
      });
      return {
        uid: u.uid,
        email: legacy.email || u.email || "",
        displayName: legacy.displayName || u.displayName || "Admin",
        role: ROLES.ADMIN,
        status: STATUS.ACTIVE,
        permissions,
        permissionMatrix: normalizePermissions(permissions),
        ownership: normalizeOwnership(null),
        legacy: true,
      };
    }
  } catch (err) {
    console.warn("[ICC] Legacy admins/{uid} lookup failed.", err);
  }

  return null;
}

/**
 * Backwards-compatible wrapper kept so every Phase 3B caller keeps working.
 * Returns the profile when the user may enter the Admin Panel at all —
 * i.e. an active admin/superadmin holding at least one permission —
 * otherwise null.
 */
export async function isCurrentUserAdmin(user) {
  const profile = await getProfile(user);
  if (!profile) return null;
  if (!isAdminRole(profile)) return null;
  if (!hasAnyPermission(profile)) return null;
  return profile;
}

/** Does the signed-in user's profile hold this permission key? */
export function profileCan(profile, permissionKey) {
  return hasPermission(profile, permissionKey);
}

/** Convenience re-exports so pages import roles/permissions from one place. */
export { ROLES, STATUS, isSuperAdmin, isAdminRole, hasPermission, hasAnyPermission };

/** Best-effort "last seen" stamp. Silent on failure — never blocks sign-in. */
export async function recordLogin(profile) {
  if (!profile || profile.legacy) return;
  try {
    await touchLastLogin(profile.uid);
  } catch (err) {
    /* non-critical */
  }
}

/* ==========================================================================
   ERROR MESSAGES
   ========================================================================== */

const AUTH_ERROR_MESSAGES = {
  "auth/invalid-email": {
    en: "That email address doesn't look valid.",
    ar: "البريد الإلكتروني غير صالح.",
  },
  "auth/user-disabled": {
    en: "This account has been disabled.",
    ar: "تم تعطيل هذا الحساب.",
  },
  "auth/user-not-found": {
    en: "Incorrect email or password.",
    ar: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
  },
  "auth/wrong-password": {
    en: "Incorrect email or password.",
    ar: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
  },
  "auth/invalid-credential": {
    en: "Incorrect email or password.",
    ar: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
  },
  "auth/missing-password": {
    en: "Please enter your password.",
    ar: "الرجاء إدخال كلمة المرور.",
  },
  "auth/email-already-in-use": {
    en: "An account with this email already exists. Try signing in instead.",
    ar: "يوجد حساب بهذا البريد الإلكتروني بالفعل. جرّب تسجيل الدخول بدلاً من ذلك.",
  },
  "auth/weak-password": {
    en: "Password is too weak — use at least 8 characters.",
    ar: "كلمة المرور ضعيفة جداً — استخدم 8 أحرف على الأقل.",
  },
  "auth/missing-email": {
    en: "Please enter your email address.",
    ar: "الرجاء إدخال البريد الإلكتروني.",
  },
  "auth/too-many-requests": {
    en: "Too many attempts. Please wait a moment and try again.",
    ar: "محاولات كثيرة. الرجاء الانتظار قليلاً ثم المحاولة مجدداً.",
  },
  "auth/network-request-failed": {
    en: "Network error. Check your connection and try again.",
    ar: "خطأ في الشبكة. تحقق من اتصالك وحاول مرة أخرى.",
  },
  "auth/popup-closed-by-user": {
    en: "The Google sign-in window was closed before finishing.",
    ar: "تم إغلاق نافذة تسجيل الدخول عبر Google قبل اكتمالها.",
  },
  "auth/popup-blocked": {
    en: "Your browser blocked the Google sign-in popup. Allow popups and try again.",
    ar: "منع المتصفح نافذة Google المنبثقة. اسمح بالنوافذ المنبثقة وحاول مجدداً.",
  },
  "auth/cancelled-popup-request": {
    en: "Another sign-in attempt is already in progress.",
    ar: "هناك محاولة تسجيل دخول أخرى قيد التنفيذ.",
  },
  "auth/unauthorized-domain": {
    en: "This domain isn't authorized in Firebase Authentication settings.",
    ar: "هذا النطاق غير مصرّح به في إعدادات المصادقة في Firebase.",
  },
  "auth/operation-not-allowed": {
    en: "This sign-in method isn't enabled in the Firebase Console.",
    ar: "طريقة تسجيل الدخول هذه غير مفعّلة في لوحة Firebase.",
  },
};

/**
 * Map a Firebase auth error to a bilingual, user-safe message.
 * Returns { en, ar } — never leaks raw Firebase error text to the UI.
 */
export function friendlyAuthError(err) {
  const code = err && err.code ? err.code : "";
  return (
    AUTH_ERROR_MESSAGES[code] || {
      en: "Sign-in failed. Please try again.",
      ar: "فشل تسجيل الدخول. الرجاء المحاولة مرة أخرى.",
    }
  );
}
