// Firebase Web configuration is public-by-design. Paste the values Firebase gives you.
export const firebaseConfig = {
  apiKey: "AIzaSyB6qd1JVsltIV0tSi3BYN-qVHhRtajisTE",
  authDomain: "kemptville-creative-writ-cf643.firebaseapp.com",
  projectId: "kemptville-creative-writ-cf643",
  storageBucket: "kemptville-creative-writ-cf643.firebasestorage.app",
  messagingSenderId: "892988687204",
  appId: "1:892988687204:web:d2524166fbb5d4d22bf071"
};

// Apps Script Web App endpoint. The backend must verify the Firebase ID token
// and authorize the user before performing any calendar operation.
export const API_URL = "https://script.google.com/macros/s/AKfycbyvxfJniOdH81RLvZT2_0_yicxGIcrlTUuTvzXw96u0qnVUQ5ZllW84JvsnsY4DD0jh/exec";

// Force a fresh sign-in after one hour in this application.
export const APP_SESSION_MS = 60 * 60 * 1000;
