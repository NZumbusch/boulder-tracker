# Google Calendar sync - plan (shelved 2026-11-12)

A one-way sync from the app to a "Boulder Training" calendar in Google Calendar, for an agentic workflow that reads the calendar to plan practice sessions. Researched and designed, then shelved by Nathan before anything was built. Nothing of it is in the code.

## Decisions Nathan made

- **Android only** (the native app). No web version.
- Done sessions stay as events, moved to the time they happened and marked ✓.
- What is written is a setting. Default: **1 week ahead**, 4 weeks back.
- No reminders on the events.
- If the calendar was deleted in Google, **ask** "Recreate or turn off?" instead of quietly recreating it.

## Research findings (Google docs, read 2026-11-12)

- **Scope**: `https://www.googleapis.com/auth/calendar.app.created` - "Make secondary Google calendars, and see, create, change, and delete events on them." Google's Calendar scope page has **no sensitivity column**. Check its classification in Cloud Console → Google Auth Platform → Data access → Add scopes. (`drive.appdata` is listed as non-sensitive on the Drive page.)
- If it is sensitive: personal use (you, or a few people you know) is exempt from verification. Users click through an "unverified app" screen, and a user cap applies. In Testing status, the refresh-token lifetime is limited (the 7-day re-sign-in).
- Accepted by `calendars.insert`, `calendars.get`, `events.list`, `events.insert`, `events.patch`. **Not** accepted by `calendarList.list`, so the app cannot find its calendar again by listing. The calendar ID has to be stored.
- Client-chosen event IDs: base32hex (lowercase a-v, 0-9), 5-1024 characters, unique per calendar. Google "cannot guarantee that ID collisions will be detected at event creation time", so reconciliation must also remove duplicates.
- Deleted events stay as `status: "cancelled"` (listed with `showDeleted=true`). Restore them by updating rather than inserting.
- `events.list` filters by `privateExtendedProperty=key=value`.
- Browser (Google Identity Services token model): tokens are short-lived with no refresh token; a new one needs `requestAccessToken()` "from a user-driven event such as a button press". This is why the web was dropped.
- Google blocks OAuth inside embedded web views, so Google Identity Services can't sign in inside the Capacitor app. Android must use the native Play services path, like Drive sync.

## Design

```
Java (DriveSyncPlugin)    authorize({interactive, scope: "drive" | "calendar", account}) - ~20 lines
lib/calendarSync/
  eventId.ts      pure   session id <-> event id (UTF-8 bytes in base32hex, "bt" prefix, reversible)
  desired.ts      pure   sessions + phases -> the events that should exist (+ options, window)
  reconcile.ts    pure   desired vs listed -> insert / update / restore / delete / dedupe
  calendarApi.ts  port   Calendar REST over CapacitorHttp; 401 -> clear token, silent re-authorize, retry once
  calendarSync.svelte.ts store: triggers, status, settings card, calendar ID storage
components/settings/GoogleCalendarSettings.svelte
```

1. **Sign-in**: a separate authorization request containing only the calendar scope, pinned to the Drive account (`AuthorizationRequest.Builder.setAccount`). The Drive request stays unchanged. Play services renews tokens silently; only a revoked grant needs a "Reconnect" tap. Check whether Drive's `revoke` also drops the calendar grant.
2. **REST calls in TypeScript** over `CapacitorHttp` (like Strava), so the sync is unit-testable with a fake calendar and the Java change stays tiny.
3. **Reconcile, don't track**: each run lists our events from the window start (`showDeleted=true`, `privateExtendedProperty=btSession`), compares them with the desired set and sends only the differences.
   - Every event carries `extendedProperties.private` = `{btSession: <session id>, btHash: <content hash>}`, so an unchanged event costs no call.
   - Events after the window's end that aren't desired are deleted (this handles a shrunk window). Events before the window start are left as they are.
   - An insert that returns 409 becomes an update. An update that returns 404 becomes an insert. A delete that returns 404 or 410 is ignored.
4. **Desired events**:
   - Built from `getWorkoutsForWeek` for every week touching the window, so Plan B and projected sessions are included. Times come from `toCalendarSession`.
   - A session with a start time is a timed event in the phone's time zone. One without a start time is an all-day event.
   - The title is the session name, prefixed with "✓ " when done.
   - The location is the session's place.
   - The description starts with fixed lines that an agent can parse: `Phase: <block> (<phase type>) · week n of m`, `Status: planned|done`, `Duration`, `Exercises`. Then the plan note, optionally "How it went", and a footer naming the session ID with "edit in the app".
   - `reminders: {useDefault: false, overrides: []}`.
5. **Options** (device settings, also mirrored in the Drive file): weeks ahead (1, 2, 4, 8, 12, whole plan capped at a year; default 1), weeks back (0, 1, 4, 12, 52; default 4), done sessions (on), exercises (on), plan notes (on), how it went (off). The window is today - 7×back to today + 7×ahead.
6. **Calendar ID**:
   - Kept on the device. When Drive sync is on, also kept in `google-calendar.json` in the Drive app folder as `{calendarId, writerDeviceId, writerName, options}`. The sync engine ignores files that aren't `device-*.json`.
   - **One device writes**: "This device updates Google Calendar". Turning it on elsewhere takes over and reuses the ID, so a second calendar is never made.
   - A 404 when listing means the calendar is missing: pause and ask "Recreate or turn off?".
7. **Triggers**:
   - About 10 s after a save to the plan tables. `setFlushListener` holds a single listener today and must become a list. Drive sync's merged changes also flush, so edits from other devices flow on.
   - App start and resume.
   - "Sync now".
   - A change to the options.
   - Never in demo/tour mode.
8. **Phone-calendar overlay**: the Google Calendar app will sync "Boulder Training" onto the phone, which would show sessions twice on the Plan calendar and in the AI's calendar context. Add `OWNER_ACCOUNT` to the device-calendar plugin's `listCalendars` and hide the calendar whose owner is the stored ID (fall back to its name).
9. **Also needed**:
   - Enable the Calendar API and add the scope in the Cloud project. The existing Android OAuth client covers the rest.
   - README setup step, `privacy.html` section, release note, QA section, a settings page under Data & connections (`needs: "native"`, using an icon that's already bundled).

## Not verified

The Java was never written or compiled, nothing ran against the live Calendar API, and nothing ran on a phone. Two points are unconfirmed: whether `OWNER_ACCOUNT` holds the Google calendar ID, and how the API treats re-inserting a cancelled event's ID.
