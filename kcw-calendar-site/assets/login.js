import { signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { auth } from "./firebase.js";
import { firebaseConfig, API_URL, APP_SESSION_MS } from "./config.js";

const form = document.querySelector("#loginForm");
const error = document.querySelector("#loginError");
const button = document.querySelector("#loginButton");
const warning = document.querySelector("#configWarning");
const configured = !firebaseConfig.apiKey.startsWith("PASTE_") && !API_URL.startsWith("PASTE_");
warning.hidden = configured;

form.addEventListener("submit", async (event) => {
  event.preventDefault(); error.textContent = ""; button.disabled = true;
  try {
    if (!configured) throw new Error("Site configuration is incomplete.");
    const email = document.querySelector("#email").value.trim();
    const password = document.querySelector("#password").value;
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const token = await credential.user.getIdToken(true);
    const response = await fetch(API_URL, {method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"}, body:JSON.stringify({action:"authorize", token})});
    const result = await response.json();
    if (!result.ok) { await signOut(auth); throw new Error(result.message || "This account is not authorized."); }
    sessionStorage.setItem("kcwLoginAt", String(Date.now()));
    sessionStorage.setItem("kcwExpiresAt", String(Date.now() + APP_SESSION_MS));
    location.replace("calendar.html");
  } catch (e) {
    console.error(e);
    error.textContent = e.message === "Site configuration is incomplete." ? e.message : "The email address or password is incorrect, or this account is not authorized.";
  } finally { button.disabled = false; }
});
