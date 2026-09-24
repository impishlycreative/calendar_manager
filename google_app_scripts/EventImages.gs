/** GitHub image uploads. All settings and credentials stay in Script Properties. */
function uploadEventImage_(data) {
  requireObject_(data, "Image data is required.");
  const extensions = {"image/jpeg":"jpg", "image/png":"png", "image/webp":"webp"};
  const extension = extensions[data.mimeType];
  if (!extension || typeof data.filename !== "string" ||
      !new RegExp("^event_[0-9]{1,40}\\." + extension + "$").test(data.filename) ||
      typeof data.content !== "string" || data.content.length > 2796204 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(data.content)) {
    throw new WebAppError("INVALID_REQUEST", "Choose a valid image and filename (JPEG, PNG or WebP, up to 2 MB).");
  }
  let bytes;
  try { bytes = Utilities.base64Decode(data.content); }
  catch (error) { throw new WebAppError("INVALID_REQUEST", "Invalid image content."); }
  const b = bytes.map(value => value & 255);
  const signature = data.mimeType === "image/png" ? [137,80,78,71,13,10,26,10].every((v,i) => b[i] === v)
    : data.mimeType === "image/jpeg" ? b[0] === 255 && b[1] === 216 && b[2] === 255
    : b.slice(0,4).join() === "82,73,70,70" && b.slice(8,12).join() === "87,69,66,80";
  if (!signature || bytes.length > 2097152) throw new WebAppError("INVALID_REQUEST", "Invalid image content or size.");
  const prop = key => getScriptProperty_(key, true);
  const repo = prop("IMAGE_GITHUB_REPOSITORY") || "impishlycreative/calendar_manager";
  const branch = prop("IMAGE_GITHUB_BRANCH") || "main";
  const folder = prop("IMAGE_GITHUB_FOLDER") || "kcw-calendar-site/images";
  const token = prop("IMAGE_GITHUB_TOKEN");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || !branch || !token ||
      !folder || folder.split("/").some(p => !/^[A-Za-z0-9_-]+$/.test(p))) {
    throw new WebAppError("IMAGE_UPLOAD_NOT_CONFIGURED", "GitHub image uploads are not configured yet. Your image remains stored in this browser.");
  }
  const path = folder + "/" + data.filename;
  const url = "https://api.github.com/repos/" + repo + "/contents/" + path.split("/").map(encodeURIComponent).join("/");
  const headers = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10" };
  // Content comparison makes retries safe and prevents replacing another event's image.
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_1,
    Utilities.newBlob("blob " + bytes.length + "\u0000").getBytes().concat(bytes));
  const sha = digest.map(v => ((v & 255) + 256).toString(16).slice(-2)).join("");
  const existing = UrlFetchApp.fetch(url + "?ref=" + encodeURIComponent(branch), {headers, muteHttpExceptions:true});
  if (existing.getResponseCode() === 200) {
    const file = JSON.parse(existing.getContentText());
    if (file.type !== "file" || file.sha !== sha) throw new WebAppError("IMAGE_NAME_CONFLICT", "That filename is already in use. Retry to generate another image filename.");
  } else if (existing.getResponseCode() === 404) {
    const response = UrlFetchApp.fetch(url, {method:"put", headers, contentType:"application/json", muteHttpExceptions:true,
      payload:JSON.stringify({message:"Add calendar image " + data.filename, content:data.content, branch})});
    if (response.getResponseCode() !== 201) throw new WebAppError("IMAGE_UPLOAD_FAILED", "GitHub could not store the image. Check the destination and access settings, then retry. Your local image is retained.");
  } else {
    throw new WebAppError("IMAGE_UPLOAD_FAILED", "GitHub could not be reached or access was denied. Your local image is retained.");
  }
  return "images/" + data.filename;
}
