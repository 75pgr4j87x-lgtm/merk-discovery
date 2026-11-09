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

## Phase 1–4 setup

- The Studio Super Admin can create a business and assign its initial owner by verified email.
- The Studio Super Admin can grant or revoke Platform Support Agent access.
- The Business Owner can add business managers and support agents through the scoped membership API.
- A granted user signs in with the same verified Google account used for the membership.
- `/studio/customer-operations` shows only the workspaces permitted by the server response.
- Business team members can manage customer profiles and tickets in their own business workspace.
- Customer and ticket lists provide prefix search and paginated browsing.
- The business Inbox supports customer-visible replies, internal-only messages, ticket relationships, and expiring customer conversation links.
- Generate a customer link in the Inbox and share it manually during local testing; outbound email delivery is part of Phase 4.
- Customer conversation links use the configured `PUBLIC_APP_URL` when present, otherwise the request host. Keep it set to the local/development app URL when generating links for testing.
- Customer-visible inbox messages can be sent by email when server-side `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and optionally `SMTP_FROM` are configured. Failed deliveries remain visible with a retry action; the server does not silently record a success when SMTP is unavailable.
- Email replies link back to the existing secure customer conversation page. Inbound email ingestion is not configured; customers reply through that secure page.
- WhatsApp is represented by a provider adapter contract but remains unavailable until an official provider is selected and configured. No unofficial gateway or credentials are included.
- Business members can record inbound/outbound call direction, outcome, duration, phone number, and notes. Call recording is not enabled.
- Attachment upload/storage is deferred in Phase 3; do not attach public file URLs to messages.

Firestore creates collections and fields on first write; there is no SQL migration or destructive migration command. New query indexes are declared in `firestore.indexes.json` and referenced by the safe, feature-specific `firebase.customer-operations.json` config. Before using the new list/search routes, deploy indexes to a **non-production** project with `firebase --config firebase.customer-operations.json deploy --only firestore:indexes --project <dev-project-id>` and wait for index builds to complete. Never target production for local phase work. Client-side Firestore rules remain default-deny.

## Current limitations

- Business membership grants are email-based until a later invitation-claim flow can bind them to Firebase UIDs.
- Email invitation delivery and account claim UX are not implemented.
- Attachments, inbound email ingestion, WhatsApp provider activation, reports, automation, SLA workflows, and external channel integrations are deferred to later phases. Phase 3 customer replies are available through a seven-day, conversation-scoped link; Phase 4 adds configured outbound SMTP delivery.
- Search uses prefix matching on normalized names, emails, companies, subjects, and ticket references; Firestore does not provide full-text substring search.
- Customer identity matching/merging is not automated; entered contact details are not treated as verified identifiers.
- Ticket references are unique per business; duplicate reference strings may exist across businesses.
- The current implementation does not provision businesses from a self-service signup flow.
- Provider credentials are not required for Phase 1.
