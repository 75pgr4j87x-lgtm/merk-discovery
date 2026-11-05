<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/8cd8f286-8d8e-4a39-85b6-e12a3a262645

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Admin Access

The public intake is served at `/`. The studio portal is at `/studio` and requires Google sign-in with a verified owner or explicitly invited email. The owner manages invitees from the Studio access control. Studio data APIs verify Firebase ID tokens and invitation status on the server; the browser-side route is not the security boundary. Studio and BetaDesk admin invitations are emailed using the private `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and optional `SMTP_FROM` settings. Access is granted only after the SMTP server accepts the invitation; if mail delivery fails, the API reports the failure and does not create a new grant. Retry the invitation after configuring SMTP. An invite does not itself send project share links to the invitee.

For local or hosted API access, configure `FIREBASE_SERVICE_ACCOUNT` with the Firebase service-account JSON as a private environment secret, or provide Application Default Credentials. Set `STUDIO_OWNER_EMAIL` as a private server-only environment variable to bootstrap the Super Admin. Do not put it in `VITE_*` variables, source code, `.env.example`, or any client response. The Super Admin signs in through Google and manages invited users and roles in Studio. Never put service-account credentials in frontend variables or commit them to the repository.

For local Studio sign-in, add `localhost` (domain only, no protocol or port) to Firebase Authentication's authorized domains. Open the Firebase Console for project `gen-lang-client-0961556565` at [Authentication settings](https://console.firebase.google.com/project/gen-lang-client-0961556565/authentication/settings), then use Authentication > Settings > Authorized domains > Add domain. After it appears in the list, reload `http://localhost:3000/studio` and retry Google sign-in. The Firebase project owner or an editor with Authentication configuration access must make this change.

For the Vercel dev preview, use the stable `merk-discoveryflow-git-dev-merk3.vercel.app` hostname and add `merk-discoveryflow-git-dev-merk3.vercel.app` (domain only, no protocol) to the same Firebase Authorized domains list. Random deployment-specific preview hostnames are different domains and must be added separately if used for sign-in.

## BetaDesk

BetaDesk is available at `/studio/beta-feedback` and uses the Studio identity system. The Studio Super Admin can manage BetaDesk-only admin access from **Studio access**; Studio Admins automatically have full operational access to BetaDesk. Only the Studio Super Admin can change BetaDesk admin grants or connect the Super Admin's Google Drive. BetaDesk-only grants do not change Studio roles. On opening BetaDesk, admins choose a project or create one; tester links, ticket lists, metrics, and ticket actions are scoped to that project. New tester links are tied to the selected project. Share each private link (`/feedback/tester#tester=...`) only with its intended client. Tester links do not expire, but can be revoked by an admin. Admins may also delete a tester profile and its links; deletion preserves the tester's existing tickets and comments. Clients enter their name once; it is saved to their tester profile and used as reporter on every ticket. Testers do not sign in, and BetaDesk does not request, store, or use tester email addresses. A tester's personal page lists their tickets and supports replies. Older unscoped tester links remain compatible with project selection; existing tickets without a project remain grouped under the legacy project. `/feedback/submit` directs clients to request their personal link. Every admin API independently verifies the Firebase ID token and Studio/BetaDesk access, and ticket-level actions verify the selected project.

Ticket data is stored in dedicated Firestore collections (`betaDeskTickets`, `betaDeskTesters`, `betaDeskTesterAccess`, `betaDeskIdempotency`, `betaDeskRateLimits`, and `betaDeskNotificationLogs`), with comments and activity records nested under each ticket. The server generates sequential `BETA-1001` references transactionally and stores only SHA-256 hashes of 256-bit tester-link tokens. Admins can revoke a tester link, which also removes access to all tickets on that profile. Tester links are bearer credentials: share them privately and revoke them if they are exposed. Firestore client rules remain default-deny; tester access and all mutations go through the existing Express API using Firebase Admin credentials.

For production tester links, configure `PUBLIC_APP_URL` as the canonical HTTPS app URL (for example, `https://merk-discoveryflow.vercel.app`). On Vercel preview deployments, tester links use that deployment's `VERCEL_URL` instead, so test links stay in the dev preview rather than opening production. Vercel rewrites `/feedback/*` to the SPA entry point so `/feedback/tester` and `/feedback/submit` load on direct navigation. BetaDesk sends ticket notifications to the Studio owner and active BetaDesk administrators using the existing private `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and optional `SMTP_FROM` settings. Tester notifications are not emailed because tester email addresses are not collected. Public submissions and upload-link requests are rate limited per tester.

Image/video attachments are stored privately in a `BetaDesk Attachments` folder in the Studio Super Admin's personal Google Drive. In Google Cloud Console, enable the Google Drive API and configure an OAuth web application with the app's HTTPS origin and the exact redirect URI `https://<your-app-domain>/api/betadesk/admin/drive/callback`. Set the server-only `BETADESK_GOOGLE_CLIENT_ID`, `BETADESK_GOOGLE_CLIENT_SECRET`, and `BETADESK_GOOGLE_REDIRECT_URI` values; the redirect URI must exactly match the OAuth client configuration. Also set `BETADESK_OAUTH_TOKEN_ENCRYPTION_KEY` to a base64-encoded random 32-byte key (generate one with `openssl rand -base64 32`) and `PUBLIC_APP_URL` to the canonical HTTPS app URL. Keep the encryption key stable and backed up securely: changing or losing it prevents BetaDesk from decrypting saved Drive credentials. Do not expose these values as `VITE_*` variables or commit them. After deploying the server configuration, the Studio Super Admin opens **Studio access** and selects **Connect Google Drive**, then authorizes the same Google account that is configured as `STUDIO_OWNER_EMAIL`. BetaDesk creates a private folder in that account's Drive; the refresh token is encrypted before it is stored in Firestore. Files are not made public. If the Studio Super Admin changes, new uploads use the new owner's Drive after it is connected; existing connection records are retained so previously uploaded files remain available. The browser uploads directly to a server-created, file-specific Drive resumable-upload session, avoiding serverless request-size limits. Authenticated API routes verify ticket ownership and proxy downloads in 4 MB ranges, so large videos do not require public Drive links. No Cloud Storage bucket or bucket CORS configuration is needed. Supported image types are JPEG, PNG, GIF, and WebP (up to 10 MB each); supported videos are MP4, MOV, and WebM (up to 50 MB each). A ticket can include up to eight files and 100 MB total. The server verifies the Drive folder, file metadata, ownership properties, size, and file signature before attaching files to a ticket. Upload grants expire after ten minutes; this does not expire tester links.

This repository serves API routes through its existing Express/Vercel backend and does not configure a Firebase Cloud Functions source. BetaDesk reuses that trusted server-side API rather than adding a second backend or changing Firebase/Vercel deployment configuration. Studio, BetaDesk admin, and tester experiences include light/dark theme toggles; the app's existing UI sound effects are reused. No Firebase or production deployment is performed by this feature branch.

Project share tokens are generated randomly, stored as hashes, and issued in URL fragments so browsers do not send them as request paths or referrers. The shared project-board response omits client email, brief content, invoice, currency, discounts, and task amounts. A separate invoice-download endpoint intentionally makes the Studio-saved invoice available to anyone who has that project's share token; treat the link as confidential and revoke it by generating a replacement. Client deletion requests also remove matching Studio project documents. The invoice generator does not calculate taxes; confirm applicable tax, recordkeeping, invoice disclosure, and consumer/privacy obligations for the relevant jurisdictions before issuing invoices or sharing client links. These safeguards are engineering controls, not a legal-compliance certification.

## Deploy on Vercel

Production is deployed at https://merk-discoveryflow.vercel.app. Vercel serves the Vite build from `public/` and runs the Express API functions. Submissions and email outbox entries are stored in Firestore; Excel files are generated when requested and are not saved to the function filesystem.

Complete these Firebase Console steps:

1. Publish `firestore.rules` to remove the legacy anonymous-create rule on `/submissions`. Production records are stored in `/studioSubmissions`, which is covered by the existing default-deny rule. The service account currently lacks `serviceusage.services.get`, so deploy the updated rules from Firebase Console or grant that permission before using the CLI.
2. Add `merk-discoveryflow.vercel.app` to Firebase Authentication's authorized domains so owner Google sign-in succeeds.

The existing `submissions.json` and `email_outbox.json` records have not been imported. To explicitly upload them later, put the service account JSON in a private local `.env` and run `bun run migrate:firestore`; the script does not run automatically or delete the local files.

Never add service-account or SMTP credentials to frontend-prefixed variables or commit them. The existing JSON files are ignored for future Git deployments, but verify they were not committed before; `.gitignore` does not untrack files that are already in Git history.
