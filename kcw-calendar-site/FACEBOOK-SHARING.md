# Per-event Facebook sharing

Calendar Manager generates one small static HTML share artifact for each published event. The file contains event-specific Open Graph metadata for Facebook and redirects human visitors to the event row on the KCW schedule.

## Source and destination

Calendar Manager stages files in this repository at:

`kcw-calendar-site/share/events/<google-calendar-event-id>.html`

The `sync-kcw-share-events.yml` workflow copies them to:

`kemptvillecw/mainsite:dev/share/events/`

The existing KCW promotion process then carries them through UAT to `main`/production.

## Apps Script properties

Existing image-publishing credentials are reused by default. The following optional properties override the defaults:

- `SHARE_GITHUB_REPOSITORY` (default `impishlycreative/calendar_manager`)
- `SHARE_GITHUB_BRANCH` (default `main`)
- `SHARE_GITHUB_FOLDER` (default `kcw-calendar-site/share/events`)
- `SHARE_GITHUB_TOKEN` (falls back to `IMAGE_GITHUB_TOKEN`)
- `SHARE_PUBLIC_SITE_URL` (default `https://www.kemptvillecreativewriters.com/`)

The GitHub token stays in Script Properties and is never written to Calendar metadata or the public site.

## Lifecycle

- Publishing creates or updates the stable event-ID share file.
- Editing a published event updates the same file.
- Saving a formerly published event as Draft retains the URL but changes the file to an unavailable stub.
- Deleting an event retains the URL but changes the file to an unavailable stub.
- Merely becoming archived does not delete or rewrite the file; old Facebook posts continue to work.

## Backfill

After deploying the Apps Script code for the first time, run `backfillPublishedEventShares_()` once from the Apps Script editor to generate artifacts for currently visible upcoming Published events. New/edited events maintain their own files automatically after that.
