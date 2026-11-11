# Customer Operations progress

**Final audit:** all six phases are not complete against the full master prompt. Local implementation/fixture passes are not live acceptance. See [CUSTOMER_OPERATIONS_FINAL_AUDIT.md](CUSTOMER_OPERATIONS_FINAL_AUDIT.md) for missing features, final checks and browser-access findings.


## Current GitHub checkpoint — work in progress

The completion pass following the final audit adds UID-bound invitation claiming and owner binding, narrower Google sign-in scopes for Customer Operations, message idempotency and optimistic concurrency, five-second inbox refresh, explicit many-to-many ticket links, private attachment upload/download boundaries, separate platform support tickets/knowledge/reports, business team APIs, scheduled SLA job boundaries, and signed Meta/Resend webhook integration code. It also fixes actual business role values being replaced with display labels before UI permission checks.

This is a **work-in-progress snapshot**, not a completion or production-security claim. The existing 15 tests, type check and build pass; the newly added flows still need expanded integration tests and real Firebase/provider acceptance. The original audit below describes the earlier checkpoint and is superseded where the new code now supplies those boundaries.

Firebase emulator CLI installation succeeded, but the official Firestore emulator download is blocked by the cloud network policy at `storage.googleapis.com`. A domain-only draft addition was saved for review; it has not been published or confirmed applied. No new secret values were supplied. Live provider and authenticated end-to-end checks remain blocked/unverified. Nothing has been deployed manually.

New configuration names (values must be entered securely, never committed): `FIREBASE_STORAGE_BUCKET`, `CRON_SECRET`, `CUSTOMER_OPERATIONS_WHATSAPP_CONNECTIONS`, per-connection access-token environment variable names, `META_APP_SECRET`, `META_VERIFY_TOKEN`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`. Existing Firebase, SMTP, owner and canonical app URL configuration still applies. `CUSTOMER_OPERATIONS_LOCAL_JOBS=true` opts a development process into the local scheduler. Emulator use requires a `demo-` project and loopback endpoints and is rejected in production.

## Current phase status

| Phase | Status |
|---|---|
| 1 — Foundation | Implemented upstream; live Firebase identity/access acceptance pending |
| 2 — Customers and Tickets | Implemented upstream; live Firestore lifecycle/index acceptance pending |
| 3 — Unified Inbox and In-App Messaging | Implemented upstream; attachments explicitly deferred |
| 4 — External Channels | Outbound SMTP boundary/retry and call logs implemented upstream; inbound email and official WhatsApp activation pending |
| 5 — Operations | Business operations implemented locally and tested with fixtures; live Firebase acceptance pending |
| 6 — Reporting, AI and Hardening | Business reporting, disconnected AI contract and focused hardening implemented locally; live auth/tenant acceptance and wider release review pending |

Starting branch: `dev`, commit `e4f41749ca9492a36cafab04f2c6f7c1fbfe0b8b`. Phase 5/6 work is local and uncommitted. No push, deployment, destructive migration, production data writes or environment publication was performed.

## Delivered in this work

### Phase 5

- Business Operations navigation with Notifications, Knowledge base, Automation history, Feedback, Rules & SLA and Team.
- Fixed Trigger → Condition → Action rules, up to 20 per business, priority/category conditions, management alerts, assignment to active business members and routing to the existing ticket team label.
- Transactional ticket creation/resolution/reply automation, durable applied/skipped/failed history, automatic Firestore transaction retries and an idempotent manager-controlled failed-assignment retry.
- In-app assignment/management/SLA notifications, per-user read acknowledgements and notification preferences; visible notification panel refreshes every 30 seconds.
- Business resolution SLA in calendar minutes, snapshotted on new/reopened tickets; approaching (15-minute window) and overdue alerts, idempotent cursor-paginated 50-record deadline checks. **Checks are on demand; no autonomous scheduler is installed.**
- Configurable reopen-on-customer-reply policy, retained ticket events and reopen counts; resolved timestamps survive closing a resolved ticket.
- Business articles with categories, prefix search, pagination, draft/published status, author/update metadata and explicit internal/customer visibility. Public customer resources require an existing valid conversation link and never return internal/draft articles.
- Opt-in satisfaction surveys offered once per resolution event on the customer conversation page, immutable feedback with identical-request retry support, 1–5 score, resolution answer and optional comment. No repeated external survey sends.
- Team roster, owner-controlled member role updates/deactivation through existing membership APIs. **Authentication/invitation/UID lifecycle changes are deferred by user direction.**
- Recorded first-response timestamps for linked staff in-app replies and successful outbound email delivery.

### Phase 6

- Owner/manager-only creation-cohort ticket reports with UTC date filters, ticket states, assignment/channel/category breakdowns and recorded response/resolution means with sample counts.
- New Phase 5 SLA/latest-cycle, reopen-rate and survey satisfaction measurements, excluding legacy records without instrumentation. Survey offer cohorts are explicitly distinguished from ticket creation cohorts.
- 90-day / 5,000-ticket or survey report bounds, projected queries excluding message bodies/customer contact data, safe failures, tenant-scope checks and lazy-loaded views.
- Optional AI provider contract and disconnected status; no AI generation endpoint, provider activation or transfer of business data.
- Shared exact business-ID/active membership policy; platform roles remain denied private business data. Customer Operations responses disable caching/referrer propagation.
- Independent customer-message allowlist excludes internal notes, undelivered emails and private provider/staff metadata.

## Validation

| Check | Result |
|---|---|
| `npm run test:customer-operations` | PASS: 15 tests, no skips |
| Rule validation, conditions, transactional rollback/retry, assignment isolation/failure/retry | PASS with in-memory transactional fixtures |
| Survey creation/reopen/history, token/relationship validation, score validation and replay | PASS with fixtures |
| SLA alert deduplication, transaction retries, approaching checks, cross-tenant denial and multi-batch cursor | PASS with fixtures |
| Knowledge visibility, scoped editing, private notification reads/preferences | PASS with fixtures |
| HTTP role/query/report boundaries, failures and unchanged route fallthrough | PASS with identity/store fixtures |
| Recorded SLA/reopen/satisfaction report calculations and legacy exclusion | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS; pre-existing large main-bundle advisory remains; Operations and Reports are lazy chunks |
| Browser Operations fixture | PASS: rule/settings save, assignment retry, article publish/error draft retention, team UI, mobile layout, customer survey and knowledge |
| Browser Reports fixture | PASS again with updated Phase 5 measurements |
| Actual local API gates | PASS: protected Operations/Reports return configuration-required 503; invalid public survey/knowledge tokens return 404 |
| Vite development HMR transport | WARNING: websocket closed before opening; reported separately from browser application assertions |
| Live Firebase token verification, Firestore query/index behavior, real two-business end-to-end acceptance | NOT RUN: configuration/authentication task remains |
| Human UAT, screen reader and production-scale latency | NOT RUN |

The automated store tests model transactions/rollback in memory; they do not establish live Firebase behavior. Browser fixtures intercept requests in the test browser, not server-side authentication. No production authentication bypass is present.

## Configuration, migrations and next work

- Deploy the non-destructive composite indexes in `firestore.indexes.json` to a selected isolated development Firebase project before live acceptance. Firestore is schema-on-write; no SQL migration or backfill was run.
- No new environment variables or provider secrets were introduced. The existing owner/Firebase configuration still applies. Last inspected runtime: `STUDIO_OWNER_EMAIL` absent, `FIREBASE_SERVICE_ACCOUNT` absent, `GOOGLE_APPLICATION_CREDENTIALS` present but development-project access unverified. Never infer usable access from variable presence or ask for credential values in chat.
- Next user-directed task: authentication, invitation claiming/UID binding, role/membership lifecycle and authenticated two-tenant acceptance. Existing grants remain verified-email-based until then.
- Configure/verify existing SMTP and official WhatsApp integration separately; inbound email and attachments remain deferred upstream.
- Add a hosted scheduler before promising unattended SLA alerts. Business hours/pauses, priority-specific SLAs and grouped team membership are not implemented; routing uses existing team labels.
- Platform support tickets and platform knowledge publishing were absent upstream. Business operations do not imply a platform support workflow or automatic platform access to business data.
- Legacy timestamps/counters are not backfilled. Reports disclose their measured cohorts and latest-cycle semantics. AI remains intentionally disconnected pending provider/data-handling approval.
- Full release readiness still requires the live checks above; local fixture results are not a production-readiness claim.

## Changed files (Phase 5 and 6 combined)

- Backend: `server.ts`, `serverStore.ts`, `customerOperationsOperations.ts`, `customerOperationsReporting.ts`, `customerOperationsPrivacy.ts`.
- UI/types: `src/components/CustomerOperationsApp.tsx`, `src/components/CustomerOperationsOperations.tsx`, `src/components/CustomerOperationsFeedback.tsx`, `src/components/CustomerOperationsCustomerConversation.tsx`, `src/components/CustomerOperationsReports.tsx`, `src/types/customerOperations.ts`.
- Validation/config: `tests/customerOperationsOperations.test.ts`, `tests/customerOperationsReporting.test.ts`, `tests/customerOperationsPrivacy.test.ts`, `tests/customerOperationsOperations.browser.mjs`, `tests/customerOperations.browser.mjs`, `firestore.indexes.json`, `package.json`.
- Documentation: the three `CUSTOMER_OPERATIONS_*.md` files. Dependency lockfile unchanged; no new runtime packages.
