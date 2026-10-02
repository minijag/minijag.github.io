# Together

## Current version: accounts and friend invitations

The active server is now `server/multi-app.mjs`. It supports persistent encrypted Google connections, one-use invitation links, mutual friendships, shared busy/free searches, removal/revocation, and saving a reviewed event to your own calendar. The web interface is ready for the `/togetherapp/` GitHub Pages path.

See [HOSTING.md](HOSTING.md) for the current personal-computer hosting setup, tunnel lifecycle, Google testing restrictions, and deployment steps. Run `npm test` for all checks. The sections below describe the earlier single-user and Apple prototypes; their session/storage descriptions no longer apply to the current server.

## Web app — Google Calendar

Requires Node.js 22 or newer. Run `npm start` and open http://localhost:4173. No dependency installation is needed. The app uses sample calendars until you connect Google Calendar. Once connected, it searches **only your primary Google Calendar**, with real busy/free times and a review form for creating an event. Sample friends are excluded from live results.

### Google setup (once per application)

1. Create or select a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable **Google Calendar API** in **APIs & Services → Library**.
3. In **Google Auth Platform**, configure Branding (app name, support email, developer contact), choose an External audience in Testing, and add your Google email under Test users.
4. Add these scopes under Data Access:
   - `https://www.googleapis.com/auth/calendar.freebusy`
   - `https://www.googleapis.com/auth/calendar.events.owned`
5. Create an OAuth client of type **Web application**. Set its authorized redirect URI to exactly `http://localhost:4173/auth/google/callback`.
6. Copy `.env.example` to `.env`. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` locally; never commit or paste the secret into chat. `.env` is ignored and is outside the served web directory.
7. Restart `npm start`. Open **My calendars → Connect Google Calendar**, sign in, and approve both permissions. Use Chrome or Edge if Google rejects the embedded preview browser. OAuth must begin and finish in the same browser.

Google does not offer a write-only permission for inserting into an existing personal calendar. `calendar.events.owned` also permits reading/changing/deleting owned events. This application calls FreeBusy for availability and inserts only the event the user approves; it does not enumerate appointment details. On retry after an uncertain save, it may retrieve only the app-generated event ID to check whether that exact save succeeded.

### Calendar behavior

- Finds openings for today and the next 13 days, in the browser's local time zone. Past times are blocked in live mode.
- Google FreeBusy handles recurring and all-day busy events; event details are not included in availability responses.
- Rechecks busy/free before saving and blocks newly conflicting times. This is not an atomic calendar reservation: an external edit can still race the final insert.
- Review the name and time, then click **Add to my Google Calendar** to create a busy event on the primary calendar. No attendees or invitation emails are added.
- Saved events sync through Google to devices configured with that Google account. This does not write to a separate Apple/iCloud calendar.
- Click **Refresh availability** or **Find a time** to read current Google availability. A failed read is treated as unknown, never as an empty/free calendar.
- Authorization tokens remain in server memory behind an HttpOnly session cookie, not in browser storage. Sessions expire after 24 hours and all connections are lost on server restart. Disconnect drops local tokens and attempts to revoke the Google grant.
- This is a local development implementation bound to loopback. Production deployment needs HTTPS, persistent encrypted token storage, user accounts, and Google consent verification as applicable. Testing-mode grants can expire; reconnect when needed.

### Verification

Run `npm test`. The tests use simulated Google responses and cover OAuth state and CSRF protection, missing credentials, partial consent, token refresh, busy/free failures, event insertion, conflict checks, duplicate prevention, and local-day interval conversion. No real calendar data or events are used by tests.

Live OAuth sign-in and calendar writes have **not** been verified without your Google client configuration. After setup, create a test busy event in Google, confirm it blocks a result, save an approved opening, and verify it appears in Google Calendar and disappears from free-time results. Then disconnect and verify real data is cleared.

## Earlier Apple prototype

The SwiftUI project below is the earlier native integration prototype. It is separate from the web app and has not been compiled on this Windows machine. The active web interface now uses Google Calendar.

## Run on an iPhone

Requires a Mac with Xcode 15 or later and an iPhone running iOS 17 or later.

1. Install XcodeGen (`brew install xcodegen`).
2. From this directory run `xcodegen generate`.
3. Open `Together.xcodeproj`, select the Together target, and select your signing team. Change the bundle identifier if needed.
4. Select your iPhone and run. Tap **Connect Apple Calendar**, allow full calendar access, then select calendars to include.

The app reads calendars available in the iPhone Calendar database, including iCloud and other accounts configured on that device. It does not sign directly into iCloud. Simulator calendars may be empty; verify real integration on a device.

## Apple prototype behavior

- Explicit calendar permission, denied/restricted states, and a Settings shortcut.
- Opt-in calendar selection, persisted on the device.
- EventKit date-range queries, including occurrences of recurring events.
- Only busy start/end times leave the EventKit adapter. Titles, notes, attendees, and locations are never copied into availability models.
- Canceled and explicitly free events are ignored. Tentative, unavailable, and unspecified events block time. All-day events block their covered days unless marked free.
- Earliest openings within a chosen daily window and duration over the next 30 days, using the phone's time zone and calendar-aware date arithmetic.
- Refresh on foregrounding, calendar changes, and manual refresh. The timestamp indicates a local read, not guaranteed iCloud server freshness.
- No network transmission or calendar writes.

## Apple prototype verification

Run `swift test` on a Mac for the scheduling core. Build the app with Xcode and perform the following device checks:

1. Deny permission: show Settings guidance and no availability results.
2. Grant access but select no calendars: show a selection prompt, not an all-free result.
3. Select a calendar with an evening appointment: results must not overlap it.
4. Add a recurring busy event and an all-day event: both must block matching windows.
5. Mark an event free: it must not block time.
6. Edit an event in Apple Calendar and return: results should refresh.
7. Revoke permission in Settings and return: previously read blocks and results must disappear.
8. Change the phone's time zone and verify displayed windows use the new local time.

The source was created on Windows; Swift tests, Xcode compilation, and device verification have not been run here.

## Next milestone

Add authenticated accounts and mutual friend invitations, followed by explicit sharing of busy intervals and a bounded availability range. A missing, stale, or out-of-range friend's calendar must be treated as unknown, never free. The scheduling core already accepts multiple participants' busy intervals, but the app currently searches only your own calendar. Proposal acceptance and conflict rechecking follow that work.

## Apple references

- [Calendar access and EventKit](https://developer.apple.com/documentation/eventkit/accessing-the-event-store)
- [Full calendar access](https://developer.apple.com/documentation/eventkit/ekeventstore/requestfullaccesstoevents(completion:))
