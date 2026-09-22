# Apps Script Backend Contract

The static frontend sends JSON as a POST body to the configured Apps Script Web App endpoint.

## Common request

```json
{
  "action": "listEvents",
  "token": "FIREBASE_ID_TOKEN",
  "data": {}
}
```

The backend must:

1. Parse the request.
2. Validate `action` against an allowlist.
3. Verify the Firebase ID token server-side.
4. Extract the verified Firebase UID/email from the verified token, not from browser-supplied profile data.
5. Ask UserManager whether the verified identity is enabled, activated and unlocked.
6. Reject unauthorized requests.
7. Validate all event data server-side.
8. Call CalendarManager only after authorization.
9. Audit create/update/delete operations.
10. Return sanitized JSON.

## authorize

Request:

```json
{"action":"authorize","token":"..."}
```

Success:

```json
{"ok":true}
```

Failure:

```json
{"ok":false,"code":"NOT_AUTHORIZED","message":"Account is not authorized."}
```

## listEvents

Success:

```json
{
  "ok": true,
  "events": [
    {
      "id": "calendar-event-id",
      "title": "KCW Meeting",
      "start": "2026-09-21T19:00:00-04:00",
      "end": "2026-09-21T21:00:00-04:00",
      "location": "Kemptville, Ontario",
      "description": "Meeting description"
    }
  ]
}
```

## createEvent

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

## updateEvent

Same fields as create, plus the immutable calendar event `id`.

## deleteEvent

```json
{
  "action":"deleteEvent",
  "token":"...",
  "data":{"id":"calendar-event-id"}
}
```

## Important

The static frontend is intentionally unable to protect secrets. Firebase Web configuration may be present there, but service-account private keys and other backend credentials must never be included.
