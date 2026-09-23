import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

import { auth } from "./firebase.js";
import { api, requireSession } from "./api.js";

const eventsEl = document.querySelector("#events");
const statusEl = document.querySelector("#status");
const dialog = document.querySelector("#eventDialog");
const form = document.querySelector("#eventForm");
const deleteDialog = document.querySelector("#deleteDialog");

let events = [];
let deleteId = null;
let editorStatus = "Draft";
let saving = false;

const esc = s =>
  String(s ?? "").replace(
    /[&<>'"]/g,
    c =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;"
      })[c]
  );

const showStatus = (msg, type = "") => {
  statusEl.textContent = msg;
  statusEl.className = `notice ${type}`;
  statusEl.hidden = false;
};

// Parse in an inert template, then escape the resulting text at output.
const descriptionText = value => {
  const template = document.createElement("template");
  template.innerHTML = String(value || "");
  template.content.querySelectorAll("script, style, iframe, object").forEach(node => node.remove());
  template.content.querySelectorAll("br").forEach(node => node.replaceWith("\n"));
  template.content.querySelectorAll("p, div, li").forEach(node => node.append("\n"));
  return template.content.textContent.trim();
};

const toLocal = v => {
  if (!v) return "";

  const d = new Date(v);
  const p = n => String(n).padStart(2, "0");

  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const fmt = v =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(v));

async function loadEvents() {
  eventsEl.innerHTML = '<div class="empty">Loading events…</div>';

  try {
    const r = await api("listEvents", { status: "All" });
    events = Array.isArray(r.events) ? r.events : [];
    render();
  } catch (e) {
    handleError(e);
  }
}

function render() {
  if (!events.length) {
    eventsEl.innerHTML = '<div class="empty">No upcoming events.</div>';
    return;
  }

  eventsEl.innerHTML = events
    .map(
      e => `
        <article class="event-card">
          <div>
            <strong class="event-status">${e.status === "Published" ? "Published" : "Draft"}</strong>
            <div class="event-date">${esc(fmt(e.start))}</div>
            <h2>${esc(e.title)}</h2>
            ${
              e.location
                ? `<p class="location">${esc(e.location)}</p>`
                : ""
            }
            ${e.description ? `<p>${esc(descriptionText(e.description))}</p>` : ""}
          </div>

          <div class="event-actions">
            <button class="secondary edit" data-id="${esc(e.id)}">
              Edit
            </button>
            <button class="danger-outline delete" data-id="${esc(e.id)}">
              Delete
            </button>
          </div>
        </article>
      `
    )
    .join("");
}

function openEditor(e = null) {
  editorStatus = e?.status === "Published" ? "Published" : "Draft";
  document.querySelector("#editorError").hidden = true;
  document.querySelector("#editorStatus").textContent = editorStatus;
  document.querySelector("#publishEvent").textContent =
    editorStatus === "Published" ? "Save Changes" : "Publish";
  document.querySelector("#dialogTitle").textContent = e
    ? "Edit event"
    : "Add event";

  document.querySelector("#eventId").value = e?.id || "";
  document.querySelector("#title").value = e?.title || "";
  document.querySelector("#type").value = e?.type || "Meeting";
  document.querySelector("#featured").checked = e?.featured === true;
  document.querySelector("#hoverText").value = e?.hoverText || "";
  document.querySelector("#start").value = toLocal(e?.start);
  document.querySelector("#end").value = toLocal(e?.end);
  document.querySelector("#location").value = e?.location || "";
  document.querySelector("#description").value = e?.description || "";

  dialog.showModal();
}

async function handleError(e, target = null) {

  if (e.message === "SESSION_EXPIRED" || e.code === "INVALID_TOKEN") {
    await signOut(auth);
    location.replace("index.html");
    return;
  }

  const messages = {
    NOT_AUTHORIZED: "Your account is not authorized to change calendar events.",
    SERVER_CONFIG_ERROR: "The calendar service is not configured correctly. Contact the calendar administrator.",
    NOT_FOUND: "This event no longer exists. Reload the calendar.",
    INTERNAL_ERROR: "The calendar service could not complete the request. Check the Apps Script execution log."
  };
  const code = e.code || (/^HTTP_/.test(e.message) ? e.message : "");
  const message = messages[code] || (code === "INVALID_REQUEST"
    ? e.message
    : "The request could not be completed. Check your connection and try again.");
  const detail = message + (code ? " (" + code + ")" : "");
  if (target) {
    target.textContent = detail;
    target.hidden = false;
  } else {
    showStatus(detail, "error-box");
  }
}

document.querySelector("#addButton").onclick = () => openEditor();

document.querySelector("#closeDialog").onclick = () => dialog.close();

document.querySelector("#cancelButton").onclick = () => dialog.close();

document.querySelector("#logoutButton").onclick = async () => {
  sessionStorage.clear();
  await signOut(auth);
  location.replace("index.html");
};

eventsEl.addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;

  const item = events.find(x => String(x.id) === b.dataset.id);

  if (b.classList.contains("edit")) {
    openEditor(item);
  }

  if (b.classList.contains("delete")) {
    deleteId = b.dataset.id;

    document.querySelector("#deleteMessage").textContent =
      `Delete “${item?.title || "this event"}”? This cannot be undone.`;

    deleteDialog.showModal();
  }
});

form.addEventListener("submit", async e => {
  e.preventDefault();
  if (saving) return;

  const id = document.querySelector("#eventId").value;
  const status = e.submitter?.value === "Published" ? "Published" : "Draft";

  const errorEl = document.querySelector("#editorError");
  errorEl.hidden = true;
  const start = new Date(document.querySelector("#start").value);
  const end = new Date(document.querySelector("#end").value);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    errorEl.textContent = "Choose a valid end time after the start time.";
    errorEl.hidden = false;
    return;
  }

  if (id && editorStatus === "Published" && status === "Draft" &&
      !window.confirm("Save as draft and remove this event from the public calendar? It will no longer be featured.")) {
    return;
  }

  const payload = {
    id,
    status,
    title: document.querySelector("#title").value.trim(),
    type: document.querySelector("#type").value,
    featured: status === "Published" && document.querySelector("#featured").checked,
    hoverText: document.querySelector("#hoverText").value.trim() || null,
    start: start.toISOString(),
    end: end.toISOString(),
    location: document.querySelector("#location").value.trim(),
    description: document.querySelector("#description").value.trim()
  };

  saving = true;
  const buttons = form.querySelectorAll("button");
  buttons.forEach(button => { button.disabled = true; });
  try {
    await api(id ? "updateEvent" : "createEvent", payload);

    dialog.close();

    showStatus(
      status === "Draft" ? "Event saved as draft." : "Event published.",
      "success"
    );

    await loadEvents();
  } catch (err) {
    await handleError(err, errorEl);
  } finally {
    saving = false;
    buttons.forEach(button => { button.disabled = false; });
  }
});

dialog.addEventListener("cancel", e => {
  if (saving) e.preventDefault();
});

document.querySelector("#cancelDelete").onclick = () => deleteDialog.close();

document.querySelector("#confirmDelete").onclick = async () => {
  try {
    await api("deleteEvent", { id: deleteId });

    deleteDialog.close();
    showStatus("Event deleted.", "success");

    await loadEvents();
  } catch (e) {
    handleError(e);
  }
};

onAuthStateChanged(auth, async user => {
  if (!user) {
    location.replace("index.html");
    return;
  }

  try {
    await requireSession();

    document.querySelector("#userEmail").textContent =
      user.email || "Signed in";

    await loadEvents();
  } catch (e) {
    handleError(e);
  }
});
