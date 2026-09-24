import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

import { auth } from "./firebase.js";
import { api, requireSession } from "./api.js";
import { createImageEditor, safeImageUrl } from "./event-image.js";

const eventsEl = document.querySelector("#events");
const statusEl = document.querySelector("#status");
const dialog = document.querySelector("#eventDialog");
const form = document.querySelector("#eventForm");
const deleteDialog = document.querySelector("#deleteDialog");
const imageEditor = createImageEditor(() => auth.currentUser?.uid || "");

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
            ${e.featured === true ? '<span class="featured-badge">★ Featured</span>' : ""}
            <div class="event-date">${esc(fmt(e.start))}</div>
            <h2><button type="button" class="event-name preview" data-id="${esc(e.id)}" aria-haspopup="dialog">${esc(e.title)}</button></h2>
            ${
              e.location
                ? `<p class="location">${esc(e.location)}</p>`
                : ""
            }
            ${e.description ? `<p>${esc(descriptionText(e.description))}</p>` : ""}
          </div>

          <div class="event-actions">
            <button type="button" class="secondary preview" data-id="${esc(e.id)}" aria-haspopup="dialog">Preview</button>
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

const previewDialog = document.querySelector("#previewDialog");
const hoverPreview = document.querySelector("#hoverPreview");
let hoverAnchor = null;
let hoverTimer;

// Public-site typography and date-card layout; all event content stays inert text.
function previewMarkup(event, compact = false) {
  const dateLabel = (value, options, fallback) => {
    const date = value ? new Date(value) : null;
    return date && Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", ...options }).format(date)
      : fallback;
  };
  const day = { weekday: "long", month: "long", day: "numeric", year: "numeric" };
  const time = { hour: "numeric", minute: "2-digit", timeZoneName: "short" };
  const startDay = dateLabel(event.start, day, "Date to be confirmed");
  const endDay = dateLabel(event.end, day, "");
  const description = descriptionText(event.description)
    .replace(/\[KCW_METADATA\][\s\S]*?(?:\[\/KCW_METADATA\]|$)/gi, "").trim();
  return `<article class="site-preview${compact ? " site-preview-compact" : ""}">
    <div class="preview-date" aria-hidden="true">
      <span>${esc(dateLabel(event.start, { month: "short" }, "TBD"))}</span>
      <strong>${esc(dateLabel(event.start, { day: "2-digit" }, "—"))}</strong>
      <small>${esc(dateLabel(event.start, { year: "numeric" }, ""))}</small>
    </div>
    <div class="preview-body">
      <span class="preview-type">${event.featured ? "Featured Event · " : ""}${esc(event.type || "Meeting")}</span>
      <h3>${esc(event.title || "Untitled event")}</h3>
      ${safeImageUrl(event.image) ? `<img class="preview-image" src="${esc(safeImageUrl(event.image))}" alt="${esc(event.imageAlt || "")}">` : ""}
      ${compact && event.hoverText ? `<p>${esc(event.hoverText)}</p>` : ""}
      <p class="preview-description">${esc(description || "Description to come.")}</p>
      <div class="preview-details">
        <div><strong>When</strong>${esc(startDay)}${endDay && endDay !== startDay ? ` – ${esc(endDay)}` : ""}<br>${esc(dateLabel(event.start, time, "Time to be confirmed"))}${event.end ? ` – ${esc(dateLabel(event.end, time, "End time to be confirmed"))}` : ""}</div>
        <div><strong>Where</strong>${esc(event.location || "Location to be confirmed")}</div>
      </div>
    </div>
  </article>`;
}

function hideHover() {
  clearTimeout(hoverTimer);
  hoverPreview.hidden = true;
  hoverAnchor?.removeAttribute("aria-describedby");
  hoverAnchor = null;
}

function openPreview(event) {
  hideHover();
  document.querySelector("#previewContent").innerHTML = previewMarkup(event);
  previewDialog.showModal();
}

document.querySelector("#closePreview").onclick = () => previewDialog.close();
document.querySelector("#previewEditor").onclick = () => {
  const value = id => document.getElementById(id).value.trim();
  openPreview({ title: value("title"), type: value("type"), start: value("start"),
    end: value("end"), location: value("location"), description: value("description"),
    hoverText: value("hoverText"), featured: document.querySelector("#featured").checked,
    ...imageEditor.preview() });
};

function showHover(anchor) {
  clearTimeout(hoverTimer);
  if (hoverAnchor === anchor) return;
  hideHover();
  const event = events.find(item => String(item.id) === anchor.dataset.id);
  if (!event) return;
  hoverAnchor = anchor;
  anchor.setAttribute("aria-describedby", "hoverPreview");
  hoverPreview.innerHTML = previewMarkup(event, true);
  hoverPreview.hidden = false;
  const rect = anchor.getBoundingClientRect();
  const width = hoverPreview.offsetWidth;
  const height = hoverPreview.offsetHeight;
  hoverPreview.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
  const top = rect.bottom + 6 + height <= window.innerHeight - 8
    ? rect.bottom + 6 : rect.top - height - 6;
  hoverPreview.style.top = `${Math.max(8, top)}px`;
}

eventsEl.addEventListener("pointerover", event => {
  const anchor = event.target.closest(".event-name");
  if (anchor && event.pointerType !== "touch") showHover(anchor);
});
eventsEl.addEventListener("pointerout", event => {
  if (event.target.closest(".event-name")) hoverTimer = setTimeout(hideHover, 180);
});
eventsEl.addEventListener("focusin", event => {
  if (event.target.matches(".event-name")) showHover(event.target);
});
eventsEl.addEventListener("focusout", hideHover);
hoverPreview.addEventListener("pointerenter", () => clearTimeout(hoverTimer));
hoverPreview.addEventListener("pointerleave", hideHover);
document.addEventListener("keydown", event => { if (event.key === "Escape") hideHover(); });
window.addEventListener("resize", hideHover);
window.addEventListener("scroll", event => {
  if (!hoverPreview.contains(event.target)) hideHover();
}, true);

function openEditor(e = null) {
  hideHover();
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
  imageEditor.open(e);

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
  const message = messages[code] || (code.startsWith("IMAGE_") || code === "INVALID_REQUEST"
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

  if (b.classList.contains("preview") && item) openPreview(item);

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
  const buttons = form.querySelectorAll("button, input, textarea, select");
  const disabledStates = Array.from(buttons, button => button.disabled);
  buttons.forEach(button => { button.disabled = true; });
  try {
    Object.assign(payload, await imageEditor.forSave(api));
    await api(id ? "updateEvent" : "createEvent", payload);
    const clearedImage = imageEditor.saved();

    dialog.close();

    showStatus(
      (status === "Draft" ? "Event saved as draft." : "Event published.") + (clearedImage ? "" : " The local image copy could not be cleared from browser storage."),
      "success"
    );

    await loadEvents();
  } catch (err) {
    if (!err.code && !/^HTTP_|SESSION_EXPIRED/.test(err.message)) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    } else await handleError(err, errorEl);
  } finally {
    saving = false;
    buttons.forEach((button, index) => { button.disabled = disabledStates[index]; });
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
