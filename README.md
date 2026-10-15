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

The public intake is served at `/`. The studio portal is at `/studio` and requires Google sign-in with the verified owner account. Studio data APIs verify Firebase ID tokens on the server; the browser-side route is not the security boundary.

For local or hosted API access, configure `FIREBASE_SERVICE_ACCOUNT` with the Firebase service-account JSON as a private environment secret, or provide Application Default Credentials. Set `STUDIO_OWNER_EMAIL` to the authorized owner email. Never put service-account credentials in frontend variables or commit them to the repository.

## Deploy on Vercel

Production is deployed at https://merk-discoveryflow.vercel.app. Vercel serves the Vite build from `public/` and runs the Express API functions. Submissions and email outbox entries are stored in Firestore; Excel files are generated when requested and are not saved to the function filesystem.

Complete these Firebase Console steps:

1. Publish `firestore.rules` to remove the legacy anonymous-create rule on `/submissions`. Production records are stored in `/studioSubmissions`, which is covered by the existing default-deny rule. The service account currently lacks `serviceusage.services.get`, so deploy the updated rules from Firebase Console or grant that permission before using the CLI.
2. Add `merk-discoveryflow.vercel.app` to Firebase Authentication's authorized domains so owner Google sign-in succeeds.

The existing `submissions.json` and `email_outbox.json` records have not been imported. To explicitly upload them later, put the service account JSON in a private local `.env` and run `bun run migrate:firestore`; the script does not run automatically or delete the local files.

Never add service-account or SMTP credentials to frontend-prefixed variables or commit them. The existing JSON files are ignored for future Git deployments, but verify they were not committed before; `.gitignore` does not untrack files that are already in Git history.
