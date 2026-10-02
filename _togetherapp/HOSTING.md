# Together: personal-computer hosting

The public interface belongs at **https://www.philipgheno.com/togetherapp/** in the GitHub Pages repository. The private Node backend runs on Philip's Windows computer, bound to `127.0.0.1:4174`. Only the backend API is exposed through an HTTPS tunnel. It does not serve the workspace or private files.

## What is implemented

- Google account identity uses the stable Google subject ID. OAuth access and refresh tokens are encrypted locally with AES-256-GCM.
- Accounts, friendships, invitations, hashed sessions, and event-save idempotency records persist in `.private/accounts.json` across restarts.
- Invite links are private, single-use, expire after 7 days, and require explicit acceptance after Google sign-in. Acceptance creates both sides of the friendship atomically.
- Friends can query each other's primary-calendar busy/free times. Appointment details are not shared. Unfriending removes access in both directions; disconnecting makes availability unknown.
- Shared searches require fresh availability from every selected person. A failed/disconnected calendar is never treated as free.
- Event saving rechecks all selected calendars and writes only to the signed-in user's own primary calendar. It does not invite guests or create events on friends' calendars.
- User sessions last 7 days, are stored per browser tab, and can be signed out. Google tokens never reach browser storage. The browser session is protected during OAuth return by a one-use exchange code and browser-bound PKCE challenge.

## Private local configuration

Keep `.env`, `.private/`, and `.tools/` out of Git. Never publish `accounts.json`, `token-key`, client secret downloads, logs, or any OAuth token.

Configure `.env` locally:

```dotenv
GOOGLE_CLIENT_ID=your-web-client-id
GOOGLE_CLIENT_SECRET=your-secret
WEB_URL=https://www.philipgheno.com/togetherapp/
API_URL=https://your-active-tunnel-host
PORT=4174
SERVE_WEB=false
```

The encryption key is generated at `.private/token-key` on first start. Back up that key and `accounts.json` together in a secure location. Losing the key requires every user to reconnect. Run exactly one backend process against this local JSON database.

## Starting the backend and tunnel

1. Run `.tools/cloudflared.exe tunnel --url http://127.0.0.1:4174` and note its printed HTTPS address.
2. In another PowerShell terminal, run `scripts/start-backend.ps1 -ApiUrl https://your-active-tunnel-host`. The script sets the public URLs and port, then keeps the backend in its terminal.
3. Keep both processes running and prevent the computer from sleeping while the app is in use. This setup does not configure auto-start or change Windows power settings.

For a quick tunnel, Cloudflare prints a random `https://…trycloudflare.com` address. Quick tunnels are for development/testing, stop working when the process exits, and do not provide a stable address or availability guarantee. A named tunnel with a stable hostname is the next hosting improvement. Do not open router ports for this setup.

## When the tunnel address changes

1. Restart the backend using `scripts/start-backend.ps1 -ApiUrl https://your-new-tunnel-host`.
2. In **Google Auth Platform → Clients → Together Local Web**, add `<API_URL>/auth/google/callback` to Authorized redirect URIs. Preserve any callback still in use; remove abandoned tunnel callbacks once no longer needed.
3. Run `scripts/publish-files.ps1 -ApiUrl https://your-active-tunnel-host` to update the public `config.js` and copy allowlisted source files into the repository clone at `site-repo`.
4. Review `git diff` and confirm no secrets, `.env`, or `.private` files are staged. Commit and push the app files to the site's publishing branch.
5. Verify the public HTTPS page and backend `/health` endpoint, then sign in again.

The frontend stays at the same public path. Invite links therefore keep their website address even when the backend tunnel changes.

## Google testing restrictions

While Google Auth Platform remains in Testing, each friend's Google email must also be added under **Audience → Test users** before that friend can authorize Google Calendar. An app invitation cannot bypass Google's tester gate. Publishing/verifying the Google OAuth app is a separate step for unrestricted signups.

Required OAuth scopes: `openid`, `email`, `profile`, `calendar.freebusy`, and `calendar.events.owned`. The event-owned scope permits reading/editing/deleting owned events even though Together only uses it to save approved events and recover its own event ID after an uncertain save.

## Tests and limits

Run `npm test`. Tests cover independent Google accounts, mutual acceptance, single-use/expired/revoked/self invitations, concurrent acceptance, unauthorized calendar requests, removing both sides of a friendship, failed availability, encrypted persistence, OAuth exchange binding, conflict checks, and duplicate prevention. Google responses are mocked; live two-account acceptance should also be checked with a real friend after deployment.

This is a small private beta, not a high-availability production service. Local JSON persistence is for one Node process. Cloudflare sees traffic in transit as the HTTPS proxy. Friendships share current and near-future availability, not historical calendars. Google grant revocation/testing-mode expiry can require reconnecting. Saving is not an atomic reservation against simultaneous edits in Google Calendar.

## References

- https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/
- https://developers.google.com/identity/openid-connect/openid-connect
- https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query
