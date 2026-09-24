# Event image setup

Add EventImages.gs and the updated WebApp.gs to the Apps Script deployment. Configure these Script Properties:



Defaults are impishlycreative/calendar_manager, branch main, folder kcw-calendar-site/images, with public URLs under https://raw.githubusercontent.com/impishlycreative/calendar_manager/main/kcw-calendar-site/images/. The repository must be publicly readable for those URLs to work. Override IMAGE_PUBLIC_BASE_URL if using another public host. Only IMAGE_GITHUB_TOKEN must be configured for these defaults. Never put the token in chat or source code.

Filenames are automatic: event_<numeric ID>.jpg, .png or .webp. IDs combine the current timestamp and a cryptographic random integer. GitHub is checked before creating a file; a different-content collision triggers a fresh ID and up to three attempts. The pending filename persists for safe retries. Each replacement image gets a new ID so it cannot change an existing published image before the event save succeeds.

The editor stores pending JPEG/PNG/WebP images up to 2 MB in localStorage, scoped to the user and event, with one slot for a new event. Cancel/reload retains the image, filename, and image description, but not other unsaved event fields. Draft/Publish calls the authenticated uploadEventImage action and then saves the returned URL and imageAlt to Calendar. Local storage is cleared only after both operations succeed. Missing configuration or failed uploads retain the pending image.

The upload request data is {filename, mimeType, content}, using base64 content without a data URL prefix. Success returns {ok:true,image:"https://..."}. Existing identical files are reused on retry; different images with the same filename are rejected. Discarding a pending image restores the existing event image and does not delete remote files.

GitHub and Calendar are separate writes: a failed Calendar save can leave an uploaded file. Public hosting must serve the configured image folder; GitHub Pages deployment may delay availability. Uploads use the GitHub Contents API: https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents

Run focused checks from the repository root: node tests/event-images.test.cjs
Live GitHub/Calendar integration and browser layout testing require deployment and destination configuration.

