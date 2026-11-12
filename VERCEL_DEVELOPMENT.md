# Vercel development preview

The development branch is `dev`. The repository documents this stable Vercel branch URL:

https://merk-discoveryflow-git-dev-merk3.vercel.app

Customer Operations opens at `/studio/customer-operations`. `/api/customer-operations/health` returns configuration readiness without exposing credential values. A configuration-required 503 is intentional until the preview is isolated from production Firebase.

## Build and deployment

`vercel.json` uses the tested Node 24/Bun 1.4.4 workflow: `npx --yes bun@1.4.4 install --frozen-lockfile`, then `npx --yes bun@1.4.4 run build`. Static output is `public`; the existing Express API catch-all routes remain in place. Pushing `dev` requests a preview through the project's existing Git integration. A successful Git push is not proof that Vercel built or activated that deployment; confirm the commit/check and live health endpoint.

Production-only cron configuration is intentionally absent from the shared preview configuration. Vercel cron jobs do not execute on preview deployments. SLA checks remain available from Operations; `/api/customer-operations/jobs` requires a separate `CRON_SECRET`. Configure production scheduling separately after checking the hosting plan.

## Required Vercel Preview settings

Use Vercel **Project Settings → Environment Variables → Preview**, restricted to branch `dev` where supported. Never enter secret values in chat or commit them. Do not change Production values for this setup.

- `FIREBASE_PROJECT_ID`: an isolated development Firebase project, different from the committed production project.
- `FIREBASE_SERVICE_ACCOUNT`: private JSON credentials for that development project, or a verified supported development ADC identity. The service-account project must match `FIREBASE_PROJECT_ID`.
- `VITE_FIREBASE_PROJECT_ID`: the same development project ID.
- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_APP_ID`: the development Firebase web app's public configuration. These are browser configuration, never private service-account credentials.
- `STUDIO_OWNER_EMAIL`: the verified account used to bootstrap the development Platform Super Admin. Keep it server-only.
- `FIREBASE_STORAGE_BUCKET`: the development project's private bucket for attachments. Optionally set the matching `VITE_FIREBASE_STORAGE_BUCKET` browser configuration.
- `PUBLIC_APP_URL`: this development branch origin for app features that use the canonical URL. Customer Operations specifically prefers Vercel's trusted branch/deployment URL in Preview, so production canonical URLs cannot redirect its invitation/customer links to production.

The server rejects a Preview configuration that is absent, inconsistent, or points at the committed production Firebase project. It also rejects a configured service-account project mismatch. Emulator mode remains unavailable in production builds. An auth screen loading alone does not establish backend readiness.

In the **development** Firebase Console, enable the intended Google sign-in provider and add `merk-discoveryflow-git-dev-merk3.vercel.app` to authorized domains. Deploy `firestore.rules`, `firestore.indexes.json`, and private Storage rules only to that development project; never use the production project for these tests. The first successful verified owner login binds the platform owner UID. Other users must claim UID-bound invitations.

Email, WhatsApp and AI remain disconnected unless their corresponding server settings are explicitly supplied. Use development-only provider accounts and test recipients when enabling them. Do not copy production tokens into a shared test environment.

## Verification

1. Confirm the Vercel Preview deployment's Git commit matches the pushed `dev` commit.
2. Open the development URL, `/studio/customer-operations`, and the health endpoint.
3. Complete Firebase configuration and rebuild/redeploy because `VITE_*` values are embedded at build time.
4. Sign in with the configured development owner, create two development businesses, claim their invitations with separate accounts, then exercise customer/ticket/inbox/attachment/feedback/report flows and cross-business denials.
5. Run provider tests only with authorized development accounts. A preview build does not establish end-to-end provider success.

The current cloud task has no Vercel token or local project link. Its proxy blocks the documented preview and GitHub status API until the saved network additions are applied. The network draft preserves the previous emulator download domain and adds `api.github.com`, `api.vercel.com`, and `merk-discoveryflow-git-dev-merk3.vercel.app`. Save those additions in cloud environment settings to let the agent inspect deployment checks and the live site. No environment publication was performed by the agent.
