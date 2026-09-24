const KCW_FIREBASE_PROJECT_ID = "kemptville-creative-writ-cf643";

const KCW_ALLOWED_ACTIONS = {
  authorize: true,
  listEvents: true,
  createEvent: true,
  updateEvent: true,
  uploadEventImage: true,
  deleteEvent: true
};


class ScriptPropertiesResourceManager {

  constructor() {
    this.properties =
      PropertiesService.getScriptProperties();
  }

  get(key) {
    return this.properties.getProperty(key);
  }
}


class WebAppError extends Error {

  constructor(code, message) {
    super(message);
    this.name = "WebAppError";
    this.code = code;
  }
}


function doGet() {
  return jsonResponse_({
    ok: true,
    status: "online"
  });
}


function doPost(e) {

  try {

    const request =
      parseRequest_(e);

    requireAuthorizedIdentity_(
      request.token
    );

    switch (request.action) {

      case "authorize":
        return jsonResponse_({ ok: true });

      case "listEvents":
        return handleListEvents_(request);

      case "createEvent":
        return handleCreateEvent_(request);

      case "updateEvent":
        return handleUpdateEvent_(request);

      case "uploadEventImage":
        return jsonResponse_({ ok: true, image: uploadEventImage_(request.data) });

      case "deleteEvent":
        return handleDeleteEvent_(request);

      default:
        throw new WebAppError(
          "INVALID_ACTION",
          "Unknown action."
        );
    }

  } catch (error) {

    return jsonResponse_(
      buildErrorResponse_(error)
    );
  }
}


function handleListEvents_(request) {

  const manager =
    getCalendarManager_();

  const options =
    buildSafeListOptions_(request.data);

  const events =
    manager
      .list(options)
      .map(toClientEvent_);

  return jsonResponse_({
    ok: true,
    events: events
  });
}


function handleCreateEvent_(request) {

  const manager =
    getCalendarManager_();

  const eventData =
    toCalendarManagerEvent_(
      manager,
      requireObject_(
        request.data,
        "Event data is required."
      )
    );

  const created =
    manager.add(eventData);

  return jsonResponse_({
    ok: true,
    event: toClientEvent_(created)
  });
}


function handleUpdateEvent_(request) {

  const manager =
    getCalendarManager_();

  const data =
    requireObject_(
      request.data,
      "Event data is required."
    );

  const eventId =
    requireEventId_(data.id);

  const existing =
    manager.read(eventId);

  if (!existing) {
    throw new WebAppError(
      "NOT_FOUND",
      "Event not found."
    );
  }

  const eventData =
    toCalendarManagerEvent_(
      manager,
      data,
      existing
    );

  const updated =
    manager.update(
      eventId,
      eventData
    );

  return jsonResponse_({
    ok: true,
    event: toClientEvent_(updated)
  });
}


function handleDeleteEvent_(request) {

  const manager =
    getCalendarManager_();

  const data =
    requireObject_(
      request.data,
      "Event data is required."
    );

  const deleted =
    manager.remove(
      requireEventId_(data.id)
    );

  if (!deleted) {
    throw new WebAppError(
      "NOT_FOUND",
      "Event not found."
    );
  }

  return jsonResponse_({ ok: true });
}


function getCalendarManager_() {
  return new CalendarManager(
    new ScriptPropertiesResourceManager()
  );
}


function parseRequest_(e) {

  if (
    !e ||
    !e.postData ||
    typeof e.postData.contents !== "string"
  ) {
    throw new WebAppError(
      "INVALID_REQUEST",
      "Request body is required."
    );
  }

  const payload =
    safeParseJson_(e.postData.contents);

  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    throw new WebAppError(
      "INVALID_REQUEST",
      "Request body must be a JSON object."
    );
  }

  const action =
    typeof payload.action === "string"
      ? payload.action.trim()
      : "";

  if (!action) {
    throw new WebAppError(
      "INVALID_ACTION",
      "Action is required."
    );
  }

  if (!KCW_ALLOWED_ACTIONS[action]) {
    throw new WebAppError(
      "INVALID_ACTION",
      "Unknown action."
    );
  }

  const token =
    typeof payload.token === "string"
      ? payload.token.trim()
      : "";

  if (!token) {
    throw new WebAppError(
      "INVALID_TOKEN",
      "Authentication token is required."
    );
  }

  return {
    action: action,
    token: token,
    data: payload.data
  };
}


function requireAuthorizedIdentity_(idToken) {

  const identity =
    verifyFirebaseIdToken_(idToken);

  const allowedUids =
    splitCsv_(
      getScriptProperty_(
        "AUTHORIZED_UIDS",
        true
      )
    );

  const allowedEmails =
    splitCsv_(
      getScriptProperty_(
        "AUTHORIZED_EMAILS",
        true
      )
    ).map(normalizeEmail_);

  if (
    !allowedUids.length &&
    !allowedEmails.length
  ) {
    throw new WebAppError(
      "NOT_AUTHORIZED",
      "Account is not authorized."
    );
  }

  const uidAuthorized =
    allowedUids.indexOf(identity.uid) !== -1;

  const emailAuthorized =
    Boolean(identity.email) &&
    allowedEmails.indexOf(identity.email) !== -1;

  if (
    !uidAuthorized &&
    !emailAuthorized
  ) {
    throw new WebAppError(
      "NOT_AUTHORIZED",
      "Account is not authorized."
    );
  }

  return identity;
}


function verifyFirebaseIdToken_(idToken) {

  /*
   * A stronger alternative would be full local JWT signature
   * verification against Google's public certificates. This handler
   * instead uses Firebase claim checks plus accounts:lookup so no
   * extra private keys or third-party dependencies are added here.
   */
  const claims =
    decodeJwtPayload_(idToken);

  const projectId =
    getExpectedFirebaseProjectId_();

  if (
    !claims ||
    claims.aud !== projectId ||
    claims.iss !==
      "https://securetoken.google.com/" +
      projectId
  ) {
    throw new WebAppError(
      "INVALID_TOKEN",
      "Authentication failed."
    );
  }

  const response =
    UrlFetchApp.fetch(
      "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" +
      encodeURIComponent(
        getScriptProperty_(
          "FIREBASE_WEB_API_KEY"
        )
      ),
      {
        method: "post",
        contentType:
          "application/json; charset=utf-8",
        payload:
          JSON.stringify({
            idToken: idToken
          }),
        muteHttpExceptions: true
      }
    );

  const code =
    response.getResponseCode();

  if (
    code === 400 ||
    code === 401 ||
    code === 403
  ) {
    throw new WebAppError(
      "INVALID_TOKEN",
      "Authentication failed."
    );
  }

  if (code < 200 || code >= 300) {
    throw new WebAppError(
      "INTERNAL_ERROR",
      "The request could not be completed."
    );
  }

  const body =
    parseLookupResponse_(
      response.getContentText()
    );

  const user =
    body &&
    body.users &&
    body.users[0];

  if (
    !user ||
    !user.localId
  ) {
    throw new WebAppError(
      "INVALID_TOKEN",
      "Authentication failed."
    );
  }

  if (user.disabled) {
    throw new WebAppError(
      "NOT_AUTHORIZED",
      "Account is not authorized."
    );
  }

  const uid =
    String(user.localId).trim();

  if (
    !uid ||
    (
      claims.user_id &&
      claims.user_id !== uid
    ) ||
    (
      claims.sub &&
      claims.sub !== uid
    )
  ) {
    throw new WebAppError(
      "INVALID_TOKEN",
      "Authentication failed."
    );
  }

  return {
    uid: uid,
    email:
      user.email
        ? normalizeEmail_(user.email)
        : ""
  };
}


function buildSafeListOptions_(data) {

  if (
    data === undefined ||
    data === null
  ) {
    return {};
  }

  const options =
    requireObject_(
      data,
      "List filters must be an object."
    );

  const safeOptions = {};

  if (options.state !== undefined) {

    if (typeof options.state !== "string") {
      throw new WebAppError(
        "INVALID_REQUEST",
        "State filter must be a string."
      );
    }

    safeOptions.state =
      options.state.trim();
  }

  if (options.status !== undefined) {

    if (typeof options.status !== "string") {
      throw new WebAppError(
        "INVALID_REQUEST",
        "Status filter must be a string."
      );
    }

    safeOptions.status =
      options.status.trim();
  }

  return safeOptions;
}


const KCW_EVENT_FIELDS = ["id","type","title","description","date","startTime","endTime","timezone","allDay","location","address","directions","status","eventTitle","learningTopic","learningOutcome","format","speaker","speakerRole","speakerUrl","image","imageFilename","imageAlt","hoverText","featured","featureStart","featureEnd"];

function toCalendarManagerEvent_(manager, data, existing) {

  requireObject_(
    data,
    "Event data is required."
  );

  const event = {};
  KCW_EVENT_FIELDS.forEach(key => {
    if (existing && existing[key] !== undefined) event[key] = existing[key];
    if (data[key] !== undefined) event[key] = data[key];
  });

  // Canonical input passes through the manager's field validation.
  // Retain start/end support for the existing editor.
  if (data.start === undefined && data.end === undefined) return event;

  const start =
    parseIsoDate_(
      data.start,
      "start"
    );

  const end =
    parseIsoDate_(
      data.end,
      "end"
    );

  if (end.getTime() <= start.getTime()) {
    throw new WebAppError(
      "INVALID_REQUEST",
      "Event end time must be after the start time."
    );
  }

  const title =
    readTextField_(
      data,
      "title",
      existing && existing.title
    );

  if (!title) {
    throw new WebAppError(
      "INVALID_REQUEST",
      "Event title is required."
    );
  }

  return Object.assign(
    {},
    event,
    {
      title: title,
      description:
        readOptionalTextField_(
          data,
          "description",
          existing && existing.description
        ),
      location:
        readOptionalTextField_(
          data,
          "location",
          existing && existing.location
        ),
      date:
        Utilities.formatDate(
          start,
          manager.timezone,
          "yyyy-MM-dd"
        ),
      startTime:
        Utilities.formatDate(
          start,
          manager.timezone,
          "HH:mm"
        ),
      endTime:
        Utilities.formatDate(
          end,
          manager.timezone,
          "HH:mm"
        ),
      allDay: false,
      timezone:
        manager.timezone
    }
  );
}


function toClientEvent_(event) {
  const result = {};
  KCW_EVENT_FIELDS.concat(["state", "startDateTime", "endDateTime"])
    .forEach(key => { result[key] = event[key]; });
  // Compatibility aliases for the existing editor.
  result.start = event.startDateTime;
  result.end = event.endDateTime;
  return result;
}


function requireEventId_(value) {

  if (typeof value !== "string") {
    throw new WebAppError(
      "INVALID_REQUEST",
      "Event id is required."
    );
  }

  const eventId =
    value.trim();

  if (!eventId) {
    throw new WebAppError(
      "INVALID_REQUEST",
      "Event id is required."
    );
  }

  return eventId;
}


function requireObject_(value, message) {

  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new WebAppError(
      "INVALID_REQUEST",
      message
    );
  }

  return value;
}


function readTextField_(data, key, fallbackValue) {

  const value =
    data[key] === undefined
      ? fallbackValue
      : data[key];

  if (typeof value !== "string") {
    throw new WebAppError(
      "INVALID_REQUEST",
      "Event " + key + " must be a string."
    );
  }

  return value.trim();
}


function readOptionalTextField_(data, key, fallbackValue) {

  const value =
    data[key] === undefined
      ? (fallbackValue || "")
      : data[key];

  if (typeof value !== "string") {
    throw new WebAppError(
      "INVALID_REQUEST",
      "Event " + key + " must be a string."
    );
  }

  return value.trim();
}


function parseIsoDate_(value, fieldName) {

  if (typeof value !== "string" || !value.trim()) {
    throw new WebAppError(
      "INVALID_REQUEST",
      "Event " + fieldName + " is required."
    );
  }

  const date =
    new Date(value);

  if (isNaN(date.getTime())) {
    throw new WebAppError(
      "INVALID_REQUEST",
      "Event " + fieldName + " must be a valid ISO date/time."
    );
  }

  return date;
}


function decodeJwtPayload_(token) {

  const parts =
    String(token).split(".");

  if (parts.length !== 3) {
    throw new WebAppError(
      "INVALID_TOKEN",
      "Authentication failed."
    );
  }

  try {

    return safeParseJson_(
      Utilities.newBlob(
        Utilities.base64DecodeWebSafe(parts[1])
      ).getDataAsString()
    );

  } catch (error) {

    throw new WebAppError(
      "INVALID_TOKEN",
      "Authentication failed."
    );
  }
}


function parseLookupResponse_(text) {

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new WebAppError(
      "INTERNAL_ERROR",
      "The request could not be completed."
    );
  }
}


function getExpectedFirebaseProjectId_() {
  return getScriptProperty_(
    "FIREBASE_PROJECT_ID",
    true
  ) || KCW_FIREBASE_PROJECT_ID;
}


function getScriptProperty_(key, optional) {

  const value =
    PropertiesService
      .getScriptProperties()
      .getProperty(key);

  if (value === null || value === undefined) {

    if (optional) {
      return "";
    }

    throw new WebAppError(
      "SERVER_CONFIG_ERROR",
      "Server configuration is incomplete."
    );
  }

  const trimmed =
    String(value).trim();

  if (!trimmed && !optional) {
    throw new WebAppError(
      "SERVER_CONFIG_ERROR",
      "Server configuration is incomplete."
    );
  }

  return trimmed;
}


function splitCsv_(value) {

  if (!value) {
    return [];
  }

  return String(value)
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}


function normalizeEmail_(value) {
  return String(value)
    .trim()
    .toLowerCase();
}


function safeParseJson_(text) {

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new WebAppError(
      "INVALID_JSON",
      "Malformed JSON request body."
    );
  }
}


function buildErrorResponse_(error) {

  if (error instanceof WebAppError) {
    return {
      ok: false,
      code: error.code,
      message: error.message
    };
  }

  if (
    error &&
    typeof error.message === "string" &&
    error.message.indexOf("CalendarManager:") === 0
  ) {

    if (
      error.message.indexOf("Script property") !== -1 ||
      error.message.indexOf("SERVICE_ACCOUNT_KEY") !== -1 ||
      error.message.indexOf("ResourceManager") !== -1 ||
      error.message.indexOf("Service Account authentication failed") !== -1 ||
      error.message.indexOf("returned no access token") !== -1
    ) {
      return {
        ok: false,
        code: "SERVER_CONFIG_ERROR",
        message: "Server configuration is incomplete."
      };
    }

    if (
      error.message.indexOf("Unable to ") !== -1
    ) {
      console.error(error.message);
      return {
        ok: false,
        code: "INTERNAL_ERROR",
        message: "The request could not be completed."
      };
    }

    return {
      ok: false,
      code: "INVALID_REQUEST",
      message: ({
        "CalendarManager: endTime must be later than startTime.": "End time must be later than start time on the same calendar day.",
        "CalendarManager: imageAlt is required when image is provided.": "Add image description text when supplying an image.",
        "CalendarManager: featureEnd cannot occur before featureStart.": "The feature end date must be on or after the feature start date."
      })[error.message] || "The event data is invalid. Check the dates, times, and required fields."
    };
  }

  console.error(
    "WebApp: Unexpected error.",
    error && error.message
      ? error.message
      : "Unknown error"
  );

  return {
    ok: false,
    code: "INTERNAL_ERROR",
    message: "The request could not be completed."
  };
}


function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(
      JSON.stringify(payload)
    )
    .setMimeType(
      ContentService.MimeType.JSON
    );
}
