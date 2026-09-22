import { auth } from "./firebase.js";
import { API_URL, APP_SESSION_MS } from "./config.js";

export async function requireSession() {
  const user = auth.currentUser;
  const loginAt = Number(sessionStorage.getItem("kcwLoginAt") || 0);
  if (!user || !loginAt || Date.now() - loginAt >= APP_SESSION_MS) throw new Error("SESSION_EXPIRED");
  return user;
}

export async function api(action, data = {}) {
  const user = await requireSession();
  const token = await user.getIdToken();
  const response = await fetch(API_URL, {method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"}, body:JSON.stringify({action, token, data})});
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  const result = await response.json();
  if (!result.ok) throw new Error(result.code || result.message || "REQUEST_FAILED");
  return result;
}
