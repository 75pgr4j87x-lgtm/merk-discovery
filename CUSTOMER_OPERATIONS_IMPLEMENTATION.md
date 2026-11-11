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
- Attachments, inbound email ingestion and WhatsApp provider activation remain deferred; business reports, automation and SLA workflows are now implemented below. Phase 3 customer replies are available through a seven-day, conversation-scoped link; Phase 4 adds configured outbound SMTP delivery.
- Search uses prefix matching on normalized names, emails, companies, subjects, and ticket references; Firestore does not provide full-text substring search.
- Customer identity matching/merging is not automated; entered contact details are not treated as verified identifiers.
- Ticket references are unique per business; duplicate reference strings may exist across businesses.
- The current implementation does not provision businesses from a self-service signup flow.
- Provider credentials are not required for Phase 1.

## Phase 6 reporting and optional AI

- Access: `/studio/customer-operations` → select an active business → **Reports**, visible to Business Owners and Managers.
- `GET /api/customer-operations/businesses/:businessId/reports?start=YYYY-MM-DD&end=YYYY-MM-DD`: inclusive UTC calendar dates, default last 30 days, at most 90 days. Unknown/repeated filters and invalid dates return 400. More than 5,000 tickets returns 422; choose a narrower range. Backend/index failures return a safe 503. No customer identities, descriptions, notes or message bodies are queried for reports. Assignment summaries contain staff email addresses and are manager/owner-only.
- `GET /api/customer-operations/businesses/:businessId/ai`: reports disconnected status and data-handling requirements. No generation or AI network requests are implemented; no new credentials are required.
- New non-destructive index: `customerOperationsTickets` on `businessId ASC, createdAt ASC`. Deploy the existing `firestore.indexes.json` with the documented non-production index command before authenticated report acceptance. No data migration or backfill is executed.
- Run `npm run test:customer-operations`, `npm run lint`, `npm run build`. Tests use Node's built-in runner with existing tsx; no new runtime dependencies or lockfile changes.
- Report semantics: current states of tickets **created** in the selected period. “Open” includes new/open/in-progress/waiting tickets. Resolved includes resolved/closed. Urgent and unassigned counts include active tickets only. Agent assignments include all cohort tickets, not current all-time workload. Recorded duration means exclude missing/invalid timestamps and show sample counts. Reopened tickets whose resolution timestamp was cleared do not contribute to resolution means. Range queries are not transactional historical snapshots.
- Do not interpret missing first-response timestamps as zero response time. Legacy Phase 2–4 records may lack measurements. Phase 5 now adds SLA, satisfaction and reopen measurements for business reports; platform ticket analytics still lack upstream records.

### Acceptance checks and remaining prerequisites

Local automated tests cover business scope policy (including inactive memberships and platform denial), owner/manager vs agent report access, adversarial date/query filters, result-scope validation, oversized cohorts, database failure handling, empty metrics, recorded durations, safe category keys, disabled AI and customer-message privacy. HTTP tests use injected identity/store fixtures; they do **not** exercise Firebase token verification or actual Firestore queries. No test-only authentication bypass exists in production code.

Before release, use an isolated Firebase project with server credentials, `STUDIO_OWNER_EMAIL`, authorized Google sign-in domains and deployed indexes. Test two actual businesses and a platform identity against every CRUD/list/note/message/call/report route. Verify revoked memberships, suspended businesses, link expiry/revocation, SMTP retries and concurrent changes. Do not use production records for acceptance. Provider delivery tests still require SMTP/official channel configuration from earlier phases. Human UAT and screen-reader evaluation remain required. Security review of the touched boundaries is not certification or legal compliance.

The optional browser fixture runner is `tests/customerOperations.browser.mjs`. With the dev server running and Playwright plus system Chromium available, run `PLAYWRIGHT_MODULE=/workspace/.onboarding-tools/node_modules/playwright/index.mjs TEST_BASE_URL=http://127.0.0.1:3000 node tests/customerOperations.browser.mjs` in this cloud environment. Else set `PLAYWRIGHT_MODULE` to your installed Playwright module or let it resolve `playwright`. The runner intercepts a test-only HTML page and report/AI responses in the browser; it renders the actual report component with fixture identity and data, never changes server auth, and finally checks the real app sign-in gate. It explicitly reports Vite HMR transport warnings separately from application errors. This is UI acceptance with fixtures, not live tenant-data acceptance.

## Phase 5 usage and routes

Open `/studio/customer-operations`, select a business, then **Operations**. Owners/managers configure Rules & SLA; staff use Notifications, Knowledge base and Team. Team grants/role changes/deactivation use the existing owner-only membership endpoints; email invitation delivery, UID binding and authentication changes are intentionally deferred to the next task.

All routes below are relative to `/api/customer-operations/businesses/:businessId/operations`:

| Method / path | Behavior |
|---|---|
| GET / PUT `settings` | Owner/manager business SLA, reopen policy, survey prompt and up to 20 rules |
| GET `articles` | Staff list, title prefix search with `search`, opaque `cursor` pagination |
| POST `articles`, PUT `articles/:id` | Owner/manager create/edit, draft/published and internal/customer visibility |
| GET `notifications` | Only caller's assignment alerts and, for managers, management alerts |
| POST `notifications/:id/read` | Caller-specific read acknowledgement |
| GET / PUT `preferences` | Caller-specific in-app notification visibility; history retained |
| GET `automationRuns` | Owner/manager execution history with results, errors and cursor |
| POST `automationRuns/:id/retry` | Retry a failed assignment safely once its target is valid; repeat requests reuse the result |
| GET `surveys` | Owner/manager survey/feedback records with cursor |
| POST `check-deadlines` | Owner/manager explicit 50-record SLA check; pass returned `nextCursor` as body `cursor` to continue |

Settings have `slaMinutes`, `reopenOnReply`, `surveyEnabled`, `surveyPrompt`, `rules`. Rules require distinct `id`, `name`, `enabled`, `trigger` (`created`, `resolved`, `customer_reply`, `sla_due`), optional exact `priority`/`category` conditions, `action` (`notify`, `assign`, `route_team`) and `target` (agent email or team label). Notifications target managers; assignment validates active tenant membership. Team routing sets the ticket's existing team label; it does not create team membership groups. The first valid assignment wins because later assignment rules skip assigned tickets. Failed assignments are visible and retryable; transaction/transient retries do not duplicate effects. Removing a rule does not erase its run history.

Customer resources reuse the existing `X-Customer-Conversation-Token` header and seven-day conversation link. `GET /api/customer-operations/public/knowledge` returns at most 50 published customer-visible articles for that conversation's business, never internal/draft text. `GET /api/customer-operations/public/survey` returns the active linked-ticket survey; `POST` accepts `{score: 1..5, resolved: boolean, comment: string}`. Customers cannot supply business/ticket/survey IDs. Feedback is immutable after submission except identical retries. No extra customer login or token system is introduced.

Deploy the added SLA (`businessId`, `slaDueAt`, document name), notification (`audience`, `createdAt`, document name), and customer knowledge (`status`, `visibility`, `titleSearch`) composite indexes from `firestore.indexes.json` to an isolated development project using the existing documented Firebase index command. Other nested collection date queries use automatic single-field indexes. Firestore is schema-on-write; no destructive migration/backfill is required or run. Old tickets only acquire new instrumentation through applicable future lifecycle operations. No new environment variables or provider credentials are needed beyond existing Firebase/owner setup.

Run `npm run test:customer-operations`, `npm run lint`, `npm run build`. For optional UI fixtures with the dev server running, use the same `PLAYWRIGHT_MODULE` / `TEST_BASE_URL` settings documented above with `node tests/customerOperationsOperations.browser.mjs`. Unit/store tests model Firestore transactions and rollback in memory; browser tests intercept only browser requests. These do not replace live Firebase/index/authentication acceptance.


## Work-in-progress completion checkpoint

See the current checkpoint section in `CUSTOMER_OPERATIONS_PROGRESS.md` before using the older phase notes. New invitation claims bind business/platform memberships to Firebase UIDs; email-only grants no longer authorize Customer Operations access. Initial business owner access requires the newly returned private invitation link. The first verified platform-owner login binds the owner UID; changing that identity requires deliberate server-side recovery. This behavior must be verified against an isolated Firebase project before deployment.

New message POSTs require an `Idempotency-Key` header. Staff replies also require `expectedUpdatedAt` from the loaded conversation. Private attachments currently accept PNG, JPEG, GIF, WebP and PDF, at most 2 MB each and eight per message. Downloads are authenticated server responses rather than public object URLs. Storage rules remain default-deny. End-to-end storage validation is pending.

Official Meta WhatsApp connections are server-configured via `CUSTOMER_OPERATIONS_WHATSAPP_CONNECTIONS`, an array of `{businessId, phoneNumberId, accessTokenEnv, templates?}`. The referenced token variables, `META_APP_SECRET`, and a 32+ character `META_VERIFY_TOKEN` are server-only. Webhooks use `/api/customer-operations/webhooks/whatsapp`; email ingestion uses `/api/customer-operations/webhooks/email` with Resend/Svix signatures and `RESEND_API_KEY` / `RESEND_WEBHOOK_SECRET`. These integrations are not connected or live-tested. Current incoming external media/attachment support is incomplete; text ingestion is implemented and unsupported media is rejected explicitly.

`CRON_SECRET` (32+ characters) authorizes `/api/customer-operations/jobs`. The Vercel configuration proposes a five-minute cron; the hosting plan must support that schedule. Saving code does not provision cron or credentials. Local development jobs run only when `CUSTOMER_OPERATIONS_LOCAL_JOBS=true`. No scheduler has been deployed.

The safe `firebase.emulators.json` configuration uses project `demo-merk-ops`, Auth port 9099, Firestore 8080 and Storage 9199 on loopback. Official emulator binaries must be downloaded with normal checksum/TLS verification. The cloud policy currently blocks that download; do not disable TLS or substitute unverified binaries. Browser emulator mode additionally requires Vite development mode, `VITE_USE_FIREBASE_EMULATORS=true` and `VITE_FIREBASE_PROJECT_ID=demo-merk-ops`.
