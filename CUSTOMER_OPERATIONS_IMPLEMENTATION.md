# Customer Operations implementation

## Local setup

Use Bun (the package manager configured by this repository's deployment setup) and the existing development server; no additional application package or service infrastructure is introduced.

1. Install Bun if it is not already available, then run `bun install --frozen-lockfile`.
2. Configure the existing local server settings in a private `.env` file:
   - `FIREBASE_SERVICE_ACCOUNT` or Application Default Credentials for server-side Firestore and Firebase token verification.
   - `STUDIO_OWNER_EMAIL` for the Platform Super Admin identity.
3. Ensure the local hostname is enabled in the Firebase Authentication authorized domains.
4. Run `bun run dev`.
5. Open `/studio/customer-operations` and sign in with the configured owner account.

The existing Firebase app configuration and verified Google sign-in are reused. There are no new environment variables in Phase 1. Never put service account credentials or other server secrets in frontend variables or source control.

## Phase 1 and 2 setup

- The Studio Super Admin can create a business and assign its initial owner by verified email.
- The Studio Super Admin can grant or revoke Platform Support Agent access.
- The Business Owner can add business managers and support agents through the scoped membership API.
- A granted user signs in with the same verified Google account used for the membership.
- `/studio/customer-operations` shows only the workspaces permitted by the server response.
- Business team members can manage customer profiles and tickets in their own business workspace.
- Customer and ticket lists provide prefix search and paginated browsing.

Firestore creates collections and fields on first write; there is no SQL migration or destructive migration command. New query indexes are declared in `firestore.indexes.json` and referenced by the safe, feature-specific `firebase.customer-operations.json` config. Before using the new list/search routes, deploy indexes to a **non-production** project with `firebase --config firebase.customer-operations.json deploy --only firestore:indexes --project <dev-project-id>` and wait for index builds to complete. Never target production for local phase work. Client-side Firestore rules remain default-deny.

## Current limitations

- Business membership grants are email-based until a later invitation-claim flow can bind them to Firebase UIDs.
- Email invitation delivery and account claim UX are not implemented.
- Customer-visible requests/replies, conversations, attachments, reports, automation, SLA workflows, and external channel integrations are deferred to later phases.
- Search uses prefix matching on normalized names, emails, companies, subjects, and ticket references; Firestore does not provide full-text substring search.
- Customer identity matching/merging is not automated; entered contact details are not treated as verified identifiers.
- Ticket references are unique per business; duplicate reference strings may exist across businesses.
- The current implementation does not provision businesses from a self-service signup flow.
- Provider credentials are not required for Phase 1.
