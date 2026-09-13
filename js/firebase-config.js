/**
 * firebase-config.js
 * -----------------------------------------------------------------------
 * Placeholder Firebase project configuration.
 *
 * DO NOT commit real credentials here in a public repository — Firebase
 * client config is not a secret in the same way a service-account key is,
 * but it should still point at YOUR project, not be copy-pasted blindly.
 *
 * Replace every "YOUR_..." value with the config object from:
 * Firebase Console → Project settings → General → Your apps → SDK setup.
 *
 * This file is imported by firebase-init.js. Nothing in PHASE 1 actually
 * calls Firebase yet — this only establishes the structure so later
 * phases (Auth, Firestore CRUD) can build on it without refactoring.
 * ------------------------------------------------------------------------
 */

export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
};
