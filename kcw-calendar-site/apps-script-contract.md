# Apps Script Backend Contract

The static frontend sends JSON as a `text/plain` POST body to the configured Apps Script Web App endpoint.

## Common request

```json
{
  "action": "listEvents",
  "token": "FIREBASE_ID_TOKEN",
  "data": {}
}
```

The backend must:

1. Parse the request safely.
2. Validate `action` against an allowlist.
3. Verify the Firebase ID token server-side.
4. Extract the verified Firebase UID/email from the verified token, not from browser-supplied profile data.
5. Authorize the verified identity from server-side configuration.
6. Reject unauthorized requests.
7. Validate all event data server-side.
8. Call `CalendarManager` only after authorization.
9. Return sanitized JSON.

## Response format

Success responses always include:

```json
{"ok":true}
```

Failure responses always include:

```json
{"ok":false,"code":"ERROR_CODE","message":"Human readable message."}
```

Common failure codes:

- `INVALID_JSON` — malformed request body.
- `INVALID_ACTION` — missing or unknown action.
- `INVALID_TOKEN` — missing, malformed, expired, or mismatched Firebase ID token.
- `NOT_AUTHORIZED` — verified account is not allowed to use the backend.
- `INVALID_REQUEST` — invalid event payload or filters.
- `NOT_FOUND` — requested event does not exist.
- `SERVER_CONFIG_ERROR` — required Script Properties are missing.
- `INTERNAL_ERROR` — unexpected server failure.

## authorize

Request:

```json
{"action":"authorize","token":"..."}
```

Success:

```json
{"ok":true}
```

Failure examples:

```json
{"ok":false,"code":"INVALID_TOKEN","message":"Authentication failed."}
```

```json
{"ok":false,"code":"NOT_AUTHORIZED","message":"Account is not authorized."}
```

## listEvents

`listEvents` defaults to `Upcoming` + `Published` when no filters are supplied.
Only these filter fields are accepted:

- `state`: `Upcoming`, `Archived`, `All`
- `status`: `Published`, `Draft`, `All`

Success:

```json
{
  "ok": true,
  "events": [
    {
      "id": "calendar-event-id",
      "title": "KCW Meeting",
      "start": "2026-09-21T23:00:00.000Z",
      "end": "2026-09-22T01:00:00.000Z",
      "location": "Kemptville, Ontario",
      "description": "Meeting description"
    }
  ]
}
```

## createEvent

Request:

```json
{
  "action":"createEvent",
  "token":"...",
  "data":{
    "title":"KCW Meeting",
    "start":"2026-09-21T23:00:00.000Z",
    "end":"2026-09-22T01:00:00.000Z",
    "location":"Kemptville, Ontario",
    "description":"Meeting description"
  }
}
```

Success:

```json
{
  "ok": true,
  "event": {
    "id": "calendar-event-id",
    "title": "KCW Meeting",
    "start": "2026-09-21T23:00:00.000Z",
    "end": "2026-09-22T01:00:00.000Z",
    "location": "Kemptville, Ontario",
    "description": "Meeting description"
  }
}
```

## updateEvent

Same fields as `createEvent`, plus the immutable calendar event `id`.
The server reads the existing event first so unchanged `CalendarManager` metadata (for example status and extra event fields) is preserved.

```json
{
  "action":"updateEvent",
  "token":"...",
  "data":{
    "id":"calendar-event-id",
    "title":"Updated KCW Meeting",
    "start":"2026-09-21T23:30:00.000Z",
    "end":"2026-09-22T01:30:00.000Z",
    "location":"Kemptville, Ontario",
    "description":"Updated meeting description"
  }
}
```

## deleteEvent

```json
{
  "action":"deleteEvent",
  "token":"...",
  "data":{"id":"calendar-event-id"}
}
```

Success:

```json
{"ok":true}
```

## Deployment and configuration

1. Open the Apps Script project that contains `google_app_scripts/CalendarManager.gs` and `google_app_scripts/WebApp.gs`.
2. Add the Apps Script **OAuth2** library required by `CalendarManager`.
3. In **Project Settings → Script Properties**, configure:
   - `CALENDAR_ID` — Google Calendar ID managed by the app.
   - `CALENDAR_API_KEY` — existing public Google Calendar API key used by the shared calendar configuration.
   - `CALENDAR_TIMEZONE` — optional; defaults to `America/Toronto`.
   - `CALENDAR_DAYS_AHEAD` — optional upcoming window.
   - `CALENDAR_ARCHIVE_DAYS` — optional archive window.
   - `SERVICE_ACCOUNT_KEY` — full Google service-account JSON string. **Never commit this value.**
   - `FIREBASE_WEB_API_KEY` — Firebase Web API key for the `kemptville-creative-writ-cf643` project.
   - `AUTHORIZED_UIDS` — optional comma-separated Firebase UIDs.
   - `AUTHORIZED_EMAILS` — optional comma-separated email addresses.
   - `FIREBASE_PROJECT_ID` — optional override; defaults to `kemptville-creative-writ-cf643`.
4. Configure at least one of `AUTHORIZED_UIDS` or `AUTHORIZED_EMAILS`. If both are blank, the backend fails closed and rejects every request.
5. Deploy the script as a **Web App**:
   - **Execute as:** the script owner
   - **Who has access:** anyone who has the URL
6. Copy the deployed `/exec` URL into `kcw-calendar-site/assets/config.js` as `API_URL`.

## Authorization rules

- Authorization is based only on the server-verified Firebase UID/email.
- Email comparisons are trimmed and lowercased.
- Browser-supplied email addresses, authorization flags, or other profile data are ignored.

## Token verification method

The handler verifies Firebase ID tokens in two steps:

1. It checks the JWT `aud` and `iss` claims against the expected Firebase project ID.
2. It calls the Firebase Identity Toolkit `accounts:lookup` endpoint using `FIREBASE_WEB_API_KEY` to confirm the token is valid and to retrieve the canonical UID/email.

Firebase Web API keys are public identifiers, but the backend still must perform server-side token verification on every request.

A stronger alternative would be local JWT signature verification against Google's public certificates, but that is not included here to avoid introducing extra credential handling or unsafe dependencies into Apps Script.

## Security and platform limitations

- Do not log or expose Firebase ID tokens, service-account JSON, OAuth access tokens, or raw upstream response bodies.
- The static site must never contain `SERVICE_ACCOUNT_KEY`.
- Apps Script web apps cannot reliably set arbitrary CORS headers. The frontend uses `text/plain` requests so the browser can avoid a preflight request in normal usage.
- `doGet()` is only a non-sensitive health check and does not expose configuration or authorization data.
