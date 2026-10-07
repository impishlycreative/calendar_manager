/**
 * Event-specific Facebook/Open Graph share artifact publishing.
 *
 * Share files are staged in this repository and then copied to
 * kemptvillecw/mainsite:dev by GitHub Actions. GitHub credentials
 * remain in Apps Script Script Properties.
 */
function eventShareConfig_() {
  const prop = key => getScriptProperty_(key, true);
  const repo = prop("SHARE_GITHUB_REPOSITORY") || prop("IMAGE_GITHUB_REPOSITORY") || "impishlycreative/calendar_manager";
  const branch = prop("SHARE_GITHUB_BRANCH") || prop("IMAGE_GITHUB_BRANCH") || "main";
  const folder = prop("SHARE_GITHUB_FOLDER") || "kcw-calendar-site/share/events";
  const token = prop("SHARE_GITHUB_TOKEN") || prop("IMAGE_GITHUB_TOKEN");
  const siteBase = (prop("SHARE_PUBLIC_SITE_URL") || "https://www.kemptvillecreativewriters.com/").replace(/\/+$/, "") + "/";

  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) ||
      !/^[A-Za-z0-9._\/-]+$/.test(branch) ||
      !token ||
      !folder || folder.split("/").some(part => !/^[A-Za-z0-9_.-]+$/.test(part)) ||
      !/^https:\/\/[^?#]+\/$/.test(siteBase)) {
    throw new WebAppError(
      "SHARE_PUBLISH_NOT_CONFIGURED",
      "Facebook share-file publishing is not configured correctly."
    );
  }

  return { repo, branch, folder, token, siteBase };
}

function eventShareFilename_(eventId) {
  eventId = String(eventId || "").trim();
  if (!eventId || eventId.length > 1024 || !/^[A-Za-z0-9_\-@.]+$/.test(eventId)) {
    throw new WebAppError("INVALID_REQUEST", "Event id is not valid for sharing.");
  }
  return eventId + ".html";
}

function eventShareHtmlEscape_(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function eventShareDescription_(event) {
  const source = String(event.description || "").replace(/\s+/g, " ").trim() ||
    ("Join Kemptville Creative Writers for " + (event.eventTitle || event.title || "this event") + ".");
  return source.length <= 320 ? source : source.slice(0, 317).trim() + "…";
}

function eventShareImageUrl_(config, image) {
  image = String(image || "").trim();
  if (!image) return "";
  if (/^https:\/\/[^\s]+$/i.test(image)) return image;
  if (/^images\/[A-Za-z0-9_.\/-]+$/.test(image) && image.indexOf("..") === -1) {
    return config.siteBase + image;
  }
  return "";
}

function eventShareUrls_(config, eventId) {
  const filename = eventShareFilename_(eventId);
  return {
    filename,
    share: config.siteBase + "share/events/" + encodeURIComponent(filename),
    destination: config.siteBase + "schedule.html#" + encodeURIComponent(eventId),
    retiredDestination: config.siteBase + "schedule.html"
  };
}

function buildEventShareHtml_(event, retired, reason) {
  requireObject_(event, "Event data is required.");
  const config = eventShareConfig_();
  const urls = eventShareUrls_(config, event.id);
  const baseTitle = String(event.eventTitle || event.title || "KCW event").trim();
  const title = retired ? baseTitle + " — no longer available" : baseTitle;
  const description = retired
    ? String(reason || "This event is no longer publicly available.")
    : eventShareDescription_(event);
  const destination = retired ? urls.retiredDestination : urls.destination;
  const image = retired ? "" : eventShareImageUrl_(config, event.image);
  const imageAlt = String(event.imageAlt || event.speaker || "").trim();
  const imageMeta = image
    ? `\n  <meta property="og:image" content="${eventShareHtmlEscape_(image)}">` +
      (imageAlt ? `\n  <meta property="og:image:alt" content="${eventShareHtmlEscape_(imageAlt)}">` : "")
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,follow">
  <title>${eventShareHtmlEscape_(title)} | Kemptville Creative Writers</title>
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Kemptville Creative Writers">
  <meta property="og:title" content="${eventShareHtmlEscape_(title)}">
  <meta property="og:description" content="${eventShareHtmlEscape_(description)}">
  <meta property="og:url" content="${eventShareHtmlEscape_(urls.share)}">${imageMeta}
  <link rel="canonical" href="${eventShareHtmlEscape_(destination)}">
  <meta http-equiv="refresh" content="0;url=${eventShareHtmlEscape_(destination)}">
</head>
<body>
  <main>
    <h1>${eventShareHtmlEscape_(title)}</h1>
    <p>${eventShareHtmlEscape_(description)}</p>
    <p><a href="${eventShareHtmlEscape_(destination)}">View this event on Kemptville Creative Writers</a></p>
  </main>
</body>
</html>
`;
}

function eventShareBlobSha_(content) {
  const bytes = Utilities.newBlob(content, "text/html", "event-share.html").getBytes();
  const prefix = Utilities.newBlob("blob " + bytes.length + "\u0000").getBytes();
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_1,
    prefix.concat(bytes)
  );
  return digest.map(value => ((value & 255) + 256).toString(16).slice(-2)).join("");
}

function eventShareGitHubTarget_(config, eventId) {
  const filename = eventShareFilename_(eventId);
  const path = config.folder + "/" + filename;
  const url = "https://api.github.com/repos/" + config.repo + "/contents/" +
    path.split("/").map(encodeURIComponent).join("/");
  const headers = {
    Authorization: "Bearer " + config.token,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2026-03-10"
  };
  return { filename, path, url, headers };
}

function writeEventShareArtifact_(event, options) {
  options = options || {};
  const config = eventShareConfig_();
  const target = eventShareGitHubTarget_(config, event.id);
  const existing = UrlFetchApp.fetch(
    target.url + "?ref=" + encodeURIComponent(config.branch),
    { headers: target.headers, muteHttpExceptions: true }
  );
  const existingCode = existing.getResponseCode();

  if (existingCode === 404 && options.createIfMissing === false) {
    return { ok: true, state: "not-required", path: target.path };
  }
  if (existingCode !== 200 && existingCode !== 404) {
    throw new WebAppError(
      "SHARE_PUBLISH_FAILED",
      "GitHub could not read the event share file."
    );
  }

  let existingFile = null;
  if (existingCode === 200) {
    try { existingFile = JSON.parse(existing.getContentText()); }
    catch (error) { existingFile = null; }
    if (!existingFile || existingFile.type !== "file" || !existingFile.sha) {
      throw new WebAppError("SHARE_PUBLISH_FAILED", "GitHub returned an invalid event share file.");
    }
  }

  const content = buildEventShareHtml_(event, Boolean(options.retired), options.reason);
  const contentSha = eventShareBlobSha_(content);
  if (existingFile && existingFile.sha === contentSha) {
    return {
      ok: true,
      state: "unchanged",
      path: target.path,
      url: eventShareUrls_(config, event.id).share
    };
  }

  const payload = {
    message: (existingFile ? "Update" : "Add") + " calendar event share " + target.filename,
    content: Utilities.base64Encode(content, Utilities.Charset.UTF_8),
    branch: config.branch
  };
  if (existingFile) payload.sha = existingFile.sha;

  const response = UrlFetchApp.fetch(target.url, {
    method: "put",
    headers: target.headers,
    contentType: "application/json",
    muteHttpExceptions: true,
    payload: JSON.stringify(payload)
  });
  const code = response.getResponseCode();
  if ((existingFile && code !== 200) || (!existingFile && code !== 201)) {
    throw new WebAppError(
      "SHARE_PUBLISH_FAILED",
      "GitHub could not store the event share file."
    );
  }

  return {
    ok: true,
    state: existingFile ? "updated" : "created",
    path: target.path,
    url: eventShareUrls_(config, event.id).share
  };
}

function syncEventShareArtifact_(event) {
  requireObject_(event, "Event data is required.");
  if (event.status === "Published") {
    return writeEventShareArtifact_(event, { createIfMissing: true });
  }
  return writeEventShareArtifact_(event, {
    createIfMissing: false,
    retired: true,
    reason: "This event is not currently published."
  });
}

function retireEventShareArtifact_(event, reason) {
  return writeEventShareArtifact_(event, {
    createIfMissing: false,
    retired: true,
    reason: reason || "This event is no longer publicly available."
  });
}

function eventShareFailure_(error) {
  console.error("Event share publishing failed: " + (error && error.code ? error.code : "SHARE_PUBLISH_FAILED"));
  return {
    ok: false,
    code: error && error.code ? error.code : "SHARE_PUBLISH_FAILED",
    message: error instanceof WebAppError
      ? error.message
      : "The event was saved, but its Facebook share file could not be published."
  };
}

function trySyncEventShareArtifact_(event) {
  try { return syncEventShareArtifact_(event); }
  catch (error) { return eventShareFailure_(error); }
}

function tryRetireEventShareArtifact_(event, reason) {
  try { return retireEventShareArtifact_(event, reason); }
  catch (error) { return eventShareFailure_(error); }
}

/** One-time/manual maintenance helper for currently visible public events. */
function backfillPublishedEventShares_() {
  const manager = getCalendarManager_();
  const results = { createdOrUpdated: 0, failed: 0, items: [] };
  manager.getUpcomingEvents().forEach(event => {
    const result = trySyncEventShareArtifact_(event);
    results.items.push({ id: event.id, ok: result.ok, state: result.state || null, code: result.code || null });
    if (result.ok) results.createdOrUpdated += 1;
    else results.failed += 1;
  });
  return results;
}
