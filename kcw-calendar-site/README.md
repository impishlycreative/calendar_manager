# KCW Static Calendar Manager

Static HTML/CSS/JavaScript frontend for Firebase email/password login and KCW calendar CRUD operations.

## Included

- `index.html` — Firebase email/password login.
- `calendar.html` — protected event list and add/edit/delete UI.
- `assets/config.js` — Firebase Web configuration and Apps Script Web App URL.
- `assets/firebase.js` — Firebase initialization and session-only browser persistence.
- `assets/login.js` — sign-in and backend authorization check.
- `assets/api.js` — authenticated Apps Script API wrapper.
- `assets/calendar.js` — calendar CRUD frontend.
- `assets/styles.css` — responsive styling.
- `apps-script-contract.md` — exact backend request/response contract the Apps Script must implement.

## Firebase setup

1. Create/register a Firebase **Web App**.
2. Enable **Email/Password** under Firebase Authentication.
3. Copy the Firebase Web config values into `assets/config.js`.
4. Do not add a public sign-up page. Create accounts through your administrator process.

The Firebase Web config is not a service-account credential. Never put your service-account private key, OAuth access tokens, or Apps Script secrets in this static site.

## Apps Script setup

Deploy your Apps Script backend as a Web App and put its `/exec` URL in `assets/config.js` as `API_URL`.

The backend must verify the Firebase ID token and check the KCW authorized-user record **on every protected request** before calling CalendarManager.

Do not trust the email address, event ID, or authorization state supplied by the browser.

## API actions expected

- `authorize`
- `listEvents`
- `createEvent`
- `updateEvent`
- `deleteEvent`

See `apps-script-contract.md`.

## One-hour session

The frontend records the login time in `sessionStorage` and forces a new sign-in after one hour. This is a UX/application timeout, not the sole security boundary. The backend still verifies the Firebase ID token and KCW authorization on every request.

## Local testing

Because this uses JavaScript modules, serve the directory over HTTP instead of opening the HTML using `file://`.

For example, if Python is installed:

```text
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Hosting

The files are ordinary static HTML/CSS/JS and can be hosted on GitHub Pages or another static host. Ensure the deployed domain is permitted by your Firebase Authentication configuration as required.
