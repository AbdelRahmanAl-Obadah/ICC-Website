/**
 * firebase-init.js
 * -----------------------------------------------------------------------
 * Initializes the Firebase app once and exports the app/db/auth handles
 * that every other Firebase-aware module (firestore.js, auth.js) should
 * import from — never re-initialize Firebase elsewhere.
 *
 * Uses the Firebase modular (v9+) SDK loaded from the CDN as ES modules,
 * so no build step or npm install is required for this static site.
 *
 * NOTE: This module is written defensively for PHASE 1. Because
 * firebase-config.js still contains placeholder values, initializeApp()
 * is wrapped in a try/catch so pages that don't need Firebase yet
 * (every page in this phase) never break if the config hasn't been
 * filled in. Once real config values are added, this becomes a normal,
 * unguarded Firebase bootstrap.
 * ------------------------------------------------------------------------
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

let app = null;
let db = null;
let auth = null;

const isPlaceholderConfig = Object.values(firebaseConfig).some((value) =>
  String(value).startsWith("YOUR_")
);

if (!isPlaceholderConfig) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
} else {
  // Expected in PHASE 1 — no real project is connected yet.
  console.info(
    "[ICC] Firebase config is still a placeholder. Add real values to " +
      "js/firebase-config.js before Firestore/Auth features are used."
  );
}

export { app, db, auth };
