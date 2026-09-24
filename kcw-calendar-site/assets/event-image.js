// Only pending images are stored here. Uploads use the authenticated backend.
const prefix = "kcw:event-image:v1:";
const types = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const safeImageUrl = value => {
  if (!value) return "";
  // Keep page-relative paths intact: the browser supplies the site's directory.
  if (/^images\/[A-Za-z0-9_-]+\.(jpg|png|webp)$/.test(value)) return value;
  if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "";
  } catch { return ""; }
};

const newFilename = extension => `event_${Date.now()}${crypto.getRandomValues(new Uint32Array(1))[0]}.${extension}`;

export function createImageEditor(userId) {
  const file = document.querySelector("#imageFile");
  const choose = document.querySelector("#chooseImage");
  const selection = document.querySelector("#imageSelection");
  choose.onclick = () => file.click();
  const filename = document.querySelector("#imageFilename");
  const alt = document.querySelector("#imageAlt");
  const thumbnail = document.querySelector("#imageThumbnail");
  const notice = document.querySelector("#imageNotice");
  const discard = document.querySelector("#discardImage");
  let key, pending = null, existing = {}, generation = 0, reading = false;
  const message = text => { notice.textContent = text; };
  const persist = value => {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch { throw new Error("This image could not be stored in your browser. Free some browser storage or choose a smaller image."); }
  };
  const draw = () => {
    const src = safeImageUrl(pending?.dataUrl || existing.image);
    if (src) thumbnail.src = src; else thumbnail.removeAttribute("src");
    thumbnail.hidden = !src;
    thumbnail.alt = alt.value;
    filename.value = pending?.filename || existing.imageFilename || (src ? new URL(src, document.baseURI).pathname.split("/").pop() : "");
    selection.textContent = pending ? `Selected image: ${pending.originalName || pending.filename} (stored in this browser)` : src ? `Saved image: ${filename.value}` : "No image selected.";
    choose.textContent = src ? "Replace image" : "Choose image";
    filename.disabled = !src;
    discard.hidden = !pending;
    message(pending ? "Image kept in this browser. It will upload to GitHub when you save as draft or publish." : "Choose a JPEG, PNG, or WebP image up to 2 MB. Images stay in this browser until uploaded on save.");
  };
  file.addEventListener("change", async () => {
    const selected = file.files[0];
    if (!selected) return;
    const version = ++generation;
    reading = true;
    try {
      if (!types[selected.type] || selected.size > 2 * 1024 * 1024) throw new Error("Choose a JPEG, PNG, or WebP image no larger than 2 MB.");
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("The image could not be read."));
        reader.readAsDataURL(selected);
      });
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      if (version !== generation) return;
      const generatedName = newFilename(types[selected.type]);
      const next = { dataUrl, filename: generatedName, originalName: selected.name, imageAlt: alt.value, mimeType: selected.type };
      persist(next);
      pending = next;
      draw();
    } catch (error) {
      if (version === generation) message(error.message || "This image cannot be opened. Choose another image.");
    } finally {
      if (version === generation) { reading = false; file.value = ""; }
    }
  });
  alt.addEventListener("input", () => {
    thumbnail.alt = alt.value;
    if (pending) {
      try { const next = {...pending, imageAlt: alt.value}; persist(next); pending = next; }
      catch (error) { message(error.message); }
    }
  });
  discard.onclick = () => {
    try { localStorage.removeItem(key); }
    catch { message("The pending image could not be removed from browser storage."); return; }
    generation++;
    reading = false;
    pending = null;
    alt.value = existing.imageAlt || "";
    draw();
  };
  return {
    open(event) {
      generation++;
      reading = false;
      existing = event || {};
      key = prefix + encodeURIComponent(userId()) + ":" + encodeURIComponent(event?.id || "new");
      pending = null;
      let restoreError = "";
      try {
        const saved = JSON.parse(localStorage.getItem(key) || "null");
        if (saved && types[saved.mimeType] && safeImageUrl(saved.dataUrl).startsWith("data:")) {
          pending = saved;
          if (!/^event_[0-9]+\.(jpg|png|webp)$/.test(pending.filename)) {
            pending = {...pending, filename: newFilename(types[pending.mimeType])};
            persist(pending);
          }
        }
      } catch { restoreError = "Browser storage is unavailable or the saved image could not be restored."; }
      file.value = "";
      alt.value = pending?.imageAlt || existing.imageAlt || "";
      draw();
      if (restoreError) message(restoreError);
    },
    preview() { return {image: pending?.dataUrl || existing.image || "", imageAlt: alt.value}; },
    async forSave(api) {
      if (reading) throw new Error("Please wait for the image to finish loading.");
      if ((pending || existing.image) && !alt.value.trim()) throw new Error("Add an image description before saving.");
      if (pending) {
        let result;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            result = await api("uploadEventImage", {filename: pending.filename, mimeType: pending.mimeType, content: pending.dataUrl.split(",")[1]});
            break;
          } catch (error) {
            if (error.code !== "IMAGE_NAME_CONFLICT" || attempt === 2) throw error;
            const next = {...pending, filename: newFilename(types[pending.mimeType])};
            persist(next);
            pending = next;
            filename.value = next.filename;
          }
        }
        const address = safeImageUrl(result.image);
        if (!address || address.startsWith("data:")) throw new Error("The upload did not return an image address. Your image is still stored in this browser.");
        return {image: result.image, imageFilename: pending.filename, imageAlt: alt.value.trim()};
      }
      return {image: existing.image || "", imageFilename: filename.value, imageAlt: alt.value.trim()};
    },
    saved() {
      try { localStorage.removeItem(key); pending = null; return true; }
      catch { return false; }
    }
  };
}

