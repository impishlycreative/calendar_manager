// Firebase Web configuration is public-by-design. Paste the values Firebase gives you.
export const firebaseConfig = {
  apiKey: "PASTE_FIREBASE_API_KEY",
  authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  appId: "PASTE_FIREBASE_APP_ID"
};

// Apps Script Web App endpoint. The backend must verify the Firebase ID token
// and authorize the user before performing any calendar operation.
export const API_URL = "PASTE_APPS_SCRIPT_WEB_APP_URL";

// Force a fresh sign-in after one hour in this application.
export const APP_SESSION_MS = 60 * 60 * 1000;
